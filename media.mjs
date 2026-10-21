// Media encoding: Node half (see elements/media.mjs for the shared rules).
//
// For each upload in src/assets/uploads/, an AVIF width ladder is written to
// public/media/ and recorded in public/media/manifest.json, all committed
// with the content. Builds never encode images: the site build only copies
// each upload into place as the WebP fallback (copyFallbacks). Encoding at
// upload time, from the original photo, gives better quality than
// re-encoding the stored WebP and keeps every publish fast.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MEDIA_SETTINGS, avifFileName, fallbackFileName, ladderFor, uploadBase } from './elements/media.mjs';

const RASTER = /\.(webp|jpe?g|png|avif|tiff?)$/i;

export function mediaPaths(root) {
  return {
    uploads: path.join(root, 'src', 'assets', 'uploads'),
    media: path.join(root, 'public', 'media'),
    manifest: path.join(root, 'public', 'media', 'manifest.json'),
  };
}

export function readManifest(root) {
  const { manifest } = mediaPaths(root);
  try {
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return { settings: data.settings || {}, entries: data.entries || {} };
  } catch {
    return { settings: {}, entries: {} };
  }
}

// Stable output (sorted keys) so a commit only shows what really changed.
function writeManifest(root, manifest) {
  const { media, manifest: file } = mediaPaths(root);
  fs.mkdirSync(media, { recursive: true });
  const entries = Object.fromEntries(Object.keys(manifest.entries).sort().map(k => [k, manifest.entries[k]]));
  const out = { settings: { ...MEDIA_SETTINGS, ladder: [...MEDIA_SETTINGS.ladder] }, entries };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
}

// One manifest writer at a time within this process (two uploads finishing
// together must not overwrite each other's entries).
let queue = Promise.resolve();
function serial(task) {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

const fingerprint = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);

function removeVariants(mediaDir, uploadName, keepHash = null) {
  if (!fs.existsSync(mediaDir)) return [];
  const prefix = `${uploadBase(uploadName)}-`;
  const removed = [];
  for (const file of fs.readdirSync(mediaDir)) {
    if (!file.startsWith(prefix) || !file.endsWith('.avif')) continue;
    const rest = file.slice(prefix.length);
    if (!/^[0-9a-f]{8}-\d+\.avif$/.test(rest)) continue; // another upload whose name merely starts the same
    if (keepHash && rest.startsWith(`${keepHash}-`)) continue;
    fs.unlinkSync(path.join(mediaDir, file));
    removed.push(file);
  }
  return removed;
}

/**
 * Encodes the AVIF ladder for one upload and records it in the manifest.
 *   source  the original upload bytes (best quality); defaults to the stored master
 *   resize  the sharp resize options the master was made with, so the AVIF
 *           crop matches it exactly; ignored when encoding from the master
 * Returns the manifest entry.
 */
export function createVariants(root, uploadName, { source = null, resize = null } = {}) {
  return serial(async () => {
    const paths = mediaPaths(root);
    const master = path.join(paths.uploads, uploadName);
    if (!RASTER.test(uploadName) || !fs.existsSync(master)) throw new Error(`No raster upload named ${uploadName}`);
    // Always hand sharp bytes, never a path: given a path, libvips keeps the
    // file open in its cache, and on Windows that blocks the upload from being
    // replaced or pruned later (EBUSY/EPERM).
    const masterBytes = fs.readFileSync(master);
    const hash = fingerprint(masterBytes);

    // Decode once to raw pixels with the same orientation and crop as the master.
    const pipeline = source ? sharp(source).rotate().resize(resize || { width: 1920, withoutEnlargement: true }) : sharp(masterBytes).rotate();
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };

    fs.mkdirSync(paths.media, { recursive: true });
    const widths = ladderFor(info.width);
    for (const width of widths) {
      const out = path.join(paths.media, avifFileName(uploadName, hash, width));
      if (fs.existsSync(out)) continue;
      fs.writeFileSync(out, await sharp(data, raw).resize({ width }).avif({ quality: MEDIA_SETTINGS.avifQuality }).toBuffer());
    }
    removeVariants(paths.media, uploadName, hash);

    const manifest = readManifest(root);
    const previous = manifest.entries[uploadName];
    const entry = { hash, width: info.width, height: info.height, widths, v: MEDIA_SETTINGS.version };
    if (previous?.focal && previous.hash === hash) entry.focal = previous.focal;
    manifest.entries[uploadName] = entry;
    writeManifest(root, manifest);
    return entry;
  });
}

/** True when an upload has no usable, current AVIF set. */
export function needsVariants(root, uploadName, manifest = readManifest(root)) {
  const paths = mediaPaths(root);
  const entry = manifest.entries[uploadName];
  if (!entry || entry.v !== MEDIA_SETTINGS.version) return true;
  const master = path.join(paths.uploads, uploadName);
  if (!fs.existsSync(master) || fingerprint(fs.readFileSync(master)) !== entry.hash) return true;
  if (entry.widths.join(',') !== ladderFor(entry.width).join(',')) return true;
  return entry.widths.some(w => !fs.existsSync(path.join(paths.media, avifFileName(uploadName, entry.hash, w))));
}

/**
 * Encodes every upload that lacks a current AVIF set (new, changed, or made
 * with old settings). Safe to re-run: up-to-date uploads are skipped.
 */
export async function backfillMedia(root, { log = () => {} } = {}) {
  const { uploads } = mediaPaths(root);
  const names = fs.existsSync(uploads) ? fs.readdirSync(uploads).filter(n => RASTER.test(n) && !n.startsWith('.')).sort() : [];
  const done = [];
  for (const [i, name] of names.entries()) {
    if (!needsVariants(root, name)) continue;
    const started = Date.now();
    await createVariants(root, name);
    done.push(name);
    log(`  [${i + 1}/${names.length}] ${name} (${Date.now() - started} ms)`);
  }
  await serial(async () => {}); // let the last manifest write land
  return { encoded: done, total: names.length };
}

/**
 * Removes AVIF sets whose upload no longer exists, and stray AVIF files no
 * entry refers to (older than `minAgeMs`, so an upload mid-encode is safe).
 * An upload and its set are always removed together.
 */
export function pruneMedia(root, { minAgeMs = 10 * 60 * 1000 } = {}) {
  return serial(async () => {
    const paths = mediaPaths(root);
    if (!fs.existsSync(paths.media)) return [];
    const manifest = readManifest(root);
    const removed = [];
    for (const name of Object.keys(manifest.entries)) {
      if (fs.existsSync(path.join(paths.uploads, name))) continue;
      removed.push(...removeVariants(paths.media, name));
      delete manifest.entries[name];
    }
    const wanted = new Set(Object.entries(manifest.entries).flatMap(([name, e]) => e.widths.map(w => avifFileName(name, e.hash, w))));
    for (const file of fs.readdirSync(paths.media)) {
      if (!file.endsWith('.avif') || wanted.has(file)) continue;
      const full = path.join(paths.media, file);
      if (Date.now() - fs.statSync(full).mtimeMs < minAgeMs) continue;
      fs.unlinkSync(full);
      removed.push(file);
    }
    writeManifest(root, manifest);
    return removed;
  });
}

/**
 * Build step: copies each upload in the manifest to `outDir` under its
 * fingerprinted fallback name. A file copy, never an encode. Returns the count.
 */
export function copyFallbacks(root, outDir) {
  const { uploads } = mediaPaths(root);
  const { entries } = readManifest(root);
  fs.mkdirSync(outDir, { recursive: true });
  let copied = 0;
  for (const [name, entry] of Object.entries(entries)) {
    const from = path.join(uploads, name);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(outDir, fallbackFileName(name, entry.hash)));
    copied++;
  }
  return copied;
}
