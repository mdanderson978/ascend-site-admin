import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { backfillMedia, copyFallbacks, createVariants, mediaPaths, needsVariants, pruneMedia, readManifest } from '../media.mjs';
import { MEDIA_SETTINGS, ladderFor, mediaResolver, renderLayout, uploadNameFromSrc } from '../elements/index.mjs';
import { startAdmin } from '../index.mjs';

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-media-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['src/content/pages', 'src/assets/uploads', 'public/documents']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/pages/home.md'), '---\ntitle: Home\n---\nHi\n');
  return root;
}

// A photo-like image (gradient + shapes) so the encoder has real detail.
async function photo(width, height, hue = 200, { orientation } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,40%)"/><stop offset="1" stop-color="hsl(${hue + 60},70%,70%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width / 3}" cy="${height / 2}" r="${height / 4}" fill="#fff" opacity=".6"/></svg>`;
  let img = sharp(Buffer.from(svg)).jpeg({ quality: 90 });
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}

async function upload(root, name, width, height, hue) {
  const file = path.join(mediaPaths(root).uploads, name);
  fs.writeFileSync(file, await sharp(await photo(width, height, hue)).webp({ quality: 82 }).toBuffer());
  return file;
}

const avifFiles = root => (fs.existsSync(mediaPaths(root).media) ? fs.readdirSync(mediaPaths(root).media).filter(f => f.endsWith('.avif')).sort() : []);

test('the width ladder is capped at the master, never upscaled', () => {
  assert.deepEqual(ladderFor(2400), [400, 800, 1200, 1600, 1920]);
  assert.deepEqual(ladderFor(1920), [400, 800, 1200, 1600, 1920]);
  assert.deepEqual(ladderFor(1200), [400, 800, 1200]);
  assert.deepEqual(ladderFor(1000), [400, 800, 1000]);
  assert.deepEqual(ladderFor(300), [300]);
  assert.deepEqual(ladderFor(0), []);
  assert.equal(uploadNameFromSrc('../../assets/uploads/123-deck.webp'), '123-deck.webp');
  assert.equal(uploadNameFromSrc({ src: '../../assets/uploads/a%20b.webp', alt: 'x' }), 'a b.webp');
  assert.equal(uploadNameFromSrc('/images/elsewhere.webp'), null);
});

test('createVariants writes the AVIF ladder and a manifest entry from the stored upload', async t => {
  const root = repo(t);
  await upload(root, '100-deck.webp', 1800, 1200, 30);
  const entry = await createVariants(root, '100-deck.webp');
  assert.equal(entry.width, 1800);
  assert.equal(entry.height, 1200);
  assert.deepEqual(entry.widths, [400, 800, 1200, 1600, 1800]);
  assert.match(entry.hash, /^[0-9a-f]{8}$/);
  assert.deepEqual(avifFiles(root), entry.widths.map(w => `100-deck-${entry.hash}-${w}.avif`).sort());
  for (const w of entry.widths) {
    const meta = await sharp(fs.readFileSync(path.join(mediaPaths(root).media, `100-deck-${entry.hash}-${w}.avif`))).metadata();
    assert.equal(meta.format, 'heif');
    assert.equal(meta.width, w);
    assert.equal(meta.height, Math.round((1200 * w) / 1800));
  }
  const manifest = readManifest(root);
  assert.deepEqual(manifest.entries['100-deck.webp'], entry);
  assert.equal(manifest.settings.avifQuality, MEDIA_SETTINGS.avifQuality);
  assert.equal(needsVariants(root, '100-deck.webp'), false);
});

test('encoding from the original photo matches the master crop and honours EXIF orientation', async t => {
  const root = repo(t);
  // A 3000x2000 photo stored with "rotate 90" displays as 2000x3000 (portrait).
  const original = await photo(3000, 2000, 120, { orientation: 6 });
  const resize = { width: 1200, height: 900, fit: 'cover' };
  fs.writeFileSync(path.join(mediaPaths(root).uploads, 'hero.webp'), await sharp(original).rotate().resize(resize).webp().toBuffer());
  const entry = await createVariants(root, 'hero.webp', { source: original, resize });
  assert.deepEqual([entry.width, entry.height], [1200, 900], 'same crop as the master');
  const big = await sharp(fs.readFileSync(path.join(mediaPaths(root).media, `hero-${entry.hash}-1200.avif`))).metadata();
  assert.deepEqual([big.width, big.height], [1200, 900]);
});

test('backfill encodes only what needs it, re-encodes changed uploads and is idempotent', async t => {
  const root = repo(t);
  await upload(root, 'a.webp', 1600, 1000, 10);
  await upload(root, 'b.webp', 900, 600, 250);
  fs.writeFileSync(path.join(mediaPaths(root).uploads, '.gitkeep'), '');
  fs.writeFileSync(path.join(mediaPaths(root).uploads, 'notes.txt'), 'not an image');

  const first = await backfillMedia(root);
  assert.deepEqual(first.encoded.sort(), ['a.webp', 'b.webp']);
  const manifestFile = mediaPaths(root).manifest;
  const snapshot = fs.readFileSync(manifestFile, 'utf8');

  const second = await backfillMedia(root);
  assert.deepEqual(second.encoded, [], 'nothing to do the second time');
  assert.equal(fs.readFileSync(manifestFile, 'utf8'), snapshot, 'manifest unchanged byte-for-byte');

  // Replacing an upload's file changes its fingerprint: re-encoded, old set removed.
  const oldHash = readManifest(root).entries['a.webp'].hash;
  await upload(root, 'a.webp', 1600, 1000, 300);
  assert.equal(needsVariants(root, 'a.webp'), true);
  const third = await backfillMedia(root);
  assert.deepEqual(third.encoded, ['a.webp']);
  const newHash = readManifest(root).entries['a.webp'].hash;
  assert.notEqual(newHash, oldHash);
  assert.ok(!avifFiles(root).some(f => f.includes(oldHash)), 'old fingerprint files are gone');

  // A missing variant file is detected and restored.
  fs.unlinkSync(path.join(mediaPaths(root).media, `b-${readManifest(root).entries['b.webp'].hash}-400.avif`));
  assert.deepEqual((await backfillMedia(root)).encoded, ['b.webp']);
});

test('an upload and its AVIF set are pruned together; strays go after a grace period', async t => {
  const root = repo(t);
  await upload(root, 'keep.webp', 800, 600, 20);
  await upload(root, 'gone.webp', 800, 600, 90);
  await upload(root, 'gone-but-similar-name.webp', 800, 600, 160);
  await backfillMedia(root);
  fs.unlinkSync(path.join(mediaPaths(root).uploads, 'gone.webp'));
  const stray = path.join(mediaPaths(root).media, 'orphan-0123abcd-400.avif');
  const fresh = path.join(mediaPaths(root).media, 'uploading-0123abcd-400.avif');
  fs.writeFileSync(stray, 'x');
  fs.writeFileSync(fresh, 'x');
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(stray, old, old);

  const removed = await pruneMedia(root);
  const { entries } = readManifest(root);
  assert.deepEqual(Object.keys(entries).sort(), ['gone-but-similar-name.webp', 'keep.webp']);
  assert.ok(removed.some(f => f.startsWith('gone-') && !f.startsWith('gone-but')), 'the removed upload took its set with it');
  assert.ok(avifFiles(root).some(f => f.startsWith('gone-but-similar-name-')), 'a different upload with a similar name is untouched');
  assert.ok(removed.includes('orphan-0123abcd-400.avif'));
  assert.ok(fs.existsSync(fresh), 'a file younger than the grace period is left alone');
});

test('copyFallbacks copies uploads under fingerprinted names (a copy, never an encode)', async t => {
  const root = repo(t);
  const file = await upload(root, '7-photo.webp', 800, 500, 60);
  const { entries } = readManifest(root);
  assert.deepEqual(entries, {});
  await backfillMedia(root);
  const out = path.join(root, 'dist', 'media');
  assert.equal(copyFallbacks(root, out), 1);
  const hash = readManifest(root).entries['7-photo.webp'].hash;
  assert.deepEqual(fs.readFileSync(path.join(out, `7-photo-${hash}.webp`)), fs.readFileSync(file));
});

test('the manifest drives the renderer: AVIF srcset plus the fingerprinted fallback', async t => {
  const root = repo(t);
  await upload(root, '5-deck.webp', 1600, 1200, 30);
  await backfillMedia(root);
  const manifest = readManifest(root);
  const hash = manifest.entries['5-deck.webp'].hash;
  const layout = { children: [{ type: 'section', children: [{ type: 'image', props: { image: '../../assets/uploads/5-deck.webp', alt: 'A deck' } }] }] };

  const built = await renderLayout(layout, { resolveImage: mediaResolver(manifest) });
  assert.deepEqual(built.problems, []);
  assert.match(built.html, new RegExp(`srcset="/media/5-deck-${hash}-400\\.avif 400w, .*/media/5-deck-${hash}-1600\\.avif 1600w"`));
  assert.match(built.html, new RegExp(`src="/media/5-deck-${hash}\\.webp" alt="A deck" width="1600" height="1200"`));

  const preview = await renderLayout(layout, { mode: 'preview', resolveImage: mediaResolver(manifest, { fallbackUrl: name => `/api/preview?p=${encodeURIComponent('src/assets/uploads/' + name)}` }) });
  assert.match(preview.html, /src="\/api\/preview\?p=src%2Fassets%2Fuploads%2F5-deck\.webp"/);

  const missing = await renderLayout({ children: [{ type: 'section', children: [{ type: 'image', props: { image: '../../assets/uploads/nope.webp', alt: 'x' } }] }] }, { resolveImage: mediaResolver(manifest) });
  assert.ok(missing.problems.some(p => /couldn't be found/.test(p.message)));
});

async function adminWith(t, root, port, extra = {}) {
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  const server = startAdmin({
    root, port, pullOnStart: false, siteTitle: 'Fixture', developerName: 'Dev', developerEmail: 'dev@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }] }, ...extra,
  });
  t.after(() => new Promise(resolve => (server.listening ? server.close(resolve) : resolve())));
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function postUpload(base, buffer, imageType = 'hero') {
  const fd = new FormData();
  fd.append('imageType', imageType);
  fd.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'Phone Photo.jpg');
  return (await fetch(base + '/api/upload/image', { method: 'POST', headers: { Origin: base }, body: fd })).json();
}

test('with media on, an upload gets its AVIF set immediately; phone photos are no longer saved sideways', async t => {
  const root = repo(t);
  // A preset with no fixed height keeps the photo's shape, isolating orientation.
  const base = await adminWith(t, root, 4493, { media: { avif: true }, imageSizes: { free: { maxWidth: 1200, label: 'any shape' } } });
  const json = await postUpload(base, await photo(2400, 1600, 40, { orientation: 6 }), 'free');
  assert.equal(json.error, undefined);
  const master = await sharp(fs.readFileSync(path.join(mediaPaths(root).uploads, json.name))).metadata();
  assert.ok(master.height > master.width, `portrait photo stays portrait (got ${master.width}x${master.height})`);
  const entry = readManifest(root).entries[json.name];
  assert.ok(entry, 'manifest entry written during the upload');
  assert.deepEqual([entry.width, entry.height], [master.width, master.height]);
  assert.equal(avifFiles(root).length, entry.widths.length);
});

test('with media off (the default), uploads behave exactly as before and nothing is written to public/media', async t => {
  const root = repo(t);
  const base = await adminWith(t, root, 4494);
  const json = await postUpload(base, await photo(1600, 1000, 80));
  assert.equal(json.error, undefined);
  assert.ok(fs.existsSync(path.join(mediaPaths(root).uploads, json.name)));
  assert.equal(fs.existsSync(mediaPaths(root).media), false);
});
