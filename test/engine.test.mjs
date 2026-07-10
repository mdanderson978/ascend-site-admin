import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { verifySite } from '../verify-site.mjs';

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
  assert.equal(result.engineVersion, '1.2.0');
});
