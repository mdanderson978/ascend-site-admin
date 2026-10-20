import assert from 'node:assert/strict';
import test from 'node:test';
import { HtmlValidate } from 'html-validate';
import { builtinElements, h, createRegistry, defineElement, renderLayout, sizesFor, structuredDataHtml } from '../../elements/index.mjs';

const avifHost = (extra = {}) => ({
  resolveImage: async src => ({
    width: 1920,
    height: 1280,
    focal: { x: 40, y: 25 },
    avif: [400, 800, 1200, 1600, 1920].map(w => ({ url: `/media/${src}-${w}.avif`, width: w })),
    fallback: { url: `/media/${src}.webp` },
  }),
  ...extra,
});

const validator = new HtmlValidate({
  extends: ['html-validate:recommended'],
  rules: {
    // Focal points are passed as a custom property; nothing else may be inline.
    'no-inline-style': ['error', { allowedProperties: ['--ab-focal'] }],
  },
});

// Validate as a real page would contain it: one H1 from the page template, then the layout.
async function assertValidHtml(body, label) {
  const page = `<!DOCTYPE html><html lang="en"><head><title>Test page</title></head><body><main><h1>Page title</h1>${body}</main></body></html>`;
  const report = await validator.validateString(page);
  const messages = report.results.flatMap(r => r.messages.map(m => `${m.ruleId}: ${m.message} [${m.selector}]`));
  assert.equal(report.valid, true, `${label} produced invalid HTML:\n${messages.join('\n')}`);
}

const section = (children, props = {}) => ({ type: 'section', props, children });

// A "maximal" example of every element: all content fields filled. A new
// element must add an entry here, so its output is validated from day one.
const MAXIMAL = {
  section: () => section([{ type: 'heading', props: { text: 'Inside a section' } }], { background: 'bg', tone: 'brand', spacing: 'xl', width: 'wide', overlay: 'strong', align: 'center', anchor: 'intro' }),
  article: () => section([{ type: 'article', props: { anchor: 'guide' }, children: [{ type: 'prose', props: { html: '<p>Article body</p>' } }] }]),
  heading: () => section([{ type: 'heading', props: { kicker: 'Kicker', text: 'Heading text', link: { page: 'about' }, size: 'display', align: 'center', level: 'h3', anchor: 'heading-anchor' } }]),
  prose: () => section([{ type: 'prose', props: { html: '<h2>Sub</h2><p>Text with <a href="/x">a link</a>, <strong>bold</strong> and <em>italic</em>.</p><ul><li>One<ol><li>Nested</li></ol></li></ul><h3>Deeper</h3><p>More</p>' } }]),
  image: () => section([{ type: 'image', props: { image: 'photo', alt: 'A photo of something', caption: 'Caption', link: { url: 'https://example.com' }, ratio: 'portrait' } }]),
  buttons: () => section([{ type: 'buttons', props: { align: 'center' }, children: [{ type: 'button', props: { text: 'Call us', link: { tel: '03 9000 0000' } } }] }]),
  button: () => section([{ type: 'buttons', children: [{ type: 'button', props: { text: 'Download', link: { document: 'price list.pdf' }, style: 'secondary', newTab: true } }, { type: 'button', props: { text: 'Email', link: { email: 'hello@example.com' }, style: 'text' } }] }]),
  callout: () => section([{ type: 'callout', props: { variant: 'warning', title: 'Careful', text: '<p>Watch out</p><ul><li>For this</li></ul>' } }]),
  faq: () => section([{ type: 'faq', children: [{ type: 'faq_item', props: { question: 'First?', answer: '<p>Yes.</p>' } }] }]),
  faq_item: () => section([{ type: 'faq', children: [{ type: 'faq_item', props: { question: 'Open?', answer: '<p>It is <a href="#x">open</a>.</p>', open: true, anchor: 'open-q' } }] }]),
};

test('every built-in element has a maximal fixture', () => {
  for (const def of builtinElements) assert.ok(MAXIMAL[def.name], `add a MAXIMAL fixture for "${def.name}"`);
});

for (const def of builtinElements) {
  for (const mode of ['build', 'preview']) {
    test(`${def.name} (${mode}) renders valid HTML with no problems`, async () => {
      const out = await renderLayout({ children: [MAXIMAL[def.name]()] }, avifHost({ mode }));
      assert.ok(out.html.includes(`ab-${def.css}`) || out.html.includes(`ab-${def.name}`), `${def.name} output uses its own classes`);
      assert.deepEqual(out.problems, []);
      await assertValidHtml(out.html, `${def.name} (${mode})`);
    });
  }
}

test('empty elements render nothing in build mode and placeholders in preview, all valid', async () => {
  const layout = { children: builtinElements.filter(d => d.allowedParents.includes('section')).map(d => section([{ type: d.name }])) };
  const build = await renderLayout(layout, avifHost());
  assert.equal(build.html, '', 'nothing empty reaches a published page');
  const preview = await renderLayout(layout, avifHost({ mode: 'preview' }));
  assert.match(preview.html, /A clear, helpful heading/);
  assert.match(preview.html, /How long does it take\?/);
  assert.equal((preview.html.match(/data-node="[^"]*-ph\d+"/g) || []).length, 0, 'sample children are not selectable nodes');
  assert.ok(!preview.problems.some(p => /-ph\d+$/.test(p.id)), 'sample children never raise problems');
  await assertValidHtml(preview.html, 'placeholders');
});

test('exactly one LCP image: the first image in the first visible section', async () => {
  const out = await renderLayout(
    {
      children: [
        section([{ type: 'image', props: { image: 'hidden-one', alt: 'x' } }], { hidden: true }),
        section([{ type: 'heading', props: { text: 'Hero' } }, { type: 'image', props: { image: 'hero', alt: 'Hero photo' } }, { type: 'image', props: { image: 'second', alt: 'Second' } }]),
        section([{ type: 'image', props: { image: 'later', alt: 'Later' } }]),
      ],
    },
    avifHost(),
  );
  assert.equal((out.html.match(/fetchpriority="high"/g) || []).length, 1);
  assert.match(out.html, /src="\/media\/hero\.webp"[^>]*loading="eager" fetchpriority="high"/);
  assert.match(out.html, /src="\/media\/second\.webp"[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.doesNotMatch(out.html, /hidden-one/);
});

test('a section background photo is the LCP image when it comes first', async () => {
  const out = await renderLayout({ children: [section([{ type: 'image', props: { image: 'inner', alt: 'Inner' } }], { background: 'bg' })] }, avifHost());
  assert.match(out.html, /class="ab-section__bg" src="\/media\/bg\.webp"[^>]*fetchpriority="high"/);
  assert.match(out.html, /src="\/media\/inner\.webp"[^>]*loading="lazy"/);
});

test('no image gets priority when the first section has none', async () => {
  const out = await renderLayout({ children: [section([{ type: 'heading', props: { text: 'Text only' } }]), section([{ type: 'image', props: { image: 'below', alt: 'Below' } }])] }, avifHost());
  assert.doesNotMatch(out.html, /fetchpriority/);
});

test('sizes follow where the image sits', async () => {
  assert.equal(sizesFor({ max: null }), '100vw');
  assert.equal(sizesFor({ max: 1200 }), '(min-width: 1264px) 1200px, calc(100vw - 2rem)');
  assert.equal(sizesFor({ max: 1200, fraction: 1 / 3 }), '(min-width: 1264px) 400px, calc((100vw - 2rem) * 0.3333)');
  const out = await renderLayout(
    {
      children: [
        section([{ type: 'image', props: { image: 'std', alt: 'a' } }]),
        section([{ type: 'image', props: { image: 'full', alt: 'b' } }], { width: 'full' }),
        section([{ type: 'article', children: [{ type: 'image', props: { image: 'art', alt: 'c' } }] }]),
      ],
    },
    avifHost(),
  );
  const sizes = [...out.html.matchAll(/sizes="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sizes, ['(min-width: 1264px) 1200px, calc(100vw - 2rem)', '100vw', '(min-width: 824px) 760px, calc(100vw - 2rem)']);
});

test('images: AVIF picture with WebP fallback, plain img without a set, problems for missing files and alt text', async () => {
  const one = await renderLayout({ children: [section([{ type: 'image', props: { image: 'p', alt: 'Alt' } }])] }, avifHost());
  assert.match(one.html, /<picture><source type="image\/avif" srcset="\/media\/p-400\.avif 400w, [^"]+1920w" sizes="[^"]+"><img [^>]*src="\/media\/p\.webp"[^>]*width="1920" height="1280"[^>]*style="--ab-focal: 40% 25%"/);

  const legacy = await renderLayout({ children: [section([{ type: 'image', props: { image: 'old', alt: 'Old' } }])] }, { resolveImage: async () => ({ url: '/old.webp', width: 800, height: 600 }) });
  assert.match(legacy.html, /<figure class="ab-image"><img [^>]*src="\/old\.webp"/);
  assert.doesNotMatch(legacy.html, /<picture>/);

  const missing = await renderLayout({ children: [section([{ type: 'image', props: { image: 'gone', alt: 'x' } }, { type: 'image', props: { image: 'p' } }])] }, { resolveImage: async src => (src === 'gone' ? null : { url: '/p.webp', width: 1, height: 1 }) });
  assert.ok(missing.problems.some(p => /couldn't be found/.test(p.message)));
  assert.ok(missing.problems.some(p => /missing its description/.test(p.message)));

  const decorative = await renderLayout({ children: [section([{ type: 'image', props: { image: 'p', decorative: true } }])] }, avifHost());
  assert.match(decorative.html, / alt=""/);
  assert.deepEqual(decorative.problems, []);
});

test('heading ids are unique, explicit anchors are never taken, and sections are labelled by their heading', async () => {
  const out = await renderLayout(
    {
      children: [
        section([{ type: 'heading', props: { text: 'Pricing' } }, { type: 'prose', props: { html: '<h2>Pricing</h2><h3>Café &amp; more</h3>' } }]),
        section([{ type: 'heading', props: { text: 'Somewhere else', anchor: 'pricing' } }]),
        section([{ type: 'heading', props: { text: '2026 rates', kicker: 'New' } }]),
      ],
    },
    avifHost(),
  );
  const ids = [...out.html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['pricing-2', 'pricing-3', 'cafe-more', 'pricing', 'h-2026-rates']);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(out.headings, [
    { level: 2, text: 'Pricing', id: 'pricing-3' },
    { level: 3, text: 'Café & more', id: 'cafe-more' },
  ]);
  const labels = [...out.html.matchAll(/<section [^>]*aria-labelledby="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(labels, ['pricing-2', 'pricing', 'h-2026-rates']);
  assert.equal((out.html.match(/id="h-2026-rates"/g) || []).length, 1, 'kicker headings carry the id once');
});

test('alignment: blocks follow their section unless they override it', async () => {
  const out = await renderLayout(
    {
      children: [
        section(
          [
            { type: 'heading', props: { text: 'Follows' } },
            { type: 'heading', props: { text: 'Left anyway', align: 'start' } },
            { type: 'prose', props: { html: '<p>Short intro.</p>' } },
            { type: 'buttons', children: [{ type: 'button', props: { text: 'Go', link: { page: 'x' } } }] },
            { type: 'buttons', props: { align: 'start' }, children: [{ type: 'button', props: { text: 'Left', link: { page: 'x' } } }] },
          ],
          { align: 'center' },
        ),
        section([{ type: 'heading', props: { text: 'Centred alone', align: 'center' } }]),
      ],
    },
    avifHost(),
  );
  assert.match(out.html, /class="ab-section__inner ab-section__inner--default ab-section__inner--center"/);
  assert.match(out.html, /<h2 class="ab-heading ab-heading--l" id="follows">/, 'auto adds no class, so it inherits');
  assert.match(out.html, /<h2 class="ab-heading ab-heading--l ab-heading--start" id="left-anyway">/);
  assert.match(out.html, /<div class="ab-buttons"><a/);
  assert.match(out.html, /<div class="ab-buttons ab-buttons--start">/);
  assert.match(out.html, /<h2 class="ab-heading ab-heading--l ab-heading--center" id="centred-alone">/);
  assert.equal((out.html.match(/ab-section__inner--center/g) || []).length, 1, 'only the centred section is centred');
  assert.deepEqual(out.problems, []);

  const css = (await import('../../elements/css.mjs')).elementCss(['section', 'buttons', 'callout', 'faq', 'article']);
  assert.match(css, /\.ab-section__inner--center \{ text-align: center; --ab-justify: center; \}/);
  assert.match(css, /justify-content: var\(--ab-justify, flex-start\)/);
  for (const block of ['.ab-callout', '.ab-faq', '.ab-article']) {
    assert.match(css, new RegExp(`\\${block} \\{[^}]*text-align: start`), `${block} stays left-aligned`);
  }
});

test('a centred section with a lot of text gets a readability warning', async () => {
  const long = '<p>' + 'Several sentences of text. '.repeat(10) + '</p><p>More.</p><p>More.</p><p>More.</p>';
  const centred = await renderLayout({ children: [section([{ type: 'prose', props: { html: long } }], { align: 'center' })] }, avifHost());
  assert.ok(centred.problems.some(p => p.field === 'align' && /hard to read/.test(p.message)));
  const left = await renderLayout({ children: [section([{ type: 'prose', props: { html: long } }])] }, avifHost());
  assert.deepEqual(left.problems, []);
});

test('duplicate or malformed anchors are reported but still produce valid, unique ids', async () => {
  const out = await renderLayout(
    {
      children: [
        section([
          { type: 'heading', props: { text: 'A', anchor: 'same' } },
          { type: 'heading', props: { text: 'B', anchor: 'same' } },
          { type: 'heading', props: { text: 'C', anchor: 'Not A Valid Anchor!' } },
          { type: 'callout', props: { text: '<p>x</p>', anchor: 'same' } },
        ]),
      ],
    },
    avifHost(),
  );
  const ids = [...out.html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['same', 'same-2', 'not-a-valid-anchor', 'same-3']);
  assert.equal(out.problems.filter(p => /used more than once/.test(p.message)).length, 2);
  await assertValidHtml(out.html, 'bad anchors');
});

test('links resolve from references, and unsafe or missing links never render', async () => {
  const button = link => ({ type: 'button', props: { text: 'Go', link } });
  const out = await renderLayout(
    {
      children: [
        section([
          {
            type: 'buttons',
            children: [
              button({ page: 'home' }),
              button({ page: 'services/decks', anchor: 'prices' }),
              button({ tel: '(03) 9000 0000' }),
              button({ email: 'a@b.co' }),
              button({ document: 'price list.pdf' }),
              button({ anchor: 'faq' }),
              button({ url: 'https://example.com/x' }),
              button({ url: 'javascript:alert(1)' }),
              button(null),
            ],
          },
        ]),
      ],
    },
    avifHost(),
  );
  const hrefs = [...out.html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(hrefs, ['/', '/services/decks/#prices', 'tel:0390000000', 'mailto:a@b.co', '/documents/price%20list.pdf', '#faq', 'https://example.com/x']);
  assert.equal(out.problems.filter(p => /nowhere to go/.test(p.message)).length, 2);

  const custom = await renderLayout({ children: [section([{ type: 'buttons', children: [button({ page: 'about' })] }])] }, { resolveLink: ref => (ref.page ? `/en/${ref.page}` : undefined) });
  assert.match(custom.html, /href="\/en\/about"/);
});

test('FAQ blocks combine into one FAQPage object; opted-out and placeholder items are left out', async () => {
  const item = (question, answer) => ({ type: 'faq_item', props: { question, answer } });
  const out = await renderLayout(
    {
      children: [
        section([{ type: 'faq', children: [item('One?', '<p>A1</p>')] }, { type: 'faq', props: { schema: false }, children: [item('Hidden from schema?', '<p>A2</p>')] }]),
        section([{ type: 'faq', children: [item('Two? </script>', '<p>A3</p>')] }]),
      ],
    },
    avifHost(),
  );
  assert.equal(out.structuredData.length, 1);
  assert.deepEqual(out.structuredData[0].mainEntity.map(q => q.name), ['One?', 'Two? </script>']);
  const tag = structuredDataHtml(out.structuredData);
  assert.equal((tag.match(/<\/script>/g) || []).length, 1, 'question text cannot close the script tag');
  assert.match(tag, /Two\? \\u003c\/script>/);

  const preview = await renderLayout({ children: [section([{ type: 'faq' }])] }, { mode: 'preview' });
  assert.deepEqual(preview.structuredData, []);
});

test('hidden blocks are skipped and empty containers collapse unless they have a background', async () => {
  const out = await renderLayout(
    {
      children: [
        section([{ type: 'heading', props: { text: 'Hidden', hidden: true } }]),
        section([], { background: 'bg' }),
        section([{ type: 'buttons', children: [] }]),
      ],
    },
    avifHost(),
  );
  assert.doesNotMatch(out.html, /Hidden/);
  assert.equal((out.html.match(/<section/g) || []).length, 1);
  assert.match(out.html, /ab-section__bg/);
});

test('unknown types use the host renderer, or report a problem and render nothing', async () => {
  const layout = { children: [{ type: 'custom_map', id: 'm1', props: { zoom: 3 } }] };
  const withHost = await renderLayout(layout, { renderUnknown: async node => `<div class="site-map" data-zoom="${node.props.zoom}"></div>` });
  assert.equal(withHost.html, '<div class="site-map" data-zoom="3"></div>');
  const without = await renderLayout(layout, {});
  assert.equal(without.html, '');
  assert.ok(without.problems.some(p => p.id === 'm1' && /No renderer/.test(p.message)));
});

test('css lists exactly the stylesheets the page uses', async () => {
  const out = await renderLayout({ children: [section([{ type: 'buttons', children: [{ type: 'button', props: { text: 'Go', link: { page: 'x' } } }] }, { type: 'faq', children: [{ type: 'faq_item', props: { question: 'Q', answer: '<p>A</p>' } }] }])] }, avifHost());
  assert.deepEqual(out.css.sort(), ['buttons', 'faq', 'section']);
});

test('a render() that returns a plain string is a developer error, caught immediately', async () => {
  const bad = defineElement({ name: 'bad', title: 'Bad', group: 'T', ai: 'A bad element.', allowedParents: ['layout'], render: () => '<p>unescaped</p>' });
  const good = defineElement({ name: 'good', title: 'Good', group: 'T', ai: 'A good element.', allowedParents: ['layout'], render: () => h`<p>ok</p>` });
  await assert.rejects(renderLayout({ children: [{ type: 'bad' }] }, {}, createRegistry([bad])), /must return h`/);
  assert.equal((await renderLayout({ children: [{ type: 'good' }] }, {}, createRegistry([good]))).html, '<p>ok</p>');
});
