// Sample images for the playground, encoded the way V3 encodes uploads:
// AVIF at a fixed width ladder (quality ~50) plus one WebP fallback at the
// largest width, with fingerprinted names. This is an early prototype of
// phase 1 part 2 (encode at upload); the real one will live in the engine.
//
// By default the five sample images are drawn procedurally (no third-party
// photos in the repo). Pass a folder of real photos to see real AVIF sizes;
// those files are read in place and never copied into the repo.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

export const LADDER = [400, 800, 1200, 1600, 1920];
export const AVIF_QUALITY = 50;
export const WEBP_QUALITY = 82;
export const SAMPLE_NAMES = ['hero', 'feature', 'detail', 'portrait', 'wide'];

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// Simple scenes with real gradients and edges, so the encoder has something
// photo-like to work on.
const SCENES = {
  hero: () =>
    svg(2400, 1350, `
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3a67"/><stop offset=".55" stop-color="#e98a5a"/><stop offset="1" stop-color="#f7c873"/></linearGradient>
      <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d5a80"/><stop offset="1" stop-color="#1b263b"/></linearGradient></defs>
      <rect width="2400" height="1350" fill="url(#s)"/><circle cx="1650" cy="760" r="170" fill="#fde2a7" opacity=".95"/>
      <rect y="820" width="2400" height="530" fill="url(#w)"/>
      <path d="M0 880 L380 640 L700 860 L1050 600 L1500 880 Z" fill="#22304f"/>
      <path d="M0 1350 L0 1000 L2400 1080 L2400 1350 Z" fill="#7a5134"/>
      ${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 175}" y="${1040 + i * 3}" width="168" height="320" fill="${i % 2 ? '#8b5e3c' : '#7a5134'}"/>`).join('')}`),
  feature: () =>
    svg(1800, 1200, `
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5fc"/><stop offset="1" stop-color="#e0f0ff"/></linearGradient></defs>
      <rect width="1800" height="1200" fill="url(#s)"/>
      <path d="M0 760 Q450 600 900 740 T1800 700 L1800 1200 L0 1200 Z" fill="#6a994e"/>
      <path d="M0 900 Q600 820 1200 900 T1800 880 L1800 1200 L0 1200 Z" fill="#386641"/>
      <rect x="620" y="520" width="560" height="340" fill="#f2e8cf"/><path d="M580 540 L900 330 L1220 540 Z" fill="#bc4749"/>
      <rect x="840" y="680" width="120" height="180" fill="#5c4033"/><rect x="680" y="600" width="110" height="90" fill="#a8dadc"/><rect x="1010" y="600" width="110" height="90" fill="#a8dadc"/>`),
  detail: () =>
    svg(1600, 1600, `
      ${Array.from({ length: 10 }, (_, i) => `<rect x="0" y="${i * 160}" width="1600" height="152" fill="hsl(${24 + (i % 3) * 4},${45 + (i % 4) * 5}%,${34 + (i % 5) * 3}%)"/>`).join('')}
      ${Array.from({ length: 40 }, (_, i) => `<path d="M${(i * 97) % 1600} ${(i * 53) % 1600} q120 ${12 + (i % 7)} 240 0" stroke="rgba(40,20,10,.35)" stroke-width="3" fill="none"/>`).join('')}
      ${Array.from({ length: 10 }, (_, i) => `<rect x="${(i * 337) % 1500 + 40}" y="${i * 160 + 70}" width="10" height="10" rx="5" fill="#2b2b2b"/>`).join('')}`),
  portrait: () =>
    svg(1200, 1500, `
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdb4db"/><stop offset="1" stop-color="#ffe5d9"/></linearGradient></defs>
      <rect width="1200" height="1500" fill="url(#s)"/><rect y="1180" width="1200" height="320" fill="#588157"/>
      <rect x="560" y="760" width="80" height="440" fill="#6f4e37"/><circle cx="600" cy="640" r="260" fill="#3a5a40"/><circle cx="470" cy="740" r="170" fill="#344e41"/><circle cx="740" cy="720" r="190" fill="#344e41"/>`),
  wide: () =>
    svg(2000, 1125, `
      <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f2027"/><stop offset=".5" stop-color="#203a43"/><stop offset="1" stop-color="#2c5364"/></linearGradient></defs>
      <rect width="2000" height="1125" fill="url(#s)"/>
      ${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 125 + 10}" y="${520 - ((i * 73) % 260)}" width="110" height="${605 + ((i * 73) % 260)}" fill="hsl(200,25%,${14 + (i % 4) * 4}%)"/>`).join('')}
      ${Array.from({ length: 60 }, (_, i) => `<rect x="${(i * 131) % 1950 + 20}" y="${(i * 89) % 500 + 560}" width="14" height="20" fill="#ffd166" opacity="${0.4 + (i % 5) / 10}"/>`).join('')}`),
};

function findPhotos(dir) {
  return fs
    .readdirSync(dir)
    .filter(f => /\.(jpe?g|png|webp|avif|tiff?)$/i.test(f))
    .sort()
    .slice(0, SAMPLE_NAMES.length)
    .map(f => path.join(dir, f));
}

/**
 * Encodes the sample set (cached across runs by content fingerprint).
 * Returns { manifest: Map(name -> resolveImage result), files: Map(filename -> path), report }.
 */
export async function prepareMedia({ photosDir = null, cacheDir = path.join(os.tmpdir(), 'ascend-elements-playground') } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const photos = photosDir ? findPhotos(photosDir) : [];
  if (photosDir && !photos.length) throw new Error(`No photos (.jpg, .png, .webp, .avif) found in ${photosDir}`);

  const manifest = new Map();
  const files = new Map();
  const report = [];

  for (const [i, name] of SAMPLE_NAMES.entries()) {
    const photo = photos.length ? photos[i % photos.length] : null;
    const source = photo ? fs.readFileSync(photo) : Buffer.from(SCENES[name]());
    const hash = crypto.createHash('sha1').update(source).digest('hex').slice(0, 6);
    const meta = await sharp(source).rotate().metadata();
    // rotate() applies EXIF orientation; swap dimensions for 90/270 degree photos.
    const swapped = (meta.orientation || 1) >= 5;
    const srcWidth = swapped ? meta.height : meta.width;
    const srcHeight = swapped ? meta.width : meta.height;
    const maxWidth = Math.min(srcWidth, LADDER[LADDER.length - 1]);
    const widths = [...new Set([...LADDER.filter(w => w < maxWidth), maxWidth])];
    const height = Math.round((srcHeight * maxWidth) / srcWidth);

    const avif = [];
    const started = Date.now();
    let encoded = false;
    for (const w of widths) {
      const file = `${name}-${hash}-${w}.avif`;
      const out = path.join(cacheDir, file);
      if (!fs.existsSync(out)) {
        await sharp(source).rotate().resize({ width: w }).avif({ quality: AVIF_QUALITY }).toFile(out);
        encoded = true;
      }
      files.set(file, out);
      avif.push({ url: `/media/${file}`, width: w, bytes: fs.statSync(out).size });
    }
    const fallbackFile = `${name}-${hash}.webp`;
    const fallbackOut = path.join(cacheDir, fallbackFile);
    if (!fs.existsSync(fallbackOut)) {
      await sharp(source).rotate().resize({ width: maxWidth }).webp({ quality: WEBP_QUALITY }).toFile(fallbackOut);
      encoded = true;
    }
    files.set(fallbackFile, fallbackOut);

    manifest.set(name, { width: maxWidth, height, avif: avif.map(({ url, width }) => ({ url, width })), fallback: { url: `/media/${fallbackFile}` } });
    report.push({
      name,
      source: photo ? path.basename(photo) : 'generated sample',
      sourceBytes: photo ? source.length : null,
      width: maxWidth,
      height,
      avif,
      webpBytes: fs.statSync(fallbackOut).size,
      encodeMs: encoded ? Date.now() - started : 0,
    });
  }
  return { manifest, files, report };
}
