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
