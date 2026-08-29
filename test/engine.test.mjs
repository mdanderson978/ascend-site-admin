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
    assert.match(await (await fetch(base + '/legacy')).text(), /id="sidebar"/);
    assert.equal((await fetch(base + '/admin-assets/../package.json')).status, 404);
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
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
