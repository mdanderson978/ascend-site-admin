import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import grayMatter from 'gray-matter';
import matter, { UnsafeFrontMatterError } from '../safe-matter.mjs';
import { startAdmin } from '../index.mjs';

// A front-matter block that, if evaluated, flips a global flag.
const payload = (opener = '---js') => `${opener}\n{ title: (globalThis.__frontMatterRan = true, 'owned') }\n---\nBody\n`;

test('plain gray-matter really does run ---js front matter (the threat this guards against)', () => {
  globalThis.__frontMatterRan = false;
  const parsed = grayMatter(payload(), {}); // options bypass gray-matter's cache
  assert.equal(globalThis.__frontMatterRan, true);
  assert.equal(parsed.data.title, 'owned');
  globalThis.__frontMatterRan = false;
});

test('safe-matter refuses JavaScript front matter in every spelling, without running it', () => {
  for (const opener of ['---js', '---JS', '---Js', '---javascript', '---JavaScript', '--- js']) {
    globalThis.__frontMatterRan = false;
    assert.throws(() => matter(payload(opener)), UnsafeFrontMatterError, opener);
    assert.equal(globalThis.__frontMatterRan, false, `${opener} must not execute`);
  }
});

test('safe-matter still reads YAML and JSON front matter and writes files as before', () => {
  assert.deepEqual(matter('---\ntitle: Home\ncount: 2\n---\nWelcome\n').data, { title: 'Home', count: 2 });
  assert.deepEqual(matter('---json\n{ "title": "Json" }\n---\n').data, { title: 'Json' });
  assert.equal(matter('No front matter at all').content, 'No front matter at all');
  const written = matter.stringify('Body\n', { title: 'Home', tags: ['a', 'b'] });
  assert.equal(written, grayMatter.stringify('Body\n', { title: 'Home', tags: ['a', 'b'] }));
  assert.deepEqual(matter(written).data, { title: 'Home', tags: ['a', 'b'] });
});

test('the admin never runs JavaScript front matter from a content file, and keeps serving', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-safe-matter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/content/pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/content/sermons'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/assets/uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/documents'), { recursive: true });
  const evil = path.join(root, 'src/content/pages/home.md');
  const malformed = path.join(root, 'src/content/pages/broken.md');
  const normal = path.join(root, 'src/content/sermons/2026-01-02.md');
  fs.writeFileSync(evil, payload());
  fs.writeFileSync(malformed, '---\ntitle: [unclosed\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/sermons/2026-01-01.md'), payload('---javascript'));
  fs.writeFileSync(normal, '---\ntitle: Normal\ndate: 2026-01-02\n---\n');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });

  globalThis.__frontMatterRan = false;
  const warnings = [];
  const warn = console.warn;
  console.warn = msg => warnings.push(String(msg));
  t.after(() => { console.warn = warn; });
  const server = startAdmin({
    root, port: 4491, pullOnStart: false, siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: { 'pages/home': [{ name: 'title', label: 'Title' }], 'pages/broken': [{ name: 'title', label: 'Title' }] },
    dynamicCollections: { sermons: { label: 'Sermon', titleField: 'title', sortFields: ['date'], sortDirection: 'desc', fields: [{ name: 'title', label: 'Title' }] } },
  });
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    // Boot ran the stable_id backfill over every file without crashing.
    assert.equal((await fetch(base + '/api/config')).status, 200, 'the admin booted');
    assert.equal(fs.readFileSync(evil, 'utf8'), payload(), 'an unreadable file is never rewritten');
    assert.match(fs.readFileSync(normal, 'utf8'), /stable_id:/, 'readable files are still backfilled');
    assert.ok(warnings.some(w => /Skipped src[\\/]content[\\/]pages[\\/]home\.md: .*JavaScript front matter/.test(w)), warnings.join('\n'));
    assert.ok(warnings.some(w => /Skipped src[\\/]content[\\/]pages[\\/]broken\.md/.test(w)), 'malformed YAML is skipped the same way');

    assert.equal((await fetch(base + '/api/content')).status, 200, 'the content list still loads');
    assert.equal((await fetch(base + '/api/search?q=Normal')).status, 200, 'search still works around the bad files');
    const page = await fetch(base + '/api/content/pages/home');
    assert.notEqual(page.status, 200, 'the malicious page is refused, not served with evaluated data');
    assert.match((await page.json()).error, /JavaScript front matter/, 'and the reason is shown to the editor');
    await fetch(base + '/api/content/sermons/2026-01-01');
    assert.equal(globalThis.__frontMatterRan, false, 'no content file was executed');
    assert.equal((await fetch(base + '/api/config')).status, 200, 'the admin keeps serving');
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    globalThis.__frontMatterRan = false;
  }
});

test('only safe-matter.mjs imports gray-matter directly', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const offenders = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', 'test', 'playground'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(mjs|js|ts|tsx)$/.test(entry.name) && entry.name !== 'safe-matter.mjs' && /from\s+['"]gray-matter['"]/.test(fs.readFileSync(full, 'utf8'))) {
        offenders.push(path.relative(root, full));
      }
    }
  };
  visit(root);
  assert.deepEqual(offenders, [], 'import from ./safe-matter.mjs instead');
});
