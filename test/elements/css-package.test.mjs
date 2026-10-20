import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { builtinElements, sanitizeRichText } from '../../elements/index.mjs';
import { TOKENS_CSS_PATH, elementCss, elementCssPath } from '../../elements/css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const libraryDir = path.join(root, 'elements', 'library');
const cssFiles = fs.readdirSync(libraryDir).filter(d => fs.existsSync(path.join(libraryDir, d, 'style.css')));

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(css) {
  return [...stripComments(css).matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map(m => ({ prop: m[1], value: m[2].trim() }));
}

// Sizing that must be fluid: only --ab-* tokens (clamp() values), 0, or keywords.
const TOKEN_ONLY = /^(font-size|margin(-[a-z-]+)?|padding(-[a-z-]+)?|gap|row-gap|column-gap)$/;
// Other lengths that must not be fixed pixels/rems.
const NO_FIXED = /^(line-height|letter-spacing|word-spacing|text-indent|inset(-[a-z-]+)?|top|right|bottom|left)$/;
const COLOUR_PROPS = /^(color|background(-color)?|border(-[a-z-]+)?-color|border(-[a-z]+)?|outline(-color)?|fill|stroke|box-shadow|text-decoration(-color)?)$/;

function lintElementCss(file, css) {
  const errors = [];
  if (!/^\s*@layer ascend-elements\s*\{/.test(stripComments(css))) errors.push('must be wrapped in @layer ascend-elements { ... }');
  for (const { prop, value } of declarations(css)) {
    if (TOKEN_ONLY.test(prop)) {
      const rest = value.replace(/var\(--ab-[a-z0-9-]+\)/g, '').replace(/\b(auto|inherit|initial|unset)\b/g, '');
      if (/[1-9]|\d*\.\d|\d[a-z%]/i.test(rest)) errors.push(`${prop}: ${value}  (use --ab-* clamp tokens, not fixed sizes)`);
    }
    if (NO_FIXED.test(prop) && /\d(px|rem)\b/.test(value)) errors.push(`${prop}: ${value}  (no fixed px/rem)`);
    if (COLOUR_PROPS.test(prop) && /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(white|black|red|blue|green|grey|gray|orange|yellow|purple|pink)\b/i.test(value)) {
      errors.push(`${prop}: ${value}  (colours come from brand tokens)`);
    }
  }
  for (const m of stripComments(css).matchAll(/@media\s*([^{]+)\{/g)) {
    if (!/^\s*\((prefers-reduced-motion|prefers-color-scheme|hover|pointer|forced-colors)\b[^)]*\)\s*$|^\s*print\s*$/.test(m[1])) {
      errors.push(`@media ${m[1].trim()}  (only user-preference queries; use container queries for layout)`);
    }
  }
  return errors.map(e => `${file}: ${e}`);
}

test('element CSS uses only clamp tokens for type and spacing, brand tokens for colour, no width breakpoints', () => {
  const errors = cssFiles.flatMap(dir => lintElementCss(`${dir}/style.css`, fs.readFileSync(path.join(libraryDir, dir, 'style.css'), 'utf8')));
  assert.deepEqual(errors, []);
});

test('the CSS lint catches the mistakes it exists for', () => {
  const bad = `@layer ascend-elements { .x { font-size: 18px; margin: 1rem 0; padding: var(--ab-space-s) 12px; gap: 2vw; line-height: 24px; color: #333; background: white; } @media (min-width: 600px) { .x { display: none; } } }`;
  const errors = lintElementCss('bad.css', bad);
  for (const expected of ['font-size: 18px', 'margin: 1rem 0', 'padding: var(--ab-space-s) 12px', 'gap: 2vw', 'line-height: 24px', 'color: #333', 'background: white', '@media (min-width: 600px)']) {
    assert.ok(errors.some(e => e.includes(expected)), `lint should flag "${expected}"\n${errors.join('\n')}`);
  }
  assert.ok(lintElementCss('unlayered.css', '.x { color: inherit; }').some(e => /@layer/.test(e)));
});

// Same formula as clamp-css's clamp.mjs (375px -> 1440px). If a token in
// tokens.css was hand-edited, this fails.
function clampFor(minPx, maxPx, minVp = 375, maxVp = 1440) {
  const slope = (maxPx - minPx) / (maxVp - minVp);
  const slopeVw = +(slope * 100).toFixed(3);
  const interceptRem = +((minPx - slope * minVp) / 16).toFixed(4);
  return `clamp(${+(minPx / 16).toFixed(4)}rem, ${interceptRem}rem + ${slopeVw}vw, ${+(maxPx / 16).toFixed(4)}rem)`;
}

test('tokens.css: every type and space token defaults to the clamp-css token and the generated clamp()', () => {
  const css = fs.readFileSync(TOKENS_CSS_PATH, 'utf8');
  const scale = {
    'step--1': [13, 14], 'step-0': [16, 18], 'step-1': [18, 22], 'step-2': [21, 28], 'step-3': [26, 40], 'step-4': [34, 58], 'step-5': [42, 76],
    'space-3xs': [4, 5], 'space-2xs': [8, 10], 'space-xs': [12, 15], 'space-s': [16, 20], 'space-m': [24, 30], 'space-l': [32, 40], 'space-xl': [48, 60], 'space-2xl': [64, 80], 'space-3xl': [96, 120],
  };
  for (const [name, [min, max]] of Object.entries(scale)) {
    const line = css.match(new RegExp(`--ab-${name}:\\s*([^;]+);`));
    assert.ok(line, `tokens.css defines --ab-${name}`);
    assert.equal(line[1], `var(--${name}, ${clampFor(min, max)})`, `--ab-${name}`);
  }
});

test('every element has a stylesheet, and every stylesheet belongs to an element', () => {
  const cssNames = new Set(builtinElements.map(d => d.css).filter(Boolean));
  assert.deepEqual([...cssNames].sort(), [...cssFiles].sort());
  for (const name of cssNames) assert.ok(fs.existsSync(elementCssPath(name)), name);
  const combined = elementCss(['faq', 'buttons', 'faq']);
  assert.ok(combined.startsWith(fs.readFileSync(TOKENS_CSS_PATH, 'utf8')), 'tokens come first');
  assert.equal((combined.match(/\.ab-faq \{/g) || []).length, 1, 'each stylesheet once');
  assert.throws(() => elementCssPath('../secrets'), /Invalid element css name/);
});

test('the element library is browser-safe: no Node built-ins outside css.mjs', () => {
  const files = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.mjs')) files.push(full);
    }
  };
  visit(path.join(root, 'elements'));
  for (const file of files) {
    if (path.basename(file) === 'css.mjs') continue;
    // Ignore comments (which show usage examples such as `from 'astro/zod'`).
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /from\s+'node:|require\(/, path.relative(root, file));
    for (const [, spec] of src.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(spec.startsWith('.') || spec === 'parse5', `${path.relative(root, file)} imports "${spec}"; only relative imports and parse5 are allowed`);
    }
  }
});

test('the element library ships in the package and is exported', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('elements'), 'package.json "files" includes elements/');
  assert.equal(pkg.exports['./elements'], './elements/index.mjs');
  assert.equal(pkg.exports['./elements/css'], './elements/css.mjs');
  assert.ok(pkg.dependencies.parse5, 'parse5 is a runtime dependency');
});

test('phone links in rich text never wrap mid-number', () => {
  assert.equal(sanitizeRichText('<p>Call <a href="tel:0390000000">03 9000 0000</a></p>'), '<p>Call <a href="tel:0390000000">03 9000 0000</a></p>');
});
