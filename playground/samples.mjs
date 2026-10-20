// Sample pages for the playground, for a fictional business. Image paths
// look like real content-repo uploads; the playground maps them by file name
// to its sample media (hero, feature, detail, portrait, wide).

const img = name => `../../assets/uploads/${name}.webp`;
const heading = (text, props = {}) => ({ type: 'heading', props: { text, ...props } });
const prose = html => ({ type: 'prose', props: { html } });
const button = (text, link, props = {}) => ({ type: 'button', props: { text, link, ...props } });
const buttons = (items, props = {}) => ({ type: 'buttons', props, children: items });
const section = (children, props = {}) => ({ type: 'section', props, children });
const faq = (items, props = {}) => ({ type: 'faq', props, children: items.map(([question, answer]) => ({ type: 'faq_item', props: { question, answer } })) });

export const SAMPLES = [
  {
    id: 'landing',
    title: 'Landing page',
    description: 'A typical home or service page: photo hero, services, reasons, a call to action and FAQs. Check the hero photo is the only high-priority image (HTML tab) and the FAQ data (SEO tab).',
    pageTitle: 'Northside Decks',
    showTitle: false,
    layout: {
      children: [
        section(
          [
            heading('Decks that look new for years', { kicker: 'Northside Decks', size: 'display' }),
            prose('<p>Restoration, oiling and repairs for timber decks across the northern suburbs. Fixed quotes, tidy work, no surprises.</p>'),
            buttons([button('Book a free quote', { page: 'contact' }), button('See our work', { page: 'gallery' }, { style: 'secondary' })]),
          ],
          { background: img('hero'), spacing: 'xl', overlay: 'medium' },
        ),
        section([
          heading('Restoration, oiling and repairs', { kicker: 'What we do', size: 'xl' }),
          prose('<p>Most decks don\'t need replacing. Sanding back, repairing the boards that matter and oiling properly brings back the colour and protects the timber for years.</p>'),
          { type: 'image', props: { image: img('feature'), alt: 'A restored deck beside a family home', ratio: 'landscape', caption: 'A full restoration, finished in three days.' } },
        ]),
        section(
          [
            heading('Why customers choose us', { size: 'l' }),
            prose('<ul><li><strong>Fixed quotes.</strong> The price we quote is the price you pay.</li><li><strong>Proper preparation.</strong> We sand back to clean timber before any oil goes on.</li><li><strong>We tidy up.</strong> Your garden looks like we were never there.</li></ul>'),
          ],
          { tone: 'muted', width: 'narrow' },
        ),
        section(
          [
            heading('Ready for a deck you\'ll love?', { size: 'xl', align: 'center' }),
            buttons([button('Call 03 9000 0000', { tel: '03 9000 0000' }), button('Email us', { email: 'hello@example.com' }, { style: 'text' })], { align: 'center' }),
          ],
          { tone: 'brand', spacing: 'm' },
        ),
        section(
          [
            heading('Common questions', { size: 'l' }),
            faq([
              ['How long does a restoration take?', '<p>Usually two to three days, depending on the size of the deck and the weather.</p>'],
              ['How often should a deck be oiled?', '<p>Every 12 to 18 months for most decks. Decks in full sun may need it yearly.</p>'],
              ['Do you replace boards?', '<p>Yes. We replace damaged boards and match the timber as closely as possible.</p>'],
            ]),
          ],
          { width: 'narrow' },
        ),
      ],
    },
  },
  {
    id: 'guide',
    title: 'Guide article',
    description: 'Article mode: long-form text with components placed between paragraphs. Check the reading width, the heading outline (SEO tab) and that sub-headings get link-able ids.',
    pageTitle: 'How to look after a timber deck',
    showTitle: true,
    layout: {
      children: [
        section(
          [
            {
              type: 'article',
              children: [
                prose('<p>A timber deck is one of the hardest-working parts of a home. Sun, rain and foot traffic all take their toll, but a little regular care keeps it looking good for decades.</p><h2>Why decks turn grey</h2><p>Sunlight breaks down the lignin that holds timber fibres together. The surface turns silver-grey and starts to feel rough. It\'s mostly cosmetic at first, but it lets water in.</p><h3>Is grey timber damaged?</h3><p>Not necessarily. Grey timber can usually be sanded back to fresh wood.</p>'),
                { type: 'image', props: { image: img('detail'), alt: 'Close-up of oiled deck boards', ratio: 'wide', caption: 'Freshly oiled boards: the grain stands out again.' } },
                { type: 'callout', props: { variant: 'opinion', title: 'Our view', text: '<p>Oil before winter, not after. Timber that goes into the wet months unprotected greys twice as fast.</p>' } },
                prose('<h2>How often to oil</h2><p>Every 12 to 18 months for most decks. Read our <a href="/services/oiling/">deck oiling service</a> page for what\'s involved.</p><ol><li>Sweep and wash the deck.</li><li>Let it dry for two days.</li><li>Apply oil with the grain, in thin coats.</li></ol>'),
                { type: 'callout', props: { variant: 'warning', title: 'Before you start', text: '<p>Never pressure-wash softwood decks at full pressure: it tears the grain.</p>' } },
                faq([
                  ['Can I oil a deck myself?', '<p>Yes, if the timber is in good shape. Badly weathered decks need sanding first.</p>'],
                  ['What oil should I use?', '<p>A penetrating decking oil suited to your timber species.</p>'],
                ]),
                buttons([button('Book a deck check', { page: 'contact' })]),
              ],
            },
          ],
          { width: 'narrow' },
        ),
      ],
    },
  },
  {
    id: 'every',
    title: 'Every element and option',
    description: 'All four section colours, every heading size, every image shape and all callout types. Useful for judging the design tokens under each site brand.',
    pageTitle: 'Every element',
    showTitle: true,
    layout: {
      children: [
        ...['default', 'muted', 'brand', 'dark'].map(tone =>
          section(
            [
              heading(`Section colour: ${tone}`, { kicker: 'Tone', size: 'l' }),
              prose(`<p>Body text on the <strong>${tone}</strong> background, with <a href="#">a link</a>. Text and buttons adjust automatically.</p>`),
              buttons([button('Primary', { page: 'x' }), button('Outline', { page: 'x' }, { style: 'secondary' }), button('Text link', { page: 'x' }, { style: 'text' })]),
            ],
            { tone, spacing: 'm' },
          ),
        ),
        section([
          heading('Heading sizes', { kicker: 'Typography', size: 'l' }),
          ...['display', 'xl', 'l', 'm', 's'].map(size => heading(`Size ${size}`, { size, level: 'h3' })),
        ]),
        section([
          heading('Image shapes', { size: 'l' }),
          ...[['auto', 'portrait'], ['landscape', 'feature'], ['wide', 'wide'], ['square', 'detail'], ['portrait', 'portrait']].map(([ratio, name]) => ({
            type: 'image',
            props: { image: img(name), alt: `Sample photo cropped to ${ratio}`, ratio, caption: `Shape: ${ratio}` },
          })),
        ]),
        section(
          [
            heading('Callouts', { size: 'l' }),
            ...['note', 'tip', 'warning', 'opinion'].map(variant => ({ type: 'callout', props: { variant, title: `A ${variant}`, text: `<p>This is the <strong>${variant}</strong> style.</p>` } })),
          ],
          { tone: 'muted', width: 'narrow' },
        ),
        section([heading('An FAQ with one answer open', { size: 'l' }), { type: 'faq', children: [{ type: 'faq_item', props: { question: 'Open by default?', answer: '<p>Yes, this one is.</p>', open: true } }, { type: 'faq_item', props: { question: 'Closed by default?', answer: '<p>This one starts closed.</p>' } }] }], { width: 'narrow' }),
        { type: 'article', children: [prose('<h2>An article placed straight on the page</h2><p>Without a section around it, an article brings its own spacing and gutters.</p>')] },
      ],
    },
  },
  {
    id: 'paste',
    title: 'Messy paste (sanitiser)',
    description: 'What a Word, Google Docs or ChatGPT paste turns into. Compare the YAML on the left with the Saved tab: styles, scripts, fonts and unsafe links are gone, structure is kept.',
    pageTitle: 'Messy paste',
    showTitle: true,
    layout: {
      children: [
        section(
          [
            prose(`<div class="MsoNormal" style="font-family:Calibri;color:#333"><h1>A heading pasted as H1</h1>
              <p style="margin:0cm"><span style="font-size:14pt"><b>Bold from Word</b> and <i>italic</i> and <u>underlined</u> text.</span></p>
              <p>&nbsp;</p><p><br></p>
              <script>alert('this never survives')</script><style>p { color: red }</style>
              <p>A <a href="javascript:alert(1)">dangerous link</a>, a <a href="https://example.com" target="_blank" onclick="track()">normal link</a> and a phone link: <a href="tel:0390000000">03 9000 0000</a>.</p>
              <h4>A level-4 heading</h4>
              <ul><li><p>List item wrapped in a paragraph</p></li><li>Item with a nested list<ol><li>Nested item</li></ol></li></ul>
              <table><tr><td>Table cell text survives as a paragraph</td></tr></table>
              <img src="https://example.com/tracking.gif" alt="dropped">
              </div>
              Loose text with no paragraph at all`),
            { type: 'callout', props: { title: 'Headings in a callout', text: '<h2>Become bold text</h2><p>Callouts don\'t allow headings.</p>' } },
          ],
          { width: 'narrow' },
        ),
      ],
    },
  },
  {
    id: 'empty',
    title: 'Empty blocks',
    description: 'Blocks with nothing in them. On the website nothing renders (no empty wrappers). Switch to Editor preview to see the placeholder content an editor sees instead.',
    expectProblems: true,
    pageTitle: 'Empty blocks',
    showTitle: true,
    layout: {
      children: [
        section([{ type: 'heading' }, { type: 'prose' }, { type: 'image' }, { type: 'buttons' }, { type: 'callout' }, { type: 'faq' }]),
        section([]),
        section([heading('This heading is hidden', { hidden: true })], { tone: 'muted' }),
      ],
    },
  },
  {
    id: 'problems',
    title: 'Deliberate problems',
    description: 'Mistakes an editor or a paste could make. None of them break the page: each is reported in the Problems tab with a plain-English message.',
    pageTitle: 'Deliberate problems',
    showTitle: true,
    expectProblems: true,
    layout: {
      children: [
        section([
          heading('A heading with an unsupported size', { size: 'huge' }),
          heading('Another heading', { anchor: 'Not A Valid Anchor!' }),
          { type: 'image', props: { image: img('feature') } },
          { type: 'image', props: { image: img('detail'), decorative: true, link: { page: 'gallery' } } },
          { type: 'image', props: { image: img('missing-photo'), alt: 'A photo that was never uploaded' } },
          buttons([button('A button with nowhere to go', null)]),
          { type: 'faq_item', props: { question: 'A question outside an FAQ block', answer: '<p>Misplaced.</p>' } },
          { type: 'mystery_widget', props: { note: 'From a newer engine or a site-specific block' } },
        ]),
        section([heading('Duplicate anchor A', { anchor: 'same' }), heading('Duplicate anchor B', { anchor: 'same' })]),
      ],
    },
  },
];
