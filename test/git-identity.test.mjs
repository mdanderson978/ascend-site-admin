// Commit identity (2.19.1): an editor's own git identity is kept; a machine
// without one commits as the site and the computer's login, never as the
// developer. The pre-2.19.1 default (Website Admin <developerEmail>) is
// replaced on the next start.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { startAdmin } from '../index.mjs';

// No global or system identity, whatever the machine running the tests has.
const emptyGlobal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-gitcfg-')), 'gitconfig');
fs.writeFileSync(emptyGlobal, '');
process.env.GIT_CONFIG_GLOBAL = emptyGlobal;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const DEV = 'developer@example.invalid';
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const local = (root, key) => { try { return git(root, 'config', '--local', key); } catch (_) { return ''; } };

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-id-'));
  fs.mkdirSync(path.join(root, 'src/content/pages'), { recursive: true });
  git(root, 'init', '-q');
  return root;
}

let nextPort = 4386;
async function bootAndClose(root, extra = {}) {
  const server = startAdmin({
    root, port: nextPort++, pullOnStart: false,
    siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: DEV,
    siteUrl: 'https://www.example.org/', fields: {}, ...extra,
  });
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  await new Promise((resolve) => server.close(resolve));
}

const login = os.userInfo().username;

test('a machine with no identity commits as the site and its login', async () => {
  const root = fixture();
  await bootAndClose(root);
  assert.equal(local(root, 'user.name'), `Fixture Site (${login})`);
  assert.equal(local(root, 'user.email'), 'site-admin@example.org');
});

test('the old Website Admin <developerEmail> default is replaced', async () => {
  const root = fixture();
  git(root, 'config', 'user.name', 'Website Admin');
  git(root, 'config', 'user.email', DEV);
  await bootAndClose(root);
  assert.equal(local(root, 'user.name'), `Fixture Site (${login})`);
  assert.equal(local(root, 'user.email'), 'site-admin@example.org');
});

test("an editor's own identity is kept", async () => {
  const root = fixture();
  git(root, 'config', 'user.name', 'Noah');
  git(root, 'config', 'user.email', 'noah@example.org');
  await bootAndClose(root);
  assert.equal(local(root, 'user.name'), 'Noah');
  assert.equal(local(root, 'user.email'), 'noah@example.org');
});

test('config.gitIdentity overrides the fallback', async () => {
  const root = fixture();
  await bootAndClose(root, { gitIdentity: { name: 'Church Office', email: 'office@example.org' } });
  assert.equal(local(root, 'user.name'), 'Church Office');
  assert.equal(local(root, 'user.email'), 'office@example.org');
});
