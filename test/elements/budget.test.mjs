import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPage, renderLayout, saveLayout } from '../../elements/index.mjs';
import { elementCss } from '../../elements/css.mjs';
import { SAMPLES } from '../../playground/samples.mjs';

const page = (head, body) => `<!DOCTYPE html><html lang="en"><head><title>t</title>${head}</head><body>${body}</body></html>`;
const rules = html => checkPage(html).problems.map(p => p.rule);

const host = {
  resolveImage: async src => {
    const name = String(src).split('/').pop().replace(/\.[^.]+$/, '');
    if (name === 'missing-photo') return null;
    return { width: 1920, height: 1280, avif: [400, 1920].map(w => ({ url: `/media/${name}-${w}.avif`, width: w })), fallback: { url: `/media/${name}.webp` } };
  },
};

test('every playground sample page is within budget as rendered', async () => {
  for (const sample of SAMPLES) {
    if (sample.expectProblems) continue;
    const out = await renderLayout(saveLayout(sample.layout).layout, host);
    const html = page(`<style>${elementCss(out.css)}</style>`, `<main><h1>t</h1>${out.html}</main>`);
    const { problems, stats } = checkPage(html);
    assert.deepEqual(problems, [], sample.id);
    assert.ok(stats.highPriority <= 1, sample.id);
  }
});

test('render-blocking stylesheets and head scripts are caught', () => {
  assert.deepEqual(rules(page('<link rel="stylesheet" href="/site.css">', '')), ['render-blocking']);
  assert.deepEqual(rules(page('<script src="/menu.js"></script>', '')), ['render-blocking']);
  assert.deepEqual(rules(page('<script src="/menu.js" defer></script><script type="module" src="/a.js"></script>', '')), []);
  assert.deepEqual(rules(page('<script type="application/ld+json">{"a":1}</script>', '')), []);
});

test('fonts must be self-hosted woff2 with font-display: optional', () => {
  assert.deepEqual(rules(page('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">', '')), ['third-party-font']);
  const face = (display, url) => page(`<style>@font-face{font-family:Inter;src:url(${url}) format("woff2");font-display:${display}}</style>`, '');
  assert.deepEqual(rules(face('optional', '/fonts/inter.woff2')), []);
  assert.deepEqual(rules(face('swap', '/fonts/inter.woff2')), ['font-display']);
  assert.deepEqual(rules(face('optional', 'https://fonts.gstatic.com/x.woff2')), ['third-party-font']);
  assert.deepEqual(rules(face('optional', '/fonts/inter.ttf')), ['font-display']);
  assert.deepEqual(rules(page('<link rel="preload" as="font" href="/fonts/inter.woff2" type="font/woff2" crossorigin>', '')), []);
  assert.deepEqual(rules(page('<link rel="preload" as="font" href="/fonts/inter.woff2">', '')), ['font-preload']);
});

test('only one high-priority image, never lazy, and every image sized', () => {
  const img = extra => `<img src="/a.webp" width="10" height="10" alt="" ${extra}>`;
  assert.deepEqual(rules(page('', img('fetchpriority="high"'))), []);
  assert.deepEqual(rules(page('', img('fetchpriority="high"') + img('fetchpriority="high"'))), ['lcp']);
  assert.deepEqual(rules(page('', img('fetchpriority="high" loading="lazy"'))), ['lcp']);
  assert.deepEqual(rules(page('', '<img src="/a.webp" alt="">')), ['image-size']);
  assert.deepEqual(rules(page('', '<iframe src="/map" title="m"></iframe>')), ['media-size']);
});

test('builder images need an AVIF source with srcset and sizes; site images such as an SVG logo do not', () => {
  const sized = 'width="10" height="10" alt=""';
  assert.deepEqual(rules(page('', `<header><img src="/logo.svg" ${sized}><img src="/logo.png" ${sized}></header>`)), []);
  assert.deepEqual(rules(page('', `<figure class="ab-image"><img src="/a.webp" ${sized}></figure>`)), ['image-avif']);
  assert.deepEqual(rules(page('', `<figure class="ab-image"><picture><source type="image/avif" srcset="/a.avif 400w"><img src="/a.webp" ${sized}></picture></figure>`)), ['image-avif']);
  assert.deepEqual(rules(page('', `<figure class="ab-image"><picture><source type="image/avif" srcset="/a.avif 400w" sizes="100vw"><img src="/a.webp" ${sized}></picture></figure>`)), []);
});

test('inline CSS and JavaScript budgets', () => {
  const big = 'a{color:red}'.repeat(8000);
  assert.deepEqual(rules(page(`<style>${big}</style>`, '')), ['css-budget']);
  assert.deepEqual(checkPage(page(`<style>${big}</style>`, ''), { css: 200 * 1024 }).problems, []);
  assert.deepEqual(rules(page('', `<script>${'x();'.repeat(6000)}</script>`)), ['js-budget']);
});
