// Regression net for the engine's file-semantics guarantees: save merge
// behavior, upload pipeline, orphan pruning, and the cross-origin write
// guard. Every test here encodes a promise that at least one production site
// silently depends on — see the comment on each.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { startAdmin } from '../index.mjs';

// libvips caches open file handles, which on Windows makes the temp-dir
// cleanup race an EBUSY. Tests read/write few images; the cache buys nothing.
sharp.cache(false);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-test-'));
  fs.mkdirSync(path.join(root, 'src/content/pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/assets/uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/documents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/pages/home.md'), '---\ntitle: Home\ncount: 2\n---\nWelcome\n');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

const BASE_FIELDS = {
  'pages/home': [
    { name: 'title',    label: 'Title',    type: 'text', required: true },
    { name: 'count',    label: 'Count',    type: 'number' },
    { name: 'featured', label: 'Featured', type: 'boolean' },
    { name: 'body',     label: 'Body',     type: 'markdown' },
  ],
};

function boot(root, port, extra = {}) {
  return startAdmin({
    root,
    port,
    pullOnStart: false,
    siteTitle: 'Fixture Site',
    developerName: 'Test Developer',
    developerEmail: 'developer@example.invalid',
    fields: BASE_FIELDS,
    ...extra,
  });
}

async function ready(server) {
  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  }
  return `http://127.0.0.1:${server.address().port}`;
}

const shutdown = server => server.listening && new Promise(r => server.close(r));

// ── Save merge semantics ────────────────────────────────────────────────────

// Frontmatter keys the admin does not manage (language wiring, listing flags,
// anything developer-owned) MUST survive a client save untouched. Sites hide
// plumbing fields from FIELDS on the strength of this exact guarantee — if it
// breaks, saves silently strip those keys and pages break with no error.
test('save preserves frontmatter keys that are not in FIELDS', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'src/content/pages/home.md'),
    '---\ntitle: Home\nlang: zh\nlang_alt_slug: /home-en\n---\nWelcome\n',
  );
  const server = boot(root, 4414);
  try {
    const base = await ready(server);
    const res = await fetch(base + '/api/content/pages/home', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { title: 'New Title' }, body: 'Welcome' }),
    });
    assert.equal(res.status, 200);
    const saved = fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf-8');
    assert.match(saved, /title: New Title/);
    assert.match(saved, /lang: zh/, 'unmanaged key `lang` must survive the save');
    assert.match(saved, /lang_alt_slug: \/home-en/, 'unmanaged key `lang_alt_slug` must survive the save');
  } finally { await shutdown(server); }
});

// Clearing a field drops its key from the .md entirely (falling back to the
// template default / zod .optional()) — but `false` is a real value, not a
// cleared one. Getting this wrong either leaves `key: ''` YAML that fails
// zod, or makes checkboxes impossible to untick.
test('save drops cleared fields but keeps explicit false', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = boot(root, 4415);
  try {
    const base = await ready(server);
    const res = await fetch(base + '/api/content/pages/home', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { title: 'Home', count: '', featured: false }, body: 'Welcome' }),
    });
    assert.equal(res.status, 200);
    const saved = fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf-8');
    assert.doesNotMatch(saved, /count:/, 'cleared field must have its key removed');
    assert.match(saved, /featured: false/, 'false is a value, not a cleared field');
  } finally { await shutdown(server); }
});

// Number fields must land in the YAML as real numbers whatever the client
// typed — "$14,300" included — because the site's zod schema coerces but the
// admin's own validation runs first, and a string that survives to YAML as
// a quoted value has broken builds before.
test('save coerces number fields, currency formatting included', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = boot(root, 4416);
  try {
    const base = await ready(server);
    const res = await fetch(base + '/api/content/pages/home', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { title: 'Home', count: '$14,300' }, body: 'Welcome' }),
    });
    assert.equal(res.status, 200);
    const saved = fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf-8');
    assert.match(saved, /count: 14300(\r?\n)/, 'currency input must be written as a plain YAML number');
  } finally { await shutdown(server); }
});

// A required field cleared in the admin must be refused server-side (the UI
// also blocks it, but the server is the contract) and must leave the file
// untouched — a client typo can never be allowed to break the site build.
test('save refuses to clear a required field and leaves the file unchanged', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = boot(root, 4417);
  try {
    const base = await ready(server);
    const before = fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf-8');
    const res = await fetch(base + '/api/content/pages/home', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { title: '' }, body: 'Welcome' }),
    });
    assert.equal(res.status, 400);
    const after = fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf-8');
    assert.equal(after, before, 'a rejected save must not modify the file');
  } finally { await shutdown(server); }
});

// The markdown body round-trips exactly — including image references and raw
// HTML — and a later data-only edit must not lose it.
test('markdown body round-trips through consecutive saves', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = boot(root, 4418);
  try {
    const base = await ready(server);
    const body = 'Intro paragraph.\n\n![A pool](../../assets/uploads/pool.webp "Tooltip")\n\n<span class="sig">A G</span>\n';
    const post = (data, b) => fetch(base + '/api/content/pages/home', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, body: b }),
    });
    assert.equal((await post({ title: 'Home' }, body)).status, 200);
    assert.equal((await post({ title: 'Home v2' }, body)).status, 200);
    const saved = fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf-8');
    assert.ok(saved.includes('![A pool](../../assets/uploads/pool.webp "Tooltip")'), 'image + tooltip syntax must survive');
    assert.ok(saved.includes('<span class="sig">A G</span>'), 'raw HTML in the body must survive');
    assert.match(saved, /title: Home v2/);
  } finally { await shutdown(server); }
});

// ── Upload pipeline and listing ─────────────────────────────────────────────

// Uploads convert to WebP under src/assets/uploads and return the .md-relative
// path shape the zod image() helper resolves. Any drift here breaks every
// image on every site at build time.
test('image upload converts to webp and returns the md-relative path', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = boot(root, 4419);
  try {
    const base = await ready(server);
    const png = await sharp({ create: { width: 1400, height: 900, channels: 3, background: { r: 20, g: 90, b: 180 } } })
      .png().toBuffer();
    const fd = new FormData();
    fd.append('imageType', 'gallery');
    fd.append('file', new Blob([png], { type: 'image/png' }), 'Test Photo.png');
    const json = await (await fetch(base + '/api/upload/image', {
      method: 'POST', headers: { Origin: base }, body: fd,
    })).json();
    assert.equal(json.error, undefined);
    assert.match(json.path, /^\.\.\/\.\.\/assets\/uploads\/[\w.-]+\.webp$/);
    const onDisk = path.join(root, 'src/assets/uploads', path.basename(json.path));
    assert.ok(fs.existsSync(onDisk));
    const meta = await sharp(fs.readFileSync(onDisk)).metadata();
    assert.equal(meta.format, 'webp');
    assert.ok(meta.width <= 1200, 'gallery uploads are capped at 1200px wide');
  } finally { await shutdown(server); }
});

// /api/uploads powers the reuse picker: newest first, images only, and each
// row carries the exact { path, preview } shape onPick consumers write into
// content.
test('uploads listing is newest-first, images only, picker-shaped', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const up = n => path.join(root, 'src/assets/uploads', n);
  fs.writeFileSync(up('older.webp'), 'x');
  fs.writeFileSync(up('newer.webp'), 'x');
  fs.writeFileSync(up('notes.txt'), 'not an image');
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(up('older.webp'), old, old);
  const server = boot(root, 4420);
  try {
    const base = await ready(server);
    const { files } = await (await fetch(base + '/api/uploads', { headers: { Origin: base } })).json();
    assert.deepEqual(files.map(f => f.name), ['newer.webp', 'older.webp'], 'newest first, no non-images');
    assert.equal(files[0].path, '../../assets/uploads/newer.webp');
    assert.match(files[0].preview, /^\/api\/preview\?p=src%2Fassets%2Fuploads%2Fnewer\.webp$/);
  } finally { await shutdown(server); }
});

// ── Orphan pruning at publish ───────────────────────────────────────────────

// The whole pruning contract in one pass: unreferenced-and-old is swept;
// unreferenced-but-fresh survives the 48h grace (an upload from this session
// can never be swept before it's saved); references in FRONTMATTER and in
// MARKDOWN BODIES both count (body references are how the insert-photo flow
// stores images); unreferenced old documents are swept too. Pruning runs
// before the push attempt, so none of this needs a git remote.
test('publish prunes only old unreferenced uploads — body and frontmatter references both protect', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const up  = n => path.join(root, 'src/assets/uploads', n);
  const doc = n => path.join(root, 'public/documents', n);
  for (const n of ['old-orphan.webp', 'fresh-orphan.webp', 'front-ref.webp', 'body-ref.webp']) fs.writeFileSync(up(n), 'x');
  fs.writeFileSync(doc('old-doc.pdf'), 'x');
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  for (const p of [up('old-orphan.webp'), up('front-ref.webp'), up('body-ref.webp'), doc('old-doc.pdf')]) {
    fs.utimesSync(p, threeDaysAgo, threeDaysAgo);
  }
  fs.writeFileSync(
    path.join(root, 'src/content/pages/home.md'),
    '---\ntitle: Home\nimg:\n  src: "../../assets/uploads/front-ref.webp"\n---\n\n![Pool](../../assets/uploads/body-ref.webp)\n',
  );
  const server = boot(root, 4421);
  try {
    const base = await ready(server);
    const res = await fetch(base + '/api/git/push', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test publish' }),
    });
    assert.equal(res.status, 200); // ok:false is fine — there is no remote; pruning already ran
    assert.ok(!fs.existsSync(up('old-orphan.webp')),  'old unreferenced upload must be swept');
    assert.ok(!fs.existsSync(doc('old-doc.pdf')),     'old unreferenced document must be swept');
    assert.ok(fs.existsSync(up('fresh-orphan.webp')), '48h grace: a fresh upload must never be swept');
    assert.ok(fs.existsSync(up('front-ref.webp')),    'frontmatter reference must protect the file');
    assert.ok(fs.existsSync(up('body-ref.webp')),     'markdown-body reference must protect the file');
  } finally { await shutdown(server); }
});

// ── Cross-origin write guard ────────────────────────────────────────────────

// The admin has no auth by design (localhost only) — the origin check is the
// one thing standing between a hostile web page in the same browser and a
// drive-by content edit. It must reject both foreign and missing origins on
// writes.
test('mutating requests are refused for foreign or missing Origin', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = boot(root, 4422);
  try {
    const base = await ready(server);
    const save = headers => fetch(base + '/api/content/pages/home', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ data: { title: 'Evil' }, body: '' }),
    });
    assert.equal((await save({ Origin: 'http://evil.example' })).status, 403);
    assert.equal((await save({})).status, 403, 'mutating request without Origin must be refused');
    const saved = fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf-8');
    assert.match(saved, /title: Home/, 'file must be untouched after refused writes');
  } finally { await shutdown(server); }
});

// ── Admin UI sanity ─────────────────────────────────────────────────────────

// The admin is a single served HTML file; a syntax error in its embedded
// script means a blank admin for every client on the next engine bump. Parse
// it the way the browser would.
test('admin.html embedded script parses', () => {
  const html = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf-8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(m, 'admin.html must contain a script block');
  assert.doesNotThrow(() => new Function(m[1]));
});
