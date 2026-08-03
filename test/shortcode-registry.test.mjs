import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The shortcode registry (BUILTIN_SHORTCODES, resolveShortcodes,
// buildDirectiveSnippet) lives inline in admin.html's browser script, per
// the engine's deliberate single-static-file-no-build-step architecture —
// there is nowhere else for it to live without introducing a bundler. That
// block has zero DOM/browser dependencies by design (no `document`,
// `window`, `fetch`, `ta`), so it's safe to extract by marker and execute
// directly in Node for a real behavioral test, rather than only checking
// (like the existing "admin.html embedded script parses" test) that the
// whole file's JS is syntactically valid.
//
// Plain index scan between two stable marker strings, not a regex
// tag-filter — same reasoning as the existing embedded-script test in
// save-uploads-prune.test.mjs (a regex-based extractor was flagged by
// CodeQL there).
function loadRegistryModule() {
  const html = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf-8');
  const startMarker = '// ── Shortcode catalog ';
  const endMarker = 'function openPhotoPicker(onPick, opts = {}) {';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.ok(start !== -1 && end > start, 'shortcode catalog block must exist in admin.html between its known markers');
  const js = html.slice(start, end);
  const fn = new Function(js + '\nreturn { BUILTIN_SHORTCODES, DEFAULT_SHORTCODE_IDS, resolveShortcodes, buildDirectiveSnippet };');
  return fn();
}

test('BUILTIN_SHORTCODES contains the migrated entries and optional SMS action, each with the required shape', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const ids = BUILTIN_SHORTCODES.map((e) => e.id);
  assert.deepEqual(ids, ['insert-photo', 'thumbnail-link', 'youtube-video', 'subscribe-button', 'sms-button', 'call-to-action', 'customer-testimonial']);
  for (const entry of BUILTIN_SHORTCODES) {
    assert.ok(entry.icon && entry.label && entry.tooltip, `${entry.id} must have icon/label/tooltip`);
    assert.ok(entry.panel && (entry.panel.kind === 'photo' || entry.panel.kind === 'fields'), `${entry.id} must have a valid panel.kind`);
    if (entry.panel.kind === 'fields') assert.equal(typeof entry.build, 'function', `${entry.id} fields-panel entries must have a build() function`);
  }
});

test('resolveShortcodes falls back to exactly the 6 legacy ids when config.shortcodes is absent', () => {
  const { resolveShortcodes, DEFAULT_SHORTCODE_IDS } = loadRegistryModule();
  const resolved = resolveShortcodes(undefined);
  assert.deepEqual(resolved.map((e) => e.id), DEFAULT_SHORTCODE_IDS);
});

test('resolveShortcodes falls back to the same default when shortcodes is an empty object', () => {
  const { resolveShortcodes, DEFAULT_SHORTCODE_IDS } = loadRegistryModule();
  assert.deepEqual(resolveShortcodes({}).map((e) => e.id), DEFAULT_SHORTCODE_IDS);
});

test('resolveShortcodes.include REPLACES the default set, not adds to it', () => {
  const { resolveShortcodes } = loadRegistryModule();
  const resolved = resolveShortcodes({ include: ['youtube-video', 'call-to-action'] });
  assert.deepEqual(resolved.map((e) => e.id), ['youtube-video', 'call-to-action']);
});

test('resolveShortcodes.include preserves BUILTIN_SHORTCODES catalog order, not the include array order', () => {
  const { resolveShortcodes } = loadRegistryModule();
  const resolved = resolveShortcodes({ include: ['customer-testimonial', 'insert-photo'] });
  assert.deepEqual(resolved.map((e) => e.id), ['insert-photo', 'customer-testimonial']);
});

test('resolveShortcodes appends declarative custom entries after built-ins', () => {
  const { resolveShortcodes } = loadRegistryModule();
  const custom = { id: 'accommodation-carousel', icon: '🏨', label: 'Accommodation carousel', directive: { kind: 'container', name: 'accommodation-carousel', contentField: 1 } };
  const resolved = resolveShortcodes({ include: ['insert-photo'], custom: [custom] });
  assert.deepEqual(resolved.map((e) => e.id), ['insert-photo', 'accommodation-carousel']);
  assert.equal(typeof resolved[1].build, 'function', 'custom entries get a build() wired to buildDirectiveSnippet');
});

test('youtube-video build() produces the expected snippet, or null when the link is blank', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'youtube-video');
  assert.deepEqual(entry.build(['https://youtu.be/abc', 'My Video']), { snippet: '[My Video](https://youtu.be/abc)', status: 'Video added to the page ✓' });
  assert.deepEqual(entry.build(['https://youtu.be/abc', '']), { snippet: '[YouTube video](https://youtu.be/abc)', status: 'Video added to the page ✓' });
  assert.equal(entry.build(['', '']), null);
});

test('subscribe-button build() appends ?sub_confirmation=1 only when not already present', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'subscribe-button');
  assert.equal(entry.build(['https://www.youtube.com/@x']).snippet, '[Subscribe on YouTube](https://www.youtube.com/@x?sub_confirmation=1)');
  assert.equal(entry.build(['https://www.youtube.com/@x?sub_confirmation=1']).snippet, '[Subscribe on YouTube](https://www.youtube.com/@x?sub_confirmation=1)');
  assert.equal(entry.build(['https://www.youtube.com/@x?foo=bar']).snippet, '[Subscribe on YouTube](https://www.youtube.com/@x?foo=bar&sub_confirmation=1)');
});

test('sms-button build() normalizes the number and safely encodes a pre-filled message', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'sms-button');
  assert.deepEqual(
    entry.build(['0407 666 999', "Hi! I'm interested in a pool (repair).", 'Text Message']),
    {
      snippet: '**[Text Message](sms:0407666999?body=Hi%21%20I%27m%20interested%20in%20a%20pool%20%28repair%29.)**',
      status: 'SMS button added to the page ✓',
    },
  );
});

test('sms-button build() supports international numbers, optional messages and safe button labels', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'sms-button');
  assert.equal(entry.build(['+61 407-666-999', '', 'Text [Andrew]']).snippet, '**[Text \\[Andrew\\]](sms:+61407666999)**');
  assert.equal(entry.build(['not a number', 'Hi', 'Text Message']), null);
  assert.equal(entry.build(['', '', '']), null);
});

// call-to-action's group field submits as values[0] = Array<string[]>, one
// row per line, each row [lead, label, href, trail, style].
test('call-to-action build() wraps a single line in a :::cta container with one ::line child', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'call-to-action');
  const result = entry.build([[['Call:', '0407 666 999', 'tel:+610407666999', '', 'brand']]]);
  assert.equal(result.snippet, ':::cta\n::line{lead="Call:" label="0407 666 999" href="tel:+610407666999" style="brand"}\n:::');
});

test('call-to-action build() joins multiple lines, each its own ::line, inside one :::cta container', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'call-to-action');
  const result = entry.build([[
    ['Text message to', '0407 666 999', 'tel:+610407666999', 'is the fastest way to reach us.', 'brand'],
    ['', '', '', 'Telephone calls are the second best way.', 'accent'],
    ['', '', '', 'Currently there is a wait of up to 3 weeks.', 'muted'],
  ]]);
  assert.equal(
    result.snippet,
    ':::cta\n' +
    '::line{lead="Text message to" label="0407 666 999" href="tel:+610407666999" trail="is the fastest way to reach us." style="brand"}\n' +
    '::line{trail="Telephone calls are the second best way." style="accent"}\n' +
    '::line{trail="Currently there is a wait of up to 3 weeks." style="muted"}\n' +
    ':::'
  );
});

test('call-to-action build() omits label/href from a line when only one of the pair is filled (never a link with no href)', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'call-to-action');
  const result = entry.build([[['Some text', '0407 666 999', '', '', 'brand']]]);
  assert.equal(result.snippet, ':::cta\n::line{lead="Some text" style="brand"}\n:::');
});

test('call-to-action build() drops fully-empty rows and returns null if nothing is left', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'call-to-action');
  assert.equal(entry.build([[['', '', '', '', 'brand']]]), null);
  const result = entry.build([[
    ['', '', '', '', 'brand'],
    ['Only this line', '', '', '', 'brand'],
  ]]);
  assert.equal(result.snippet, ':::cta\n::line{lead="Only this line" style="brand"}\n:::');
});

test('customer-testimonial build() keeps every line of a multi-paragraph quote prefixed with "> ", including the attribution line', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'customer-testimonial');
  const result = entry.build(['Line one.\n\nLine two.', 'Kath', 'Rowville', '4', 'https://example.com/review']);
  const lines = result.snippet.split('\n');
  // The exact bug this button exists to prevent: every line, including the
  // attribution, must start with ">" — a plain textarea edit previously
  // dropped the ">" from just the last line, which silently broke the
  // styled quote box on the live site.
  for (const line of lines) assert.ok(line.startsWith('>'), `line "${line}" must start with ">"`);
  assert.match(result.snippet, /★★★★☆/);
  assert.match(result.snippet, /— \*\*Kath, Rowville\*\*/);
  assert.match(result.snippet, /\[Read our Google reviews\]\(https:\/\/example\.com\/review\)$/);
});

test('customer-testimonial build() clamps an out-of-range or non-numeric star rating into 1-5', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'customer-testimonial');
  assert.match(entry.build(['Q', 'N', '', '99', '']).snippet, /★★★★★(?!★)/);
  assert.match(entry.build(['Q', 'N', '', '2', '']).snippet, /★★☆☆☆/);
  assert.match(entry.build(['Q', 'N', '', 'not-a-number', '']).snippet, /★★★★★(?!★)/);
  // "0" is falsy, so `parseInt(...) || 5` falls through to the default 5
  // rather than clamping to 1 — a real quirk of the original hand-written
  // logic (this migration preserves behavior byte-for-byte, not "fixes" it).
  assert.match(entry.build(['Q', 'N', '', '0', '']).snippet, /★★★★★(?!★)/);
});

test('customer-testimonial build() returns null without a quote or a name', () => {
  const { BUILTIN_SHORTCODES } = loadRegistryModule();
  const entry = BUILTIN_SHORTCODES.find((e) => e.id === 'customer-testimonial');
  assert.equal(entry.build(['', 'Kath', '', '5', '']), null);
  assert.equal(entry.build(['Great job', '', '', '5', '']), null);
});

test('buildDirectiveSnippet assembles a container directive with attributes and content', () => {
  const { buildDirectiveSnippet } = loadRegistryModule();
  const entry = { label: 'Feature grid', directive: { kind: 'container', name: 'feature-grid', attrs: { cols: 0 }, contentField: 1 } };
  const result = buildDirectiveSnippet(entry, ['3', 'some content']);
  assert.equal(result.snippet, ':::feature-grid{cols="3"}\nsome content\n:::');
  assert.equal(result.status, 'Feature grid added to the page ✓');
});

test('buildDirectiveSnippet omits an attribute whose field value is blank', () => {
  const { buildDirectiveSnippet } = loadRegistryModule();
  const entry = { label: 'Callout', directive: { kind: 'container', name: 'callout', attrs: { type: 0 }, contentField: 1 } };
  const result = buildDirectiveSnippet(entry, ['', 'body text']);
  assert.equal(result.snippet, ':::callout\nbody text\n:::');
});

test('buildDirectiveSnippet assembles a leaf directive with no content', () => {
  const { buildDirectiveSnippet } = loadRegistryModule();
  const entry = { label: 'Divider', directive: { kind: 'leaf', name: 'divider' } };
  assert.equal(buildDirectiveSnippet(entry, []).snippet, '::divider');
});
