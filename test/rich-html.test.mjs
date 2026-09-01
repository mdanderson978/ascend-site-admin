import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { sortChatGptHtml } from '../rich-html.mjs';

test('ChatGPT HTML is separated into safe content, page assets and real image files', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-html-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  fs.mkdirSync(path.join(root, 'images'));
  fs.writeFileSync(path.join(root, 'images', '1700000000000-user-photo.webp'), 'uploaded-page-image');
  fs.writeFileSync(path.join(root, 'images', 'image-deadbeef1234.webp'), 'stale-embedded-image');
  fs.writeFileSync(path.join(root, 'page-deadbeef1234.css'), 'stale page CSS');
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#34765d' } }).png().toBuffer();
  const dataUrl = `data:image/png;base64,${image.toString('base64')}`;
  const source = `<!doctype html><html><head>
    <title>Creative pool page</title>
    <meta name="description" content="A complete creative page.">
    <link rel="stylesheet" href="https://example.com/widgets.css">
    <style>.hero { display: grid; }</style>
  </head><body>
    <section class="hero" style="color: navy !important"><img src="${dataUrl}" alt="Pool"><button onclick="this.textContent = 'Done'">Try it</button></section>
    <script>document.body.dataset.ready = 'yes';</script>
  </body></html>`;

  const result = await sortChatGptHtml({ source, outputDir: root, publicBase: '/content-assets/information/example' });

  assert.equal(result.title, 'Creative pool page');
  assert.equal(result.description, 'A complete creative page.');
  assert.doesNotMatch(result.body, /<(?:style|script|html|head|body|link|meta)\b/i);
  assert.doesNotMatch(result.body, /\sonclick=/i);
  assert.match(result.body, /style="color: navy !important"/);
  assert.doesNotMatch(result.body, /data:image/i);
  assert.match(result.body, /\/content-assets\/information\/example\/images\/image-[a-f0-9]+\.webp/);
  assert.equal(result.report.images, 1);
  assert.equal(result.report.styleBlocks, 1);
  assert.equal(result.report.inlineStyles, 1);
  assert.equal(result.report.scriptBlocks, 1);
  assert.equal(result.report.eventHandlers, 1);
  assert.equal(result.report.externalResources, 1);

  const cssFile = fs.readdirSync(root).find(file => /^page-[a-f0-9]+\.css$/.test(file));
  assert.ok(cssFile);
  const css = fs.readFileSync(path.join(root, cssFile), 'utf8');
  assert.match(css, /@import url\("https:\/\/example.com\/widgets.css"\)/);
  assert.match(css, /\.hero/);
  assert.doesNotMatch(css, /\.cms-inline-/);
  const jsFile = fs.readdirSync(root).find(file => /^page-[a-f0-9]+\.js$/.test(file));
  assert.ok(jsFile);
  const js = fs.readFileSync(path.join(root, jsFile), 'utf8');
  assert.match(js, /document\.body\.dataset\.ready/);
  assert.match(js, /addEventListener\("click"/);
  const imageFiles = fs.readdirSync(path.join(root, 'images'));
  assert.equal(imageFiles.length, 2);
  assert.ok(imageFiles.includes('1700000000000-user-photo.webp'), 'a page image uploaded before importing must survive');
  assert.ok(!imageFiles.includes('image-deadbeef1234.webp'), 'obsolete embedded images are replaced');
  const convertedImage = imageFiles.find(name => name.startsWith('image-'));
  assert.equal((await sharp(await fsp.readFile(path.join(root, 'images', convertedImage))).metadata()).format, 'webp');
  assert.ok(!fs.existsSync(path.join(root, 'page-deadbeef1234.css')), 'obsolete generated page CSS is replaced');
});

test('a fenced clean fragment remains ordinary page content without CSS or JavaScript', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-html-clean-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const result = await sortChatGptHtml({ source: '```html\n<h2>Hello</h2>\n<p>World</p>\n```', outputDir: root, publicBase: '/content-assets/pages/hello' });
  assert.equal(result.body, '<h2>Hello</h2>\n<p>World</p>\n');
  assert.equal(result.assets.style, '');
  assert.equal(result.assets.script, '');
  assert.equal(fs.readdirSync(root).some(file => file.endsWith('.css')), false);
  assert.equal(fs.readdirSync(root).some(file => file.endsWith('.js')), false);
});

test('the HTML parser separates malformed tags and unquoted executable attributes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-html-malformed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const source = '<!doctype html><html><head><style>.safe{color:green}</style></head><body><button style=color:red onclick=alert(1)>Go</button><script>document.body.dataset.test="yes"</script></body></html>';

  const result = await sortChatGptHtml({ source, outputDir: root, publicBase: '/content-assets/pages/parser-check' });

  assert.doesNotMatch(result.body, /<(?:style|script)\b|\sonclick=/i);
  assert.match(result.body, /style="color:red"/);
  assert.match(result.body, /data-cms-event-1/);
  assert.equal(result.report.styleBlocks, 1);
  assert.equal(result.report.scriptBlocks, 1);
  assert.equal(result.report.inlineStyles, 1);
  assert.equal(result.report.eventHandlers, 1);
});

test('a non-image data: URI (a PDF smuggled in as a link target) is rejected', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-html-data-pdf-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const source = '<a href="data:application/pdf;base64,JVBERi0xLjQK" download="guide.pdf">Download</a>';

  await assert.rejects(
    sortChatGptHtml({ source, outputDir: root, publicBase: '/content-assets/information/example' }),
    /embeds a file .* instead of a real link/i,
  );
});

test('a script that rebuilds a file from an embedded base64 blob (the ChatGPT PDF workaround) is rejected', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-html-blob-pdf-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const source = `<a id="dl" download="guide.pdf" href="#">Download the guide</a>
    <script>
      var bytes = window.atob('JVBERi0xLjQK');
      var blob = new Blob([bytes], { type: 'application/pdf' });
      document.getElementById('dl').href = URL.createObjectURL(blob);
    </script>`;

  await assert.rejects(
    sortChatGptHtml({ source, outputDir: root, publicBase: '/content-assets/information/example' }),
    /rebuilds a downloadable file from embedded data/i,
  );
});

test('a script using only atob() or only Blob/createObjectURL alone (not both) is not treated as an embedded file', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-html-blob-safe-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const source = `<button id="copy">Copy code</button>
    <script>
      document.getElementById('copy').addEventListener('click', function () {
        var decoded = window.atob('aGVsbG8=');
        navigator.clipboard.writeText(decoded);
      });
    </script>`;

  const result = await sortChatGptHtml({ source, outputDir: root, publicBase: '/content-assets/information/example' });
  assert.match(result.body, /id="copy"/);
});
