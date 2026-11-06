// uniquePdfNames (2.19.0): a PDF upload never replaces a different file
// with the same name; without the option the name is kept and replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { startAdmin } from '../index.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-pdf-'));
  fs.mkdirSync(path.join(root, 'src/content/pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/documents'), { recursive: true });
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

function boot(root, port, extra = {}) {
  return startAdmin({
    root, port, pullOnStart: false,
    siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: {}, ...extra,
  });
}

async function ready(server) {
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return `http://127.0.0.1:${server.address().port}`;
}
const shutdown = server => server.listening && new Promise(r => server.close(r));

async function upload(base, name, text) {
  const fd = new FormData();
  fd.append('file', new Blob([`%PDF-1.4\n${text}\n%%EOF\n`], { type: 'application/pdf' }), name);
  const res = await fetch(`${base}/api/upload/pdf`, { method: 'POST', headers: { Origin: base }, body: fd });
  assert.equal(res.status, 200);
  return (await res.json()).path;
}
const doc = (root, p) => fs.readFileSync(path.join(root, 'public', p), 'utf8');

test('uniquePdfNames: a taken name gets -2, -3; the same file reuses its name', async t => {
  const root = fixture();
  const server = boot(root, 4471, { uniquePdfNames: true });
  t.after(async () => { await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  assert.equal(await upload(base, 'Study 1.pdf', 'james'), '/documents/study-1.pdf');
  assert.equal(await upload(base, 'Study 1.pdf', 'ruth'), '/documents/study-1-2.pdf');
  assert.equal(await upload(base, 'study-1.pdf', 'john'), '/documents/study-1-3.pdf');
  assert.equal(await upload(base, 'Study 1.pdf', 'ruth'), '/documents/study-1-2.pdf');
  assert.match(doc(root, '/documents/study-1.pdf'), /james/);
  assert.match(doc(root, '/documents/study-1-2.pdf'), /ruth/);
  assert.match(doc(root, '/documents/study-1-3.pdf'), /john/);
});

test('default: an upload with the same name replaces the file and keeps its URL', async t => {
  const root = fixture();
  const server = boot(root, 4472);
  t.after(async () => { await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  assert.equal(await upload(base, 'policy.pdf', 'old'), '/documents/policy.pdf');
  assert.equal(await upload(base, 'policy.pdf', 'new'), '/documents/policy.pdf');
  assert.match(doc(root, '/documents/policy.pdf'), /new/);
});
