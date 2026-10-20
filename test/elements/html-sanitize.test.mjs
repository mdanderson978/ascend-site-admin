import assert from 'node:assert/strict';
import test from 'node:test';
import { attrs, cls, h, raw, richTextToPlain, safeHref, sanitizeRichText } from '../../elements/index.mjs';

test('h escapes interpolated values and nests SafeHtml without double-escaping', () => {
  const name = '<script>alert("x")</script> & co';
  const inner = h`<em>${name}</em>`;
  assert.equal(h`<p>${inner}</p>`.value, '<p><em>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co</em></p>');
  assert.equal(h`<p>${raw('<b>ok</b>')}</p>`.value, '<p><b>ok</b></p>');
  assert.equal(h`<p>${null}${undefined}${false}${true}${0}</p>`.value, '<p>0</p>');
  assert.equal(h`<ul>${['a', 'b'].map(x => h`<li>${x}</li>`)}</ul>`.value, '<ul><li>a</li><li>b</li></ul>');
});

test('cls joins strings, arrays and conditions, without duplicates', () => {
  assert.equal(cls('a', ['b', null, 'a'], { c: true, d: false }, '', 'e f'), 'a b c e f');
});

test('attrs omits empty values, renders booleans bare and escapes values', () => {
  assert.equal(attrs({ class: 'x', hidden: true, open: false, id: null, title: 'a "b"' }).value, ' class="x" hidden title="a &quot;b&quot;"');
  assert.throws(() => attrs({ 'on load': 'x' }), /Invalid attribute name/);
});

test('safeHref allows web, mail, phone and relative links, and nothing executable', () => {
  for (const ok of ['https://example.com', 'http://x.y/z?q=1', 'mailto:a@b.co', 'tel:+61400000000', '/contact/', '#pricing', '?page=2', 'page.html']) {
    assert.equal(safeHref(ok), ok, ok);
  }
  for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example', '', null]) {
    assert.equal(safeHref(bad), null, String(bad));
  }
});

test('rich text keeps only the fixed schema', () => {
  const dirty =
    '<div class="MsoNormal" style="color:red"><span style="font-size:20pt">Hello <b>bold</b> and <i>it</i></span></div>' +
    '<script>alert(1)</script><style>p{}</style><iframe src="x"></iframe>' +
    '<p onclick="x()">Para with <a href="https://ok.example" target="_blank" onclick="x()">a link</a> and <a href="javascript:alert(1)">a bad one</a></p>' +
    '<img src="x.jpg" alt="dropped"><table><tr><td>cell text</td></tr></table>';
  assert.equal(
    sanitizeRichText(dirty),
    '<p>Hello <strong>bold</strong> and <em>it</em></p>' +
      '<p>Para with <a href="https://ok.example">a link</a> and a bad one</p>' +
      '<p>cell text</p>',
  );
});

test('rich text headings: H2/H3 only when allowed, otherwise bold paragraphs', () => {
  const html = '<h1>Top</h1><h2>Two</h2><h4>Four</h4><p>Body</p>';
  assert.equal(sanitizeRichText(html, { headings: true }), '<h2>Top</h2><h2>Two</h2><h3>Four</h3><p>Body</p>');
  assert.equal(sanitizeRichText(html), '<p><strong>Top</strong></p><p><strong>Two</strong></p><p><strong>Four</strong></p><p>Body</p>');
});

test('rich text wraps stray inline content and unwraps paragraphs inside list items', () => {
  assert.equal(sanitizeRichText('Loose <strong>text</strong><p>Para</p>more'), '<p>Loose <strong>text</strong></p><p>Para</p><p>more</p>');
  assert.equal(
    sanitizeRichText('<ul><li><p>One</p></li><li>Two<ol><li>Nested</li></ol></li><li></li></ul>'),
    '<ul><li>One</li><li>Two<ol><li>Nested</li></ol></li></ul>',
  );
});

test('rich text drops empty paragraphs, trims stray breaks and collapses source whitespace', () => {
  assert.equal(sanitizeRichText('<p></p><p> &nbsp; </p><p><br></p><p><br>Kept<br></p>'), '<p>Kept</p>');
  assert.equal(sanitizeRichText('<p>\n    Indented\n    by ChatGPT\n  </p>'), '<p>Indented by ChatGPT</p>');
});

test('rich text sanitising is idempotent', () => {
  const inputs = [
    '<div><b>A</b> b<ul><li><p>x</p></li></ul></div>text',
    '<h1>T</h1><p>a<br>b</p><ol><li>1<ul><li>2</li></ul></li></ol>',
    '<p><a href="/x"><strong>link</strong></a> &amp; &lt;tag&gt;</p>',
  ];
  for (const input of inputs) {
    for (const headings of [true, false]) {
      const once = sanitizeRichText(input, { headings });
      assert.equal(sanitizeRichText(once, { headings }), once, input);
    }
  }
});

test('richTextToPlain gives readable text', () => {
  assert.equal(richTextToPlain('<h2>Title</h2><p>One <strong>two</strong></p><ul><li>a</li><li>b</li></ul>'), 'Title One two a b');
});
