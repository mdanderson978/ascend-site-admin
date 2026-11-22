import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compareVersions, unseenNotes, WHATS_NEW } from '../whats-new.mjs';
import { startAdmin } from '../index.mjs';

const notes = [
  { version: '2.10.0', text: 'ten' },
  { version: '2.9.0', text: 'nine', requires: 'deployStatus' },
  { version: '2.8.0', text: 'eight', requires: 'richHtmlImport' },
  { version: '2.7.0', text: 'seven' },
  { version: '2.6.0', text: 'six' },
];
const texts = list => list.map(n => n.text);

test('compareVersions compares numerically, part by part', () => {
  assert.ok(compareVersions('2.10.0', '2.9.1') > 0);
  assert.ok(compareVersions('2.9.1', '2.10.0') < 0);
  assert.equal(compareVersions('2.21.0', '2.21.0'), 0);
});

test('unseenNotes: newer than the last dismissed version, newest first, at most 3', () => {
  const base = { notes, engineVersion: '2.10.0', config: { richHtmlImport: true }, workflowText: 'bash .github/deploy-status.sh building' };
  assert.deepEqual(texts(unseenNotes({ ...base, seen: '' })), ['ten', 'nine', 'eight'], 'never dismissed: the 3 newest');
  assert.deepEqual(texts(unseenNotes({ ...base, seen: '2.8.0' })), ['ten', 'nine']);
  assert.deepEqual(texts(unseenNotes({ ...base, seen: '2.10.0' })), [], 'all seen');
  assert.deepEqual(unseenNotes({ ...base, seen: '' })[0], { version: '2.10.0', text: 'ten' }, 'only version and text reach the UI');
});

test('unseenNotes: a note needing a feature the site lacks is skipped', () => {
  const out = unseenNotes({ notes, engineVersion: '2.10.0', config: {}, workflowText: 'no status here', seen: '' });
  assert.deepEqual(texts(out), ['ten', 'seven', 'six']);
});

test('unseenNotes: notes for a newer engine than the one running are never shown', () => {
  assert.deepEqual(texts(unseenNotes({ notes, engineVersion: '2.7.0', seen: '' })), ['seven', 'six']);
});

test('every shipped note is short, plain and versioned', () => {
  for (const n of WHATS_NEW) {
    assert.match(n.version, /^\d+\.\d+\.\d+$/);
    assert.ok(n.text.length <= 240, `keep "${n.version}" to a sentence or two`);
    assert.doesNotMatch(n.text, /—/, 'no em dashes in client-facing copy');
  }
});

test('the admin serves unseen notes and remembers "Got it" per clone', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-whatsnew-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/pages'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/pages/home.md'), '---\ntitle: Home\n---\nWelcome\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  const boot = (port, workflow) => {
    if (workflow) {
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(path.join(root, '.github/workflows/publish-deploy.yml'), workflow);
    }
    return startAdmin({ root, port, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid', fields: { 'pages/home': [{ name: 'title', label: 'Title' }] } });
  };
  const ready = async server => { if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }); return `http://127.0.0.1:${server.address().port}`; };
  const close = server => server.listening ? new Promise(resolve => server.close(resolve)) : null;
  const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const shipped = unseenNotes({ engineVersion: version, workflowText: 'deploy-status', seen: '' });

  // A site whose workflow reports deploy status gets the deploy note.
  const a = boot(4487, 'run: bash .github/deploy-status.sh building\n');
  try {
    const base = await ready(a);
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.equal(config.engineVersion, version);
    assert.deepEqual(config.whatsNew, shipped);
    const seen = await fetch(`${base}/api/whats-new/seen`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' });
    assert.equal(seen.status, 200);
    assert.deepEqual((await (await fetch(`${base}/api/config`)).json()).whatsNew, [], 'dismissed');
    const stored = path.join(root, '.git', 'ascend-site-admin', 'whats-new-seen');
    assert.equal(fs.readFileSync(stored, 'utf8').trim(), version, 'kept in git metadata, not the working tree');
    assert.equal(execFileSync('git', ['status', '--porcelain', '--', '.git'], { cwd: root, encoding: 'utf8' }), '');
  } finally { await close(a); }

  // A new clone (no record) of a site without the reporting workflow: the
  // deploy note is not offered at all.
  fs.rmSync(path.join(root, '.git', 'ascend-site-admin', 'whats-new-seen'));
  fs.rmSync(path.join(root, '.github'), { recursive: true });
  const b = boot(4488);
  try {
    const config = await (await fetch(`${await ready(b)}/api/config`)).json();
    assert.deepEqual(config.whatsNew, shipped.filter(n => !WHATS_NEW.find(w => w.version === n.version)?.requires));
  } finally { await close(b); }
});
