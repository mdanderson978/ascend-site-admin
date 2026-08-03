import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
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
