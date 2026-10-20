import assert from 'node:assert/strict';
import test from 'node:test';
import { HtmlValidate } from 'html-validate';
import { builtinElements, renderLayout, saveLayout } from '../../elements/index.mjs';
import { SAMPLES } from '../../playground/samples.mjs';

// The playground's sample pages double as end-to-end fixtures: every sample
// renders as valid HTML in both modes, and only the "problems" sample has any.

const host = mode => ({
  mode,
  resolveImage: async src => {
    const name = String(src).split('/').pop().replace(/\.[^.]+$/, '');
    if (name === 'missing-photo') return null;
    return { width: 1920, height: 1280, avif: [400, 1920].map(w => ({ url: `/media/${name}-${w}.avif`, width: w })), fallback: { url: `/media/${name}.webp` } };
  },
});

const validator = new HtmlValidate({
  extends: ['html-validate:recommended'],
  rules: { 'no-inline-style': ['error', { allowedProperties: ['--ab-focal'] }] },
});

test('the samples cover every built-in element', () => {
  const used = new Set();
  const visit = nodes => (nodes || []).forEach(n => { used.add(n.type); visit(n.children); });
  SAMPLES.forEach(s => visit(s.layout.children));
  for (const def of builtinElements) assert.ok(used.has(def.name), `no playground sample uses "${def.name}"`);
});

for (const sample of SAMPLES) {
  for (const mode of ['build', 'preview']) {
    test(`playground sample "${sample.id}" (${mode}) renders valid HTML`, async () => {
      const { layout, problems: saveProblems } = saveLayout(sample.layout);
      const out = await renderLayout(layout, host(mode));
      const problems = [...saveProblems, ...out.problems];
      if (sample.expectProblems) assert.ok(problems.length > 0);
      else assert.deepEqual(problems, []);
      const page = `<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><main><h1>Title</h1>${out.html}</main></body></html>`;
      const report = await validator.validateString(page);
      const messages = report.results.flatMap(r => r.messages.map(m => `${m.ruleId}: ${m.message} [${m.selector}]`));
      assert.equal(report.valid, true, messages.join('\n'));
    });
  }
}
