import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAYOUT_SCHEMA,
  LayoutVersionError,
  builtinElements,
  createRegistry,
  defaultRegistry,
  defineElement,
  h,
  loadLayout,
  saveLayout,
} from '../../elements/index.mjs';

const minimal = (overrides = {}) => ({
  name: 'thing',
  title: 'Thing',
  group: 'Test',
  ai: 'A test element.',
  allowedParents: ['layout'],
  render: () => h`<p>thing</p>`,
  ...overrides,
});

test('every built-in element is a valid definition with a complete editor form', () => {
  assert.ok(builtinElements.length >= 10);
  for (const def of builtinElements) {
    const inTabs = Object.values(def.tabs).flat().sort();
    assert.deepEqual(inTabs, Object.keys(def.fields).sort(), `${def.name}: every field appears in exactly one tab`);
    for (const [name, field] of Object.entries(def.fields)) {
      assert.ok(field.label, `${def.name}.${name} has a label`);
    }
    assert.ok(def.ai.length > 20, `${def.name} has a useful ai description`);
  }
});

test('defineElement rejects broken definitions at boot, with the element named', () => {
  assert.throws(() => defineElement(minimal({ name: 'Bad Name' })), /invalid element name/);
  assert.throws(() => defineElement(minimal({ render: undefined })), /"thing" needs a render/);
  assert.throws(() => defineElement(minimal({ ai: '' })), /"thing" needs an "ai" description/);
  assert.throws(() => defineElement(minimal({ fields: { a: { type: 'colour', label: 'A' } } })), /unknown type "colour"/);
  assert.throws(() => defineElement(minimal({ fields: { a: { type: 'select', label: 'A' } } })), /needs options/);
  assert.throws(() => defineElement(minimal({ fields: { a: { type: 'token', scale: 'nope', label: 'A' } } })), /unknown scale/);
  assert.throws(() => defineElement(minimal({ fields: { a: { type: 'string', label: 'A' } }, defaults: { b: 1 } })), /unknown field "b"/);
  assert.throws(() => defineElement(minimal({ fields: { a: { type: 'align', label: 'A' } }, defaults: { a: 'left' } })), /not an allowed value/);
  assert.throws(() => defineElement(minimal({ fields: { a: { type: 'string', label: 'A' } }, tabs: { Content: ['b'] } })), /unknown field "b"/);
  assert.throws(() => defineElement(minimal({ fields: { a: { type: 'string', label: 'A' }, b: { type: 'string', label: 'B' } }, tabs: { Content: ['a'] } })), /"b" is not in any tab/);
  assert.throws(() => defineElement(minimal({ migrations: { 1: () => {} } })), /schema numbers from 2/);
});

test('the shared field names are reserved, so an element can never clobber them', () => {
  assert.throws(() => defineElement(minimal({ fields: { label: { type: 'string', label: 'Button text' } } })), /reserved/);
  const def = defineElement(minimal({ fields: { text: { type: 'string', label: 'Text' } }, tabs: { Content: ['text'] } }));
  assert.deepEqual(Object.keys(def.fields).sort(), ['anchor', 'hidden', 'label', 'text']);
  assert.deepEqual(def.tabs.Advanced, ['anchor', 'hidden', 'label']);
});

test('createRegistry checks parents, containers and duplicates', () => {
  const child = defineElement(minimal({ name: 'child', allowedParents: ['box'] }));
  assert.throws(() => createRegistry([child]), /unknown parent "box"/);
  const box = defineElement(minimal({ name: 'box' }));
  assert.throws(() => createRegistry([box, child]), /not marked container/);
  assert.throws(() => createRegistry([box, box]), /registered twice/);
  const okBox = defineElement(minimal({ name: 'box', container: true }));
  const reg = createRegistry([okBox, child]);
  assert.deepEqual(reg.childrenOf('box'), ['child']);
  assert.deepEqual(reg.childrenOf('layout'), ['box']);
  assert.equal(reg.schema, LAYOUT_SCHEMA);
});

test('default registry nesting matches the plan', () => {
  assert.deepEqual(defaultRegistry.childrenOf('layout').sort(), ['article', 'section']);
  assert.deepEqual(defaultRegistry.childrenOf('buttons'), ['button']);
  assert.deepEqual(defaultRegistry.childrenOf('faq'), ['faq_item']);
  for (const type of ['heading', 'prose', 'image', 'buttons', 'callout', 'faq', 'article']) {
    assert.ok(defaultRegistry.childrenOf('section').includes(type), `${type} can go in a section`);
  }
});

test('load fills defaults, assigns unique ids and never mutates its input', () => {
  const input = { children: [{ type: 'section', id: 'dup', children: [{ type: 'heading', id: 'dup', props: { text: 'Hi' } }] }] };
  const frozen = JSON.stringify(input);
  const layout = loadLayout(input);
  assert.equal(JSON.stringify(input), frozen);
  assert.equal(layout.schema, LAYOUT_SCHEMA);
  const [section] = layout.children;
  const [heading] = section.children;
  assert.equal(section.props.tone, 'default');
  assert.equal(heading.props.level, 'h2');
  assert.equal(heading.props.text, 'Hi');
  assert.equal(section.id, 'dup');
  assert.notEqual(heading.id, 'dup');
  assert.match(heading.id, /^[a-z][a-z0-9]{5}$/);
});

test('load accepts empty or odd input', () => {
  for (const input of [null, undefined, {}, [], 'nonsense']) {
    assert.deepEqual(loadLayout(input), { schema: LAYOUT_SCHEMA, children: [] });
  }
});

test('save keeps only chosen values, sorted, and is idempotent', () => {
  const input = {
    children: [
      {
        type: 'section',
        id: 'sec1',
        props: { width: 'default', tone: 'muted', spacing: 'l', background: '', anchor: '  ' },
        children: [
          { type: 'heading', id: 'h1x', props: { text: '  Our services  ', size: 'xl', level: 'h2', kicker: '', link: { page: ' ', url: '' } } },
          { type: 'prose', id: 'p1x', props: { html: '<div style="x">Body <b>text</b></div><script>x</script>' } },
        ],
      },
      { type: 'buttons', id: 'b1x', children: [] },
    ],
  };
  const { layout } = saveLayout(input);
  assert.deepEqual(layout, {
    schema: LAYOUT_SCHEMA,
    children: [
      {
        type: 'section',
        id: 'sec1',
        props: { tone: 'muted' },
        children: [
          { type: 'heading', id: 'h1x', props: { size: 'xl', text: 'Our services' } },
          { type: 'prose', id: 'p1x', props: { html: '<p>Body <strong>text</strong></p>' } },
        ],
      },
      { type: 'buttons', id: 'b1x' },
    ],
  });
  assert.deepEqual(saveLayout(layout).layout, layout, 'saving a saved layout changes nothing');
  assert.equal(JSON.stringify(Object.keys(layout.children[0])), '["type","id","props","children"]');
});

test('save keeps false only where it overrides a default of true', () => {
  const { layout } = saveLayout({
    children: [{ type: 'section', id: 's', children: [{ type: 'faq', id: 'f', props: { schema: false }, children: [{ type: 'faq_item', id: 'q', props: { question: 'Q', answer: '<p>A</p>', open: false } }] }] }],
  });
  const faq = layout.children[0].children[0];
  assert.deepEqual(faq.props, { schema: false });
  assert.deepEqual(faq.children[0].props, { answer: '<p>A</p>', question: 'Q' });
});

test('save reports problems without blocking or losing content', () => {
  const { layout, problems } = saveLayout({
    children: [
      { type: 'section', id: 's', children: [{ type: 'heading', id: 'h', props: { size: 'huge', anchor: 'Not Valid!' } }, { type: 'faq_item', id: 'q', props: { question: 'Stray' } }] },
      { type: 'mystery_widget', id: 'm', props: { anything: 1 }, children: [{ whatever: true }] },
    ],
  });
  const messages = problems.map(p => `${p.id}:${p.field || ''}:${p.message}`);
  assert.ok(messages.some(m => m.startsWith('h:size:') && /unsupported value/.test(m)), messages.join('\n'));
  assert.ok(messages.some(m => m.startsWith('h:anchor:') && /expected format/.test(m)));
  assert.ok(messages.some(m => m.startsWith('h:text:') && /required/.test(m)));
  assert.ok(messages.some(m => m.startsWith('q::') && /can't go inside a Section/.test(m)));
  assert.ok(messages.some(m => m.startsWith('m::') && /Unknown block type/.test(m)));
  // Nothing was dropped: the bad value stays for a person to fix, the unknown block is untouched.
  assert.equal(layout.children[0].children[0].props.size, 'huge');
  assert.deepEqual(layout.children[1], { type: 'mystery_widget', id: 'm', props: { anything: 1 }, children: [{ whatever: true }] });
});

test('migrations run in order, only above the stored schema, and newer layouts are refused', () => {
  const calls = [];
  const card = defineElement(
    minimal({
      name: 'card',
      fields: { title: { type: 'string', label: 'Title' }, columns: { type: 'select', label: 'Columns', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }] } },
      tabs: { Content: ['title', 'columns'] },
      migrations: {
        3: node => {
          calls.push(`card3:${node.id}`);
          node.props.columns ??= '3';
        },
        2: node => {
          calls.push(`card2:${node.id}`);
          node.props.title = node.props.heading;
          delete node.props.heading;
        },
      },
    }),
  );
  const registry = createRegistry([card], {
    schema: 3,
    migrations: {
      2: node => {
        calls.push(`global2:${node.id}`);
        if (node.type === 'old_card') node.type = 'card';
      },
    },
  });

  const loaded = loadLayout({ schema: 1, children: [{ type: 'old_card', id: 'c1', props: { heading: 'Hello' } }] }, registry);
  assert.deepEqual(calls, ['global2:c1', 'card2:c1', 'card3:c1']);
  assert.equal(loaded.schema, 3);
  assert.deepEqual(loaded.children[0], { type: 'card', id: 'c1', props: { title: 'Hello', columns: '3' } });

  calls.length = 0;
  loadLayout({ schema: 2, children: [{ type: 'card', id: 'c2', props: { title: 'Hi' } }] }, registry);
  assert.deepEqual(calls, ['card3:c2'], 'schema-2 content skips migrations it already has');

  calls.length = 0;
  loadLayout({ schema: 3, children: [{ type: 'card', id: 'c3' }] }, registry);
  assert.deepEqual(calls, []);

  assert.throws(() => loadLayout({ schema: 4, children: [] }, registry), LayoutVersionError);
  assert.throws(() => createRegistry([card]), /must be a schema number from 2 to 1/, 'a migration above the registry schema is a boot error');
});
