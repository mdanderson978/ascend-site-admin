import assert from 'node:assert/strict';
import test from 'node:test';
import { brandCss, brandJson, contrastRatio, defineBrand, isBrandJson, shadesOf } from '../../elements/index.mjs';

const GREEN = { colors: { primary: '#1e5631', accent: '#c2410c', dark: '#1a2e1e', light: '#fdf8f0' }, radius: '12px' };
const lightness = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return r + g + b;
};

test('contrast ratios match WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  assert.equal(contrastRatio('#767676', '#ffffff'), 4.54);
});

test('each colour gets 7 valid shades, lightest first, keeping its hue family', () => {
  const shades = shadesOf('#1e5631');
  assert.deepEqual(shades.map(s => s.step), [100, 200, 300, 400, 500, 600, 700]);
  for (const s of shades) assert.match(s.value, /^#[0-9a-f]{6}$/);
  for (let i = 1; i < shades.length; i++) assert.ok(lightness(shades[i].value) < lightness(shades[i - 1].value), 'each shade darker than the last');
  for (const s of shades) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(s.value.slice(i, i + 2), 16));
    assert.ok(g >= r && g >= b, `${s.value} is still green`);
  }
  // Saturated colours that don't fit sRGB at every lightness are brought into gamut, not clipped wildly.
  for (const s of shadesOf('#ff00ff')) assert.match(s.value, /^#[0-9a-f]{6}$/);
});

test('roles default from colour names, and the brand passes its own contrast checks', () => {
  const json = brandJson(defineBrand(GREEN));
  assert.equal(json.roles.brand, '#1e5631');
  assert.equal(json.roles.ink, '#1a2e1e');
  assert.equal(json.roles.bg, '#fdf8f0');
  assert.equal(json.roles.brandInk, '#ffffff');
  assert.ok(contrastRatio(json.roles.muted, json.roles.bg) >= 4.5, 'muted text stays readable');
  assert.deepEqual(json.problems, []);
  assert.ok(isBrandJson(json));
});

test('editors are only offered colours that read on each section tone', () => {
  const json = brandJson(defineBrand(GREEN));
  const tone = name => json.tones.find(t => t.name === name);
  for (const t of json.tones) {
    for (const id of t.text) {
      const [name, step] = id.split(/-(?=\d{3}$)/);
      const color = json.colors.find(c => c.name === name);
      const value = step ? color.shades.find(s => String(s.step) === step).value : color.value;
      assert.ok(contrastRatio(value, t.bg) >= 4.5, `${id} on ${t.name}`);
    }
    for (const id of t.text) assert.ok(t.large.includes(id), 'anything fine for body text is fine for large text');
  }
  assert.ok(!tone('default').text.includes('light'), 'the page colour is never offered as text on itself');
  assert.ok(tone('dark').text.includes('light'));
  assert.ok(!tone('dark').text.includes('dark'));
});

test('a brand with poor contrast is reported, not silently accepted', () => {
  const json = brandJson(defineBrand({ colors: { primary: '#ffd400' } }));
  assert.equal(json.roles.brandInk, '#1c1c1c', 'dark text on a light brand colour');
  assert.ok(json.problems.some(p => /links contrast/.test(p)), json.problems.join('\n'));
});

test('roles can name a colour, a shade or a hex value', () => {
  const brand = defineBrand({ ...GREEN, roles: { brand: 'primary-600', surface: '#eeeeee', accent: 'accent' } });
  assert.equal(brand.roles.brand.value, shadesOf('#1e5631')[5].value);
  assert.equal(brand.roles.surface.value, '#eeeeee');
  assert.equal(brand.roles.accent.value, '#c2410c');
});

test('bad brand definitions fail with a message saying what to fix', () => {
  assert.throws(() => defineBrand({}), /at least one colour/);
  assert.throws(() => defineBrand({ colors: { a: '#000', b: '#111', c: '#222', d: '#333', e: '#444', f: '#555' } }), /at most 5/);
  assert.throws(() => defineBrand({ colors: { primary: 'green' } }), /hex value/);
  assert.throws(() => defineBrand({ colors: { Primary: '#000' } }), /lower-case/);
  assert.throws(() => defineBrand({ ...GREEN, roles: { brand: 'purple' } }), /role "brand" refers to "purple"/);
  assert.throws(() => defineBrand({ ...GREEN, roles: { heading: 'primary' } }), /unknown role "heading"/);
  assert.throws(() => defineBrand({ ...GREEN, fonts: { body: 'x; } body { color: red' } }), /font-family/);
  assert.throws(() => defineBrand({ ...GREEN, radius: '12' }), /radius/);
});

test('brand CSS is layered below site CSS and sets the variables the element tokens read', () => {
  const css = brandCss(defineBrand({ ...GREEN, fonts: { display: 'Georgia, serif' } }));
  assert.match(css, /^@layer ascend-brand \{/);
  for (const v of ['--brand:', '--brand-ink:', '--accent:', '--ink:', '--bg:', '--surface:', '--muted:', '--radius: 12px', '--font-display: Georgia, serif']) assert.ok(css.includes(v), v);
  assert.equal((css.match(/--ab-color-[a-z]+-\d{3}:/g) || []).length, 28, '4 colours x 7 shades');
  assert.match(css, /--ab-color-primary: #1e5631;/);
});
