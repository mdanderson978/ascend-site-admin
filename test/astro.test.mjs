import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { HtmlValidate } from 'html-validate';
import { createVariants, mediaPaths, readManifest } from '../media.mjs';
import { checkPage, fallbackFileName, mediaResolver, renderLayout } from '../elements/index.mjs';
import safeMatter from '../safe-matter.mjs';

// A real Astro build of test/fixtures/astro-site against a temporary content
// checkout: the hand-written YAML layout must render byte-for-byte as it does
// in Node, with the brand, fallbacks and budget handled by the integration.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(repoRoot, 'test', 'fixtures', 'astro-site');
const run = promisify(execFile);

const HOME = `---
title: Deck restoration
layout:
  schema: 1
  children:
    - type: section
      id: hero001
      props:
        background: ../../assets/uploads/hero.webp
        align: center
      children:
        - type: heading
          id: head001
          props: { kicker: Melbourne, text: Decks made new again, level: 2 }
        - type: buttons
          id: btns001
          children:
            - type: button
              id: btn0001
              props: { text: Get a quote, link: { page: contact } }
    - type: section
      id: body001
      props: { tone: muted }
      children:
        - type: prose
          id: pros001
          props: { html: '<p>We sand, repair and oil timber decks.</p>' }
        - type: image
          id: imag001
          props: { image: ../../assets/uploads/deck.webp, alt: An oiled deck }
        - type: faq
          id: faqs001
          children:
            - type: faq_item
              id: faqi001
              props: { question: How long does it take?, answer: '<p>Most decks take two days.</p>' }
---
`;

async function photo(width, height, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${hue},50%,45%)"/><circle cx="${width / 3}" cy="${height / 2}" r="${height / 4}" fill="#fff" opacity=".6"/></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

async function contentRepo(dir) {
  for (const sub of ['src/content/pages', 'src/assets/uploads', 'public']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/content/pages/home.md'), HOME);
  fs.writeFileSync(path.join(mediaPaths(dir).uploads, 'hero.webp'), await photo(1920, 1080, 140));
  fs.writeFileSync(path.join(mediaPaths(dir).uploads, 'deck.webp'), await photo(1200, 800, 30));
  await createVariants(dir, 'hero.webp');
  await createVariants(dir, 'deck.webp');
}

function linkEngine() {
  // The test site depends on the engine as a content repo would: node_modules/site-admin.
  const link = path.join(site, 'node_modules', 'site-admin');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  if (!fs.existsSync(link)) fs.symlinkSync(repoRoot, link, 'junction');
}

const between = (html, start, end) => html.slice(html.indexOf(start) + start.length, html.indexOf(end));

test('a stored layout builds in Astro exactly as it renders in Node', { timeout: 180_000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-astro-'));
  if (process.env.KEEP_BUILD) console.log('build kept in', tmp);
  else t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const content = path.join(tmp, 'content');
  const out = path.join(tmp, 'dist');
  await contentRepo(content);
  linkEngine();

  const { stdout } = await run(process.execPath, [path.join(repoRoot, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', site], {
    cwd: site,
    env: { ...process.env, CONTENT_ROOT: content, OUT_DIR: out, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');

  // Same body as Node.
  const { data } = safeMatter(HOME);
  const node = await renderLayout(data.layout, { resolveImage: mediaResolver(readManifest(content)) });
  assert.equal(between(html, '<!--builder-->', '<!--/builder-->').trim(), node.html);
  assert.deepEqual(node.problems, []);

  // Head: only the element CSS this page uses, the brand variables, and FAQ structured data.
  assert.match(html, /<style data-ascend-builder>/);
  assert.match(html, /\.ab-faq/);
  assert.doesNotMatch(html, /\.ab-callout\b/, 'callout CSS is not shipped on a page without a callout');
  assert.match(html, /@layer ascend-brand/);
  assert.match(html, /--ab-color-primary-500:/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/, 'every stylesheet is inlined');

  // Images: AVIF from the content repo's public/media, fallbacks copied (not encoded) by the build.
  const { entries } = readManifest(content);
  for (const [name, entry] of Object.entries(entries)) {
    const fallback = path.join(out, 'media', fallbackFileName(name, entry.hash));
    assert.ok(fs.existsSync(fallback), `${name} fallback copied`);
    assert.deepEqual(fs.readFileSync(fallback), fs.readFileSync(path.join(mediaPaths(content).uploads, name)));
    for (const width of entry.widths) assert.ok(fs.existsSync(path.join(out, 'media', `${name.replace('.webp', '')}-${entry.hash}-${width}.avif`)));
  }

  // brand.json for the admin, with the engine version that built the site.
  const brand = JSON.parse(fs.readFileSync(path.join(out, '_ascend', 'brand.json'), 'utf8'));
  assert.equal(brand.engine, JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version);
  assert.deepEqual(brand.colors.map(c => c.name), ['primary', 'accent', 'dark', 'light']);
  assert.deepEqual(brand.problems, []);

  // The page passes its own budget (strict mode would have failed the build) and is valid HTML.
  assert.deepEqual(checkPage(html).problems, []);
  assert.match(stdout, /performance budget checked on 1 builder page/);
  const report = await new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: { 'no-inline-style': ['error', { allowedProperties: ['--ab-focal'] }], 'attribute-boolean-style': 'off', 'void-style': 'off', 'doctype-style': 'off' },
  }).validateString(html);
  assert.ok(report.valid, JSON.stringify(report.results.flatMap(r => r.messages.map(m => m.message))));
});
