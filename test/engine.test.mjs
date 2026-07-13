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
