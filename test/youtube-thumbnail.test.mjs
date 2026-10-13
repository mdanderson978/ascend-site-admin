// thumbnailField (2.16.0): a YouTube field fills a sibling image field with
// the video's thumbnail on save, so a site build never contacts YouTube.
// i.ytimg.com is faked here (no network in tests); every other fetch (the
// tests' own calls to the admin server) passes straight through.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import sharp from 'sharp';
import { startAdmin } from '../index.mjs';

sharp.cache(false);

const ID_HD = 'aaaaaaaaaaa';   // has maxresdefault
const ID_SD = 'bbbbbbbbbbb';   // only hqdefault (480x360, letterboxed)
const ID_NEW = 'ccccccccccc';  // has maxresdefault

const jpeg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } }).jpeg().toBuffer();
let ytOffline = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.startsWith('https://i.ytimg.com/')) return realFetch(url, opts);
  if (ytOffline) throw new Error('network down');
  const [, id, size] = u.match(/vi\/([\w-]{11})\/(\w+)\.jpg/);
  if (size === 'maxresdefault' && id !== ID_SD) return new Response(await jpeg(1280, 720));
  if (size === 'hqdefault') return new Response(await jpeg(480, 360));
  return new Response('', { status: 404 });
};

const FIELDS = [
  { name: 'title', label: 'Title', type: 'string', required: true },
  { name: 'video', label: 'YouTube Video', type: 'string', thumbnailField: 'thumbnail' },
  { name: 'thumbnail', label: 'Thumbnail', type: 'image' },
];

function fixture(sermon) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-yt-'));
  fs.mkdirSync(path.join(root, 'src/content/sermons'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/assets/uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/documents'), { recursive: true });
  if (sermon) fs.writeFileSync(path.join(root, 'src/content/sermons/one.md'), matter.stringify('', sermon));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

function boot(root, port, fields = FIELDS) {
  return startAdmin({
    root, port, pullOnStart: false,
    siteTitle: 'Fixture Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    fields: {},
    dynamicCollections: { sermons: { label: 'Sermon', titleField: 'title', fields } },
  });
}

async function ready(server) {
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return `http://127.0.0.1:${server.address().port}`;
}
const shutdown = server => server.listening && new Promise(r => server.close(r));

async function save(base, key, data) {
  const res = await fetch(`${base}/api/content/${key}`, {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ data, body: '' }),
  });
  return { status: res.status, json: await res.json() };
}
const read = (root, slug = 'one') => matter(fs.readFileSync(path.join(root, `src/content/sermons/${slug}.md`), 'utf8')).data;

test('saving a YouTube link fills the empty thumbnail with the 1280px image', async t => {
  const root = fixture({ title: 'One' });
  const server = boot(root, 4461);
  t.after(async () => { await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  const r = await save(base, 'sermons/one', { title: 'One', video: `https://www.youtube.com/watch?v=${ID_HD}` });
  assert.equal(r.status, 200);
  assert.equal(r.json.reload, true);
  assert.equal(read(root).thumbnail.src, `../../assets/uploads/youtube-${ID_HD}.webp`);
  const meta = await sharp(path.join(root, `src/assets/uploads/youtube-${ID_HD}.webp`)).metadata();
  assert.deepEqual([meta.width, meta.height], [1280, 720]);
});

test('a video with only the 4:3 thumbnail is cropped to 16:9 (no black bars)', async t => {
  const root = fixture({ title: 'One' });
  const server = boot(root, 4462);
  t.after(async () => { await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  await save(base, 'sermons/one', { title: 'One', video: ID_SD });
  const meta = await sharp(path.join(root, `src/assets/uploads/youtube-${ID_SD}.webp`)).metadata();
  assert.deepEqual([meta.width, meta.height], [480, 270]);
});

test('creating a new entry with a link fills the thumbnail too', async t => {
  const root = fixture();
  const server = boot(root, 4463);
  t.after(async () => { await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  const r = await save(base, 'sermons/new', { title: 'Brand New', video: `https://youtu.be/${ID_NEW}` });
  assert.equal(r.status, 200);
  assert.equal(read(root, r.json.slug).thumbnail.src, `../../assets/uploads/youtube-${ID_NEW}.webp`);
});

test("an editor's own thumbnail is never replaced, even when the link changes", async t => {
  const root = fixture({ title: 'One', video: ID_HD, thumbnail: { src: '../../assets/uploads/123-custom.webp', alt: 'Custom' } });
  const server = boot(root, 4464);
  t.after(async () => { await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  const r = await save(base, 'sermons/one', { title: 'One', video: ID_NEW });
  assert.equal(r.json.reload, undefined);
  assert.equal(read(root).thumbnail.src, '../../assets/uploads/123-custom.webp');
});

test('an engine-made thumbnail follows the link when it changes', async t => {
  const root = fixture({ title: 'One', video: ID_HD, thumbnail: { src: `../../assets/uploads/youtube-${ID_HD}.webp`, alt: '' } });
  const server = boot(root, 4465);
  t.after(async () => { await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  await save(base, 'sermons/one', { title: 'One', video: ID_NEW });
  assert.equal(read(root).thumbnail.src, `../../assets/uploads/youtube-${ID_NEW}.webp`);
});

test('a failed download never blocks the save; the thumbnail stays empty for a retry', async t => {
  const root = fixture({ title: 'One' });
  const server = boot(root, 4466);
  t.after(async () => { ytOffline = false; await shutdown(server); fs.rmSync(root, { recursive: true, force: true }); });
  const base = await ready(server);
  ytOffline = true;
  const r = await save(base, 'sermons/one', { title: 'One Edited', video: ID_HD });
  assert.equal(r.status, 200);
  assert.equal(read(root).title, 'One Edited');
  assert.equal(read(root).thumbnail, undefined);
});

test('thumbnailField must name an image field (fails at boot)', () => {
  const root = fixture();
  try {
    assert.throws(
      () => boot(root, 4467, [{ name: 'title', label: 'Title', type: 'string' }, { name: 'video', label: 'Video', type: 'string', thumbnailField: 'nope' }]),
      /thumbnailField "nope"/,
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
