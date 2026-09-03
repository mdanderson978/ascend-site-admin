import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { verifySite } from '../verify-site.mjs';
import { startAdmin } from '../index.mjs';

const packageVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// A git-dependency install (what every consuming site actually uses, not
// this repo's own checkout) is filtered by package.json's `files` array,
// the same as a real npm publish would be. Every consuming site's node_modules
// still has index.mjs itself (it's always in `files`), so a local import it
// makes from a file NOT in `files` doesn't fail here in this repo's own
// tests - it only fails at runtime on a real site, the first time that code
// path executes. This shipped for real: menus.mjs (added for the v2.7.0
// Menu Manager feature) was never added to `files`, so every site that
// installed v2.7.0/2.8.0 got `ERR_MODULE_NOT_FOUND` the moment the admin
// server booted, since index.mjs imports it unconditionally at module load
// time. Caught only when Essendon Presbyterian Church's content repo
// upgraded past v2.6.0 for the first time (2026-09-01) - no site had
// bumped that far until then. This test makes that whole bug class
// impossible to reintroduce silently.
test('every local file index.mjs imports from is listed in package.json "files"', () => {
  const indexSrc = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
  const localImports = [...indexSrc.matchAll(/^import\s+.*?\sfrom\s+'\.\/([^']+)'/gm)].map(m => m[1]);
  assert.ok(localImports.length > 0, 'sanity check: index.mjs should import at least one local file');
  const files = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).files;
  for (const imported of localImports) {
    assert.ok(files.includes(imported), `package.json "files" is missing "${imported}", which index.mjs imports - a consuming site's git-dependency install would 404/crash on this at runtime`);
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-test-'));
  fs.mkdirSync(path.join(root, 'src/content/pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/assets/uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/documents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/pages/home.md'), '---\ntitle: Home\ncount: 2\n---\nWelcome\n');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('site verifier exercises the generic engine safely', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = {
    root,
    siteTitle: 'Fixture Site',
    developerName: 'Test Developer',
    developerEmail: 'developer@example.invalid',
    fields: {
      'pages/home': [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'count', label: 'Count', type: 'number' },
        { name: 'body', label: 'Body', type: 'markdown' },
      ],
    },
  };

  const result = await verifySite(config, { root, port: 4411 });
  assert.equal(result.ok, true);
  assert.equal(result.pages, 1);
  assert.equal(result.engineVersion, packageVersion);
});

test('V2 is served by default with a stable legacy fallback and protected assets', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = startAdmin({
    root, port: 4430, pullOnStart: false, siteTitle: 'Fixture Site',
    developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title', type: 'text' }] },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const rootHtml = await (await fetch(base + '/')).text();
    assert.match(rootHtml, /<div id="root"><\/div>/);
    const assetPath = rootHtml.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(assetPath, 'V2 index references its compiled script');
    assert.equal((await fetch(base + assetPath)).status, 200);
    const legacyHtml = await (await fetch(base + '/legacy')).text();
    assert.match(legacyHtml, /id="sidebar"/);
    assert.match(legacyHtml, /deprecated/i, 'legacy interface shows its own deprecation banner');
    assert.equal((await fetch(base + '/admin-assets/../package.json')).status, 404);
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
});

test('legacy admin: deprecation warnings fire once at boot (adminUi) and once per route hit (/legacy), not per request', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  let server;
  try {
    server = startAdmin({
      root, port: 4434, pullOnStart: false, adminUi: 'legacy', siteTitle: 'Fixture Site',
      developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
      fields: { 'pages/home': [{ name: 'title', label: 'Title', type: 'text' }] },
    });
    assert.ok(warnings.some(w => w.includes('adminUi') && w.includes('deprecated')), 'boot-time warning fires when adminUi: legacy is configured');
    const bootWarningCount = warnings.length;

    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    await fetch(base + '/legacy');
    await fetch(base + '/legacy');
    await fetch(base + '/legacy');
    assert.equal(warnings.length, bootWarningCount + 1, 'the route-level warning is deduped, not repeated per request');
  } finally {
    console.warn = originalWarn;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
});

test('dynamic entry ordering updates every order field in one request', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/projects/alpha.md'), '---\ntitle: Alpha\norder: 1\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/projects/beta.md'), '---\ntitle: Beta\norder: 2\n---\n');
  const server = startAdmin({
    root, port: 4431, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid', fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { projects: { label: 'Project', titleField: 'title', orderField: 'order', fields: [{ name: 'title', label: 'Title' }, { name: 'order', label: 'Order', type: 'number' }] } },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + '/api/order/projects', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: ['beta', 'alpha'] }) });
    assert.equal(response.status, 200);
    assert.match(fs.readFileSync(path.join(root, 'src/content/projects/beta.md'), 'utf8'), /order: 1/);
    assert.match(fs.readFileSync(path.join(root, 'src/content/projects/alpha.md'), 'utf8'), /order: 2/);
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
});

// sortFields is the automatic alternative to orderField: no dragging, no
// stored position - the sidebar just reads back in real frontmatter order
// every time, sorted by the entry's own field value(s). Covers the primary
// case (date descending), the tie-break case (a second key breaking ties
// on the first, e.g. two same-day entries ordered by an am/pm field), and
// that a missing field on one entry doesn't crash the sort.
test('dynamic collections: sortFields orders sidebar entries automatically, with tie-breaking, no drag needed', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/sermons'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/sermons/2026-01-05-am.md'), '---\ntitle: New Year\ndate: 2026-01-05\nservice: am\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/sermons/2026-01-05-pm.md'), '---\ntitle: New Year Evening\ndate: 2026-01-05\nservice: pm\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/sermons/2025-12-25.md'), '---\ntitle: Christmas\ndate: 2025-12-25\n---\n'); // no service field at all
  const server = startAdmin({
    root, port: 4432, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid', fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { sermons: { label: 'Sermon', titleField: 'title', sortFields: ['date', 'service'], sortDirection: 'desc', fields: [{ name: 'title', label: 'Title' }] } },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const config = await (await fetch(base + '/api/config')).json();
    // orderField must not be advertised - dragging a sortFields collection
    // would just be undone by the next automatic sort.
    assert.equal(config.dynamicCollections.sermons.orderField, undefined);
    const tree = await (await fetch(base + '/api/content')).json();
    assert.deepEqual(tree.sermons, ['2026-01-05-pm', '2026-01-05-am', '2025-12-25']);
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
});

// A `date` field accepts fuzzy human input (any of -, /, ., space as the
// delimiter, ISO or Australian DD-MM-YYYY order) and coerceValue() always
// normalizes it to canonical YYYY-MM-DD before it's written — this is what
// sortDynamicSlugs()'s plain string comparison (and toDateAwareString())
// depend on to sort correctly regardless of how the editor typed it in.
test('date fields: fuzzy input is normalized to canonical YYYY-MM-DD and written quoted', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = startAdmin({
    root, port: 4470, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid', fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { sermons: { label: 'Sermon', titleField: 'title', sortFields: ['date'], sortDirection: 'desc', fields: [{ name: 'title', label: 'Title' }, { name: 'date', label: 'Date', type: 'date' }] } },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const created = await req('/api/content/sermons/new', { method: 'POST', body: JSON.stringify({ data: { title: 'Australian Order', date: '30/08/2026' }, body: '' }) });
    assert.equal(created.status, 200);
    const { slug } = await created.json();
    const raw = fs.readFileSync(path.join(root, 'src/content/sermons', `${slug}.md`), 'utf-8');
    assert.match(raw, /date: '2026-08-30'\n/, 'DD-MM-YYYY input is normalized to canonical, quoted ISO form');

    const fetched = await (await req(`/api/content/sermons/${slug}`)).json();
    assert.equal(fetched.data.date, '2026-08-30');
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
});

test('date fields: US-style and other ambiguous/invalid input is rejected with a friendly error, not silently misfiled', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = startAdmin({
    root, port: 4471, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid', fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { sermons: { label: 'Sermon', titleField: 'title', sortFields: ['date'], sortDirection: 'desc', fields: [{ name: 'title', label: 'Title' }, { name: 'date', label: 'Date', type: 'date' }] } },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const response = await req('/api/content/sermons/new', { method: 'POST', body: JSON.stringify({ data: { title: 'Bad Date', date: '08-30-2026' }, body: '' }) });
    assert.equal(response.status, 400);
    const { error } = await response.json();
    assert.match(error, /isn't a valid date/);
    assert.equal(fs.existsSync(path.join(root, 'src/content/sermons')), false, 'nothing was written to disk for the rejected entry');
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
});

// A static FIELDS key for a nested page (e.g. "pages/about/index", or a page
// two directories deep like "pages/awards/hall-of-fame/criteria") has a slug
// that itself contains "/" characters. /api/content and /api/search used to
// split each key on "/" and destructure straight into [col, slug], which
// silently keeps only the first segment after the collection and drops the
// rest - every nested key sharing that first segment collapsed onto the same
// truncated slug (e.g. "pages/about/index" and "pages/about/governance" both
// became tree.pages entry "about"), which the sidebar's orphan-detection then
// duplicated once per colliding key, mislabeled generically (humanizing just
// that shared first segment), and 404s reaching for a file that was never at
// that truncated path in the first place. Caught on the Australian Masters
// Athletics site (2026-09-02), which uses this nested key convention
// throughout. Covers both the two-deep and three-deep cases in one fixture.
test('/api/content and /api/search preserve the full slug for a nested static page key, not just its first segment', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/pages/about'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/content/pages/awards/hall-of-fame'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/pages/about/index.md'), '---\ntitle: About\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/pages/about/governance.md'), '---\ntitle: Governance\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/pages/awards/hall-of-fame/criteria.md'), '---\ntitle: HOF Criteria\n---\n');
  const server = startAdmin({
    root, port: 4433, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: {
      'pages/home': [{ name: 'title', label: 'Title' }],
      'pages/about/index': [{ name: 'title', label: 'Title', required: true }],
      'pages/about/governance': [{ name: 'title', label: 'Title', required: true }],
      'pages/awards/hall-of-fame/criteria': [{ name: 'title', label: 'Title', required: true }],
    },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const tree = await (await fetch(base + '/api/content')).json();
    // Each nested key must survive whole, as its own distinct tree entry -
    // not truncated to "about"/"awards" and collapsed together.
    assert.deepEqual(new Set(tree.pages), new Set(['home', 'about/index', 'about/governance', 'awards/hall-of-fame/criteria']));

    const search = await (await fetch(base + '/api/search')).json();
    // A correctly-resolved entry carries its real "Title" field value read
    // from the actual file: resolveFields()/contentFile() only find that
    // file when given the full, untruncated slug.
    const titleValue = key => search[key]?.find(f => f.name === 'title')?.value;
    assert.equal(titleValue('pages/about/index'), 'About');
    assert.equal(titleValue('pages/about/governance'), 'Governance');
    assert.equal(titleValue('pages/awards/hall-of-fame/criteria'), 'HOF Criteria');
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
});

test('dynamic collections: sortFields without a valid sortDirection fails at startup, not silently', () => {
  const root = fixture();
  try {
    assert.throws(
      () => startAdmin({
        root, port: 4433, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid', fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
        dynamicCollections: { sermons: { label: 'Sermon', titleField: 'title', sortFields: ['date'], fields: [{ name: 'title', label: 'Title' }] } },
      }),
      /sortDirection must be 'asc' or 'desc'/
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// Sites migrated into the CMS keep their pre-existing images under
// src/assets/images (not src/assets/uploads, which only holds files uploaded
// through the admin UI). /api/preview must serve both, while still refusing
// anything outside src/assets and public/documents.
test('preview serves legacy src/assets/images alongside uploads, but nothing else', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, 'src/assets/images'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/assets/images/legacy.webp'), 'fake-image-bytes');
  fs.writeFileSync(path.join(root, 'src/assets/uploads/uploaded.webp'), 'fake-image-bytes');

  const server = startAdmin({
    root,
    port: 4412,
    pullOnStart: false,
    siteTitle: 'Fixture Site',
    developerName: 'Test Developer',
    developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title', type: 'text' }] },
  });

  try {
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
    }
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = p => fetch(base + `/api/preview?p=${encodeURIComponent(p)}`, { headers: { Origin: base } });

    assert.equal((await get('src/assets/images/legacy.webp')).status, 200, 'legacy image should preview');
    assert.equal((await get('src/assets/uploads/uploaded.webp')).status, 200, 'uploaded image should still preview');
    assert.equal((await get('src/content/pages/home.md')).status, 403, 'non-asset content should stay forbidden');
    assert.equal((await get('package.json')).status, 403, 'repo root files should stay forbidden');
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

test('page image upload converts to WebP, returns its final public path and remains listable', async t => {
  const root = fixture();
  t.after(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const server = startAdmin({
    root, port: 4433, pullOnStart: false, richHtmlImport: true, siteTitle: 'Fixture Site',
    developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title', type: 'text' }] },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#376b5b' } }).png().toBuffer();
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'Pool Hero.PNG');
    form.append('data', JSON.stringify({ title: 'Home' }));
    const uploadedResponse = await fetch(base + '/api/upload/page-image/pages/home', { method: 'POST', headers: { Origin: base }, body: form });
    assert.equal(uploadedResponse.status, 200);
    const uploaded = await uploadedResponse.json();
    assert.match(uploaded.path, /^\/content-assets\/pages\/home\/images\/\d+-pool-hero\.webp$/);
    const localPath = path.join(root, 'public', uploaded.path.replace(/^\//, ''));
    const metadata = await sharp(fs.readFileSync(localPath)).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 1920);

    const listedResponse = await fetch(base + '/api/page-images/pages/home', {
      method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { title: 'Home' } }),
    });
    assert.equal(listedResponse.status, 200);
    const listed = await listedResponse.json();
    assert.equal(listed.files.length, 1);
    assert.equal(listed.files[0].path, uploaded.path);
    const previewResponse = await fetch(base + listed.files[0].preview);
    assert.equal(previewResponse.status, 200);
    await previewResponse.arrayBuffer();
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
});

// Collections not listed in dynamicCollections must keep today's behavior
// exactly: a fixed, developer-defined set of entries with no add/delete from
// the admin UI at all, even against a crafted request.
test('dynamic collections: add, dedupe-slug, delete — static collections stay fixed', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/content/projects/project-1.md'),
    '---\ntitle: Project 1\ndescription: Existing project\n---\n',
  );

  const server = startAdmin({
    root,
    port: 4413,
    pullOnStart: false,
    siteTitle: 'Fixture Site',
    developerName: 'Test Developer',
    developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title', type: 'text' }] },
    dynamicCollections: {
      projects: {
        label: 'Project',
        titleField: 'title',
        fields: [
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'description', label: 'Description', type: 'textarea' },
        ],
      },
    },
  });

  try {
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
    }
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, {
      ...options,
      headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

    // Existing entry discovered from disk, not from a static FIELDS map.
    const tree = await (await req('/api/content')).json();
    assert.deepEqual(tree.projects, ['project-1']);

    // /api/config exposes the label, not the field template.
    const publicConfig = await (await req('/api/config')).json();
    assert.equal(publicConfig.dynamicCollections.projects.label, 'Project');
    assert.equal(publicConfig.dynamicCollections.projects.fields, undefined);

    // Empty form for a new entry.
    const newForm = await (await req('/api/content/projects/new')).json();
    assert.deepEqual(newForm.data, {});
    assert.equal(newForm.fields.length, 2);

    // Creating without the title field is refused.
    const missingTitle = await req('/api/content/projects/new', {
      method: 'POST',
      body: JSON.stringify({ data: { description: 'No title' }, body: '' }),
    });
    assert.equal(missingTitle.status, 400);

    // Same title as the existing entry — slug de-dupes rather than
    // overwriting project-1.
    const created = await (await req('/api/content/projects/new', {
      method: 'POST',
      body: JSON.stringify({ data: { title: 'Project 1', description: 'A new one' }, body: '' }),
    })).json();
    assert.equal(created.ok, true);
    assert.equal(created.slug, 'project-1-2');
    assert.ok(fs.existsSync(path.join(root, 'src/content/projects/project-1-2.md')));

    const treeAfterCreate = await (await req('/api/content')).json();
    assert.deepEqual(treeAfterCreate.projects.sort(), ['project-1', 'project-1-2']);

    // A static (non-dynamic) collection stays completely fixed.
    const staticNew = await req('/api/content/pages/new', {
      method: 'POST',
      body: JSON.stringify({ data: { title: 'Should not work' }, body: '' }),
    });
    assert.equal(staticNew.status, 400);

    const staticDelete = await req('/api/content/pages/home', { method: 'DELETE' });
    assert.equal(staticDelete.status, 400);
    assert.ok(fs.existsSync(path.join(root, 'src/content/pages/home.md')), 'static page must survive a delete attempt');

    // Deleting the newly-created project removes only that file.
    const deleted = await req('/api/content/projects/project-1-2', { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.ok(!fs.existsSync(path.join(root, 'src/content/projects/project-1-2.md')));
    assert.ok(fs.existsSync(path.join(root, 'src/content/projects/project-1.md')), 'other entries in the collection must survive');

    // Deleting something that never existed 404s rather than silently OK-ing.
    const deleteMissing = await req('/api/content/projects/does-not-exist', { method: 'DELETE' });
    assert.equal(deleteMissing.status, 404);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

// Sidebar drag-to-reorder (/api/reorder/:collection) must touch ONLY the
// configured orderField in each entry's frontmatter — never `body`, since the
// sidebar only ever has each entry's order value (from /api/search), not its
// full body. Reusing the full content-save endpoint for this would silently
// wipe every reordered entry's content back to empty.
test('reorder updates only the orderField, preserves body and other fields, and stays scoped to orderable collections', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/content/projects/alpha.md'),
    '---\ntitle: Alpha\nsort_order: 1\n---\nAlpha body content.\n',
  );
  fs.writeFileSync(
    path.join(root, 'src/content/projects/beta.md'),
    '---\ntitle: Beta\nsort_order: 2\n---\nBeta body content.\n',
  );

  const server = startAdmin({
    root,
    port: 4414,
    pullOnStart: false,
    siteTitle: 'Fixture Site',
    developerName: 'Test Developer',
    developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title', type: 'text' }] },
    dynamicCollections: {
      projects: {
        label: 'Project',
        titleField: 'title',
        orderField: 'sort_order',
        fields: [
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'sort_order', label: 'Sort Order', type: 'number' },
        ],
      },
    },
  });

  try {
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
    }
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, {
      ...options,
      headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

    // Swap the two entries' order.
    const swapped = await (await req('/api/reorder/projects', {
      method: 'POST',
      body: JSON.stringify({ order: [{ slug: 'beta', value: 1 }, { slug: 'alpha', value: 2 }] }),
    })).json();
    assert.equal(swapped.ok, true);
    assert.deepEqual(swapped.updated.sort(), ['alpha', 'beta']);

    const alphaRaw = fs.readFileSync(path.join(root, 'src/content/projects/alpha.md'), 'utf-8');
    const betaRaw  = fs.readFileSync(path.join(root, 'src/content/projects/beta.md'), 'utf-8');
    assert.match(alphaRaw, /sort_order: 2/);
    assert.match(betaRaw, /sort_order: 1/);
    // Body and every other field survive untouched — the whole point of a
    // narrow reorder endpoint instead of reusing the full save endpoint.
    assert.match(alphaRaw, /Alpha body content\./);
    assert.match(betaRaw, /Beta body content\./);
    assert.match(alphaRaw, /title: Alpha/);
    assert.match(betaRaw, /title: Beta/);

    // A collection with no orderField configured (or that isn't dynamic at
    // all) refuses the request rather than silently doing nothing.
    const notOrderable = await req('/api/reorder/pages', {
      method: 'POST',
      body: JSON.stringify({ order: [{ slug: 'home', value: 1 }] }),
    });
    assert.equal(notOrderable.status, 400);

    // Missing and traversal-style slugs are skipped, not a hard failure for
    // the rest of the batch. The latter must not resolve back to alpha.md.
    const partial = await (await req('/api/reorder/projects', {
      method: 'POST',
      body: JSON.stringify({ order: [
        { slug: 'alpha', value: 5 },
        { slug: 'does-not-exist', value: 6 },
        { slug: '../projects/alpha', value: 99 },
      ] }),
    })).json();
    assert.equal(partial.ok, true);
    assert.deepEqual(partial.updated, ['alpha']);
    assert.match(fs.readFileSync(path.join(root, 'src/content/projects/alpha.md'), 'utf-8'), /sort_order: 5/);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

test('rename: moves the file, records a redirect, rewrites internal links, and is gated to dynamic/renamable keys', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/projects/first.md'), '---\ntitle: First\n---\nA project.\n');
  fs.writeFileSync(
    path.join(root, 'src/content/pages/other.md'),
    '---\ntitle: Other\n---\nSee our [first project](/projects/first) and <a href="/projects/first/">this link too</a>.\n',
  );

  const server = startAdmin({
    root, port: 4440, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }], 'pages/other': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { projects: { label: 'Project', titleField: 'title', fields: [{ name: 'title', label: 'Title' }] } },
    urlPatterns: { pages: '{slug}', projects: 'projects/{slug}' },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    // A static page not opted into config.renamable is refused.
    const refused = await req('/api/rename/pages/other/preview', { method: 'POST', body: JSON.stringify({ newSlug: 'whatever' }) });
    assert.equal(refused.status, 400);

    // Preview finds the real cross-page links without writing anything.
    const preview = await (await req('/api/rename/projects/first/preview', { method: 'POST', body: JSON.stringify({ newSlug: 'Second Project!' }) })).json();
    assert.equal(preview.ok, true);
    assert.equal(preview.newSlug, 'second-project'); // sanitized server-side, same as create
    assert.equal(preview.oldPath, '/projects/first');
    assert.equal(preview.newPath, '/projects/second-project');
    assert.deepEqual(preview.linksToFix, [{ file: 'pages/other.md', count: 2 }]);
    assert.equal(fs.existsSync(path.join(root, 'src/content/projects/first.md')), true, 'preview must not write');

    // Commit: file moves, redirect recorded, links rewritten in place.
    const committed = await (await req('/api/rename/projects/first', { method: 'POST', body: JSON.stringify({ newSlug: 'Second Project!' }) })).json();
    assert.equal(committed.ok, true);
    assert.equal(committed.slug, 'second-project');
    assert.deepEqual(committed.redirect, { from: '/projects/first', to: '/projects/second-project' });
    assert.equal(committed.linksFixed, 2);
    assert.equal(fs.existsSync(path.join(root, 'src/content/projects/first.md')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/content/projects/second-project.md')), true);
    assert.match(fs.readFileSync(path.join(root, 'src/content/pages/other.md'), 'utf-8'), /\/projects\/second-project/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/content/pages/other.md'), 'utf-8'), /\/projects\/first/);

    const redirects = JSON.parse(fs.readFileSync(path.join(root, 'src/content/.site-admin/redirects.json'), 'utf-8'));
    assert.deepEqual(redirects.redirects, { '/projects/first': '/projects/second-project' });

    // stable_id survives the rename untouched.
    const movedRaw = fs.readFileSync(path.join(root, 'src/content/projects/second-project.md'), 'utf-8');
    assert.match(movedRaw, /stable_id: [0-9a-f-]{36}/);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

test('rename: collapses redirect chains and blocks both collision types with no partial writes', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/projects/a.md'), '---\ntitle: A\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/projects/existing.md'), '---\ntitle: Existing\n---\n');

  const server = startAdmin({
    root, port: 4441, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { projects: { label: 'Project', titleField: 'title', fields: [{ name: 'title', label: 'Title' }] } },
    urlPatterns: { projects: 'projects/{slug}' },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    // a -> b, then b -> c: the stored redirect for a must collapse straight to c, not dangle at b.
    await req('/api/rename/projects/a', { method: 'POST', body: JSON.stringify({ newSlug: 'b' }) });
    await req('/api/rename/projects/b', { method: 'POST', body: JSON.stringify({ newSlug: 'c' }) });
    const afterChain = JSON.parse(fs.readFileSync(path.join(root, 'src/content/.site-admin/redirects.json'), 'utf-8'));
    assert.deepEqual(afterChain.redirects, { '/projects/a': '/projects/c', '/projects/b': '/projects/c' });

    const filesBefore = fs.readdirSync(path.join(root, 'src/content/projects')).sort();

    // Collision: target filename already exists.
    const filenameCollision = await req('/api/rename/projects/c', { method: 'POST', body: JSON.stringify({ newSlug: 'existing' }) });
    assert.equal(filenameCollision.status, 409);

    // Collision: target is already a redirect source pointing elsewhere.
    const redirectCollision = await req('/api/rename/projects/existing', { method: 'POST', body: JSON.stringify({ newSlug: 'a' }) });
    assert.equal(redirectCollision.status, 409);

    // Neither blocked attempt wrote anything.
    assert.deepEqual(fs.readdirSync(path.join(root, 'src/content/projects')).sort(), filesBefore);
    const redirectsAfter = JSON.parse(fs.readFileSync(path.join(root, 'src/content/.site-admin/redirects.json'), 'utf-8'));
    assert.deepEqual(redirectsAfter.redirects, afterChain.redirects);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

// git log --follow is what keeps a renamed page's pre-rename commits visible
// in the History panel — without it a renamed page looks "born" the moment
// it was renamed. Each step below is its own commit, same as a real Publish.
test('rename: page history survives the rename via --follow', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/projects/old-name.md'), '---\ntitle: Old Name\n---\n');
  const git = (args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
  git(['add', '-A']); git(['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'add page']);

  const server = startAdmin({
    root, port: 4442, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { projects: { label: 'Project', titleField: 'title', fields: [{ name: 'title', label: 'Title' }] } },
    urlPatterns: { projects: 'projects/{slug}' },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    // Commit the boot-time stable_id backfill on its own first, so the
    // rename below is a clean, isolated old-path -> new-path move (tiny
    // fixture files are unreliable for git's similarity-based rename
    // detection when a content change rides along in the same commit).
    git(['add', '-A']); git(['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'stable_id backfill']);

    await req('/api/rename/projects/old-name', { method: 'POST', body: JSON.stringify({ newSlug: 'new-name' }) });
    git(['add', '-A']); git(['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'rename old-name -> new-name']);

    const history = await (await req('/api/history/projects/new-name')).json();
    assert.equal(history.versions.length, 3, 'the original add, the backfill and the rename commit are all visible');
    assert.match(history.versions.map(v => v.message).join('\n'), /add page/);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

test('menus: create, save (rename + edit items), and delete a menu', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const server = startAdmin({
    root, port: 4450, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    menuSlots: { header_primary: { label: 'Header' } },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const created = await (await req('/api/menus', { method: 'POST', body: JSON.stringify({ name: 'Main Menu' }) })).json();
    assert.equal(created.ok, true);
    assert.equal(created.menu.name, 'Main Menu');
    const id = created.menu.id;

    const list = await (await req('/api/menus')).json();
    assert.equal(list.menus.length, 1);
    assert.equal(list.menus[0].id, id);

    const saved = await req(`/api/menus/${id}`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Header Menu', items: [{ id: 'i1', type: 'link', url: '/contact', label: 'Contact' }] }),
    });
    assert.equal(saved.status, 200);

    const afterSave = await (await req('/api/menus')).json();
    assert.equal(afterSave.menus[0].name, 'Header Menu');
    assert.deepEqual(afterSave.menus[0].items, [{ id: 'i1', type: 'link', url: '/contact', label: 'Contact' }]);

    const slotSet = await req('/api/menu-slots/header_primary', { method: 'POST', body: JSON.stringify({ menuId: id }) });
    assert.equal(slotSet.status, 200);
    assert.equal((await (await req('/api/menus')).json()).slotAssignments.header_primary, id);

    const deleted = await req(`/api/menus/${id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    const afterDelete = await (await req('/api/menus')).json();
    assert.equal(afterDelete.menus.length, 0);
    assert.equal(afterDelete.slotAssignments.header_primary, undefined, 'deleting a menu clears any slot pointing at it');
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

test('menus: POST to a missing menu id 404s instead of crashing', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const server = startAdmin({
    root, port: 4451, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const missing = await req('/api/menus/does-not-exist', { method: 'POST', body: JSON.stringify({ name: 'x' }) });
    assert.equal(missing.status, 404);
    const missingDelete = await req('/api/menus/does-not-exist', { method: 'DELETE' });
    assert.equal(missingDelete.status, 404);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

// The whole point of storing stable_id instead of a slug/path in menus.json:
// after a rename, GET /api/menus must reflect the page's new live path with
// ZERO write to menus.json having occurred - resolution happens live, not
// via a rewrite step like linkFixer.mjs does for markdown bodies.
test('menus: a page-type item resolves through a rename with no write to menus.json', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/projects/first.md'), '---\ntitle: First\nstable_id: fixed-test-id\n---\n');

  const server = startAdmin({
    root, port: 4452, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { projects: { label: 'Project', titleField: 'title', fields: [{ name: 'title', label: 'Title' }] } },
    urlPatterns: { projects: 'projects/{slug}' },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const created = await (await req('/api/menus', { method: 'POST', body: JSON.stringify({ name: 'Main Menu' }) })).json();
    await req(`/api/menus/${created.menu.id}`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: 'i1', type: 'page', stableId: 'fixed-test-id', label: 'First Project' }] }),
    });

    const before = await (await req('/api/menus')).json();
    assert.equal(before.menus[0].items[0].livePath, '/projects/first');
    assert.equal(before.menus[0].items[0].missing, false);
    assert.equal(before.menus[0].items[0].key, 'projects/first', 'resolved item also carries the collection/slug key, so the UI can jump straight to editing it');
    const menusJsonBefore = fs.readFileSync(path.join(root, 'src/content/.site-admin/menus.json'), 'utf-8');

    await req('/api/rename/projects/first', { method: 'POST', body: JSON.stringify({ newSlug: 'second' }) });

    const after = await (await req('/api/menus')).json();
    assert.equal(after.menus[0].items[0].livePath, '/projects/second', 'resolves the NEW path live, without any menus.json rewrite step');
    assert.equal(after.menus[0].items[0].key, 'projects/second', 'key follows the rename too, live');
    const menusJsonAfter = fs.readFileSync(path.join(root, 'src/content/.site-admin/menus.json'), 'utf-8');
    assert.equal(menusJsonBefore, menusJsonAfter, 'menus.json itself is byte-for-byte unchanged by the rename');

    // A stable_id pointing at a deleted page resolves gracefully, not a throw.
    fs.unlinkSync(path.join(root, 'src/content/projects/second.md'));
    const afterDelete = await (await req('/api/menus')).json();
    assert.equal(afterDelete.menus[0].items[0].missing, true);
    assert.equal(afterDelete.menus[0].items[0].livePath, null);
    assert.equal(afterDelete.menus[0].items[0].key, null);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

// resolveMenu() recurses into a heading item's children — this covers that
// path explicitly, since every other menu test above only exercises
// top-level items. Also covers linking a menu item straight at a hub page
// (a plain pages/* entry, resolved exactly like any other page).
test('menus: a heading item\'s nested children resolve stable_id too, including a link to a hub page', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/pages/services-hub.md'), '---\ntitle: Services\nstable_id: hub-id\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/services/led-lights.md'), '---\ntitle: LED Lights\nstable_id: child-id\n---\n');

  const server = startAdmin({
    root, port: 4453, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }], 'pages/services-hub': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { services: { label: 'Service', titleField: 'title', fields: [{ name: 'title', label: 'Title' }] } },
    urlPatterns: { pages: '{slug}', services: 'services-hub/{slug}' },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const created = await (await req('/api/menus', { method: 'POST', body: JSON.stringify({ name: 'Main Menu' }) })).json();
    await req(`/api/menus/${created.menu.id}`, {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { id: 'hub-item', type: 'page', stableId: 'hub-id', label: 'Services' },
          { id: 'heading-item', type: 'heading', label: 'More', children: [{ id: 'child-item', type: 'page', stableId: 'child-id', label: 'LED Lights' }] },
        ],
      }),
    });

    const result = await (await req('/api/menus')).json();
    const [hubItem, headingItem] = result.menus[0].items;
    assert.equal(hubItem.livePath, '/services-hub', 'linking straight at a hub page resolves like any other page');
    assert.equal(headingItem.type, 'heading');
    assert.equal(headingItem.children[0].livePath, '/services-hub/led-lights', 'a heading\'s nested child is resolved too, not just top-level items');
    assert.equal(headingItem.children[0].missing, false);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

// ── Blocks (v3 page-builder) ─────────────────────────────────────────────

const STAT_PHOTO_BLOCK_TYPES = [
  { id: 'stat', label: 'Stat', fields: [
    { name: 'number', label: 'Number', type: 'number', required: true },
    { name: 'caption', label: 'Caption', type: 'string' },
  ] },
  { id: 'photo', label: 'Photo', fields: [
    { name: 'note', label: 'Note', type: 'string' },
  ] },
];

function flexpageConfig(root, port, blockTypes = STAT_PHOTO_BLOCK_TYPES) {
  return {
    root, port, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: {
      flexpage: { label: 'Flexible Page', titleField: 'title', fields: [
        { name: 'title', label: 'Title', type: 'string', required: true },
        { name: 'sections', label: 'Sections', type: 'blocks', blockTypes },
      ] },
    },
  };
}

// A block type's own fields aren't allowed to nest another `blocks` field
// (no matching Zod discriminated-union shape one level down) or a
// `markdown` field (a block isn't a full page body) — this is checked once
// at boot, so a bad config fails loudly at server start rather than
// misbehaving the first time an editor opens the form.
test('blocks: server refuses to boot when a block type nests a blocks or markdown field', () => {
  const root = fixture();
  try {
    assert.throws(() => startAdmin(flexpageConfig(root, 4460, [
      { id: 'bad', label: 'Bad', fields: [{ name: 'nested', label: 'Nested', type: 'blocks', blockTypes: [] }] },
    ])), /not allowed inside a block/);
    assert.throws(() => startAdmin(flexpageConfig(root, 4460, [
      { id: 'bad', label: 'Bad', fields: [{ name: 'body', label: 'Body', type: 'markdown' }] },
    ])), /not allowed inside a block/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// The one genuinely new piece of recursion in coerceValue()/validateData():
// a nested `number` sub-field must round-trip unquoted (same reason a
// top-level number does — z.coerce.number() in the site's real schema
// rejects a quoted YAML string), the UI-only per-block `id` must never
// reach the written file, and an empty optional sub-field is dropped the
// same way an empty top-level field already is.
test('blocks: round-trips a mixed block list, coercing nested numbers unquoted and stripping the UI-only id', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = startAdmin(flexpageConfig(root, 4461));
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const created = await req('/api/content/flexpage/new', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          title: 'Test Page',
          sections: [
            { id: 'ui-1', type: 'stat', number: '42', caption: 'Years in business' },
            { id: 'ui-2', type: 'photo', note: '' },
          ],
        },
        body: '',
      }),
    });
    assert.equal(created.status, 200);
    const { slug } = await created.json();

    const raw = fs.readFileSync(path.join(root, 'src/content/flexpage', `${slug}.md`), 'utf-8');
    assert.match(raw, /number: 42\n/, 'nested number is written unquoted, not as a YAML string');
    assert.doesNotMatch(raw, /ui-1|ui-2/, 'the UI-only per-block id never reaches the written file');
    assert.doesNotMatch(raw, /caption: ''|note: ''/, 'an empty optional sub-field is omitted, not written as an empty string');

    const fetched = await (await req(`/api/content/flexpage/${slug}`)).json();
    assert.equal(fetched.data.sections.length, 2);
    assert.equal(fetched.data.sections[0].type, 'stat');
    assert.equal(fetched.data.sections[0].number, 42);
    assert.equal(fetched.data.sections[0].caption, 'Years in business');
    assert.equal(fetched.data.sections[0].id, undefined, 'id is not round-tripped back either');
    assert.equal(fetched.data.sections[1].type, 'photo');
    assert.equal(fetched.data.sections[1].note, undefined);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

// Friendly, block-position-labelled errors for the two ways a block can be
// invalid: a missing required sub-field, and a `type` the config's palette
// doesn't recognize (e.g. hand-edited or corrupt content).
test('blocks: validateData rejects a missing required sub-field and an unrecognized block type, both with friendly labels', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = startAdmin(flexpageConfig(root, 4462));
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (p, options = {}) => fetch(base + p, { ...options, headers: { Origin: base, 'Content-Type': 'application/json', ...(options.headers || {}) } });

    const missingRequired = await req('/api/content/flexpage/new', {
      method: 'POST',
      body: JSON.stringify({ data: { title: 'X', sections: [{ id: 'a', type: 'stat', caption: 'No number here' }] }, body: '' }),
    });
    assert.equal(missingRequired.status, 400);
    const missingBody = await missingRequired.json();
    assert.match(missingBody.error, /Section 1 \("Stat"\).*Number.*cannot be empty/);

    const badType = await req('/api/content/flexpage/new', {
      method: 'POST',
      body: JSON.stringify({ data: { title: 'Y', sections: [{ id: 'b', type: 'nonexistent' }] }, body: '' }),
    });
    assert.equal(badType.status, 400);
    const badTypeBody = await badType.json();
    assert.match(badTypeBody.error, /unrecognized block type "nonexistent"/);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});
