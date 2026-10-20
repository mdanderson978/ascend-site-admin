// Element library playground: a local test bench for site-admin/elements.
//
//   npm run playground                         -> http://127.0.0.1:4330
//   npm run playground -- --photos "C:\photos"  -> use real photos (read in place, never copied)
//   npm run playground -- --port 4400 --host 0.0.0.0   (LAN, e.g. to test on a real phone)
//
// Dev tool only: not part of the published package.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { renderLayout, saveLayout, structuredDataHtml } from '../elements/index.mjs';
import { elementCss } from '../elements/css.mjs';
import { prepareMedia, AVIF_QUALITY, LADDER, WEBP_QUALITY } from './media.mjs';
import { SAMPLES } from './samples.mjs';
import { PREVIEW_CSS, PREVIEW_SCRIPT, TEMPLATE_CSS, THEMES } from './themes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const port = Number(arg('port', process.env.PLAYGROUND_PORT || 4330));
const hostName = arg('host', '127.0.0.1');
const photosDir = arg('photos', process.env.PLAYGROUND_PHOTOS || null);

// ---- YAML in and out, exactly as a content file's frontmatter ----

function layoutToYaml(layout) {
  return matter.stringify('', { layout }).replace(/^---\r?\n/, '').replace(/\r?\n---\s*$/, '').trim() + '\n';
}

function yamlToLayout(text) {
  const data = matter(`---\n${text}\n---\n`).data;
  if (data && data.layout) return data.layout;
  if (data && Array.isArray(data.children)) return data;
  throw new Error('Expected a "layout:" key at the top.');
}

// ---- page document ----

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function documentFor({ html, css, structuredData, theme, mode, pageTitle, showTitle }) {
  const themeCss = (THEMES.find(t => t.id === theme) || THEMES[0]).css;
  const preview = mode === 'preview';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<style>${css}</style>
<style>${TEMPLATE_CSS}${preview ? PREVIEW_CSS : ''}</style>
<style>${themeCss}</style>
${structuredDataHtml(structuredData)}
</head>
<body>
<header class="pg-header"><span class="pg-logo">Northside Decks</span><nav class="pg-nav" aria-label="Main"><span>Services</span><span>Our work</span><span>Guides</span><span>Contact</span></nav></header>
<main id="main">
<h1 class="pg-title${showTitle ? '' : ' pg-title--hidden'}">${escapeHtml(pageTitle)}</h1>
${html}
</main>
<footer class="pg-footer">Sample site template for the element playground</footer>
${preview ? `<script>${PREVIEW_SCRIPT}</script>` : ''}
</body>
</html>`;
}

// ---- server ----

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><text x="16" y="22" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#fff" text-anchor="middle">A</text></svg>`;

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};

async function main() {
  console.log(photosDir ? `Encoding photos from ${photosDir} ...` : 'Encoding sample images (cached after the first run) ...');
  const media = await prepareMedia({ photosDir });
  const host = mode => ({
    mode,
    resolveImage: async src => media.manifest.get(path.basename(String(src)).replace(/\.[^.]+$/, '')) || null,
  });

  let lastPage = null; // the most recent render, as a published (build-mode) page

  async function render({ yaml, mode = 'build', theme = THEMES[0].id, sampleId }) {
    const sample = SAMPLES.find(s => s.id === sampleId) || {};
    const started = performance.now();
    const input = yamlToLayout(yaml);
    const { layout, problems: saveProblems } = saveLayout(input);
    const stable = JSON.stringify(saveLayout(layout).layout) === JSON.stringify(layout);
    const out = await renderLayout(layout, host(mode));
    const build = mode === 'build' ? out : await renderLayout(layout, host('build'));
    const ms = Math.round((performance.now() - started) * 10) / 10;

    const page = { pageTitle: sample.pageTitle || 'Playground page', showTitle: sample.showTitle !== false, theme };
    lastPage = documentFor({ ...page, html: build.html, css: elementCss(build.css), structuredData: build.structuredData, mode: 'build' });

    const seen = new Set();
    const problems = [...saveProblems, ...out.problems].filter(p => {
      const key = `${p.id}|${p.field || ''}|${p.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const css = elementCss(build.css);
    return {
      ok: true,
      doc: documentFor({ ...page, html: out.html, css: elementCss(out.css), structuredData: out.structuredData, mode }),
      html: build.html,
      saved: layoutToYaml(layout),
      stable,
      problems,
      headings: build.headings,
      structuredData: build.structuredData,
      stylesheets: build.css.sort(),
      bytes: { html: Buffer.byteLength(build.html), css: Buffer.byteLength(css) },
      ms,
    };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico')) {
        return send(res, 200, FAVICON, 'image/svg+xml');
      }
      if (req.method === 'GET' && STATIC[url.pathname]) {
        const [file, type] = STATIC[url.pathname];
        return send(res, 200, fs.readFileSync(path.join(here, 'public', file)), type);
      }
      if (req.method === 'GET' && url.pathname === '/api/setup') {
        const samples = SAMPLES.map(s => ({ id: s.id, title: s.title, description: s.description, yaml: layoutToYaml(saveLayout(s.layout).layout) }));
        const themes = THEMES.map(({ id, label, description }) => ({ id, label, description }));
        return send(res, 200, { samples, themes, media: media.report, encoding: { ladder: LADDER, avifQuality: AVIF_QUALITY, webpQuality: WEBP_QUALITY, photos: !!photosDir } });
      }
      if (req.method === 'POST' && url.pathname === '/api/render') {
        try {
          return send(res, 200, await render(JSON.parse(await readBody(req))));
        } catch (err) {
          return send(res, 200, { ok: false, error: err.message });
        }
      }
      if (req.method === 'GET' && url.pathname === '/page') {
        return lastPage ? send(res, 200, lastPage, 'text/html; charset=utf-8') : send(res, 404, 'Render something first.', 'text/plain');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        const file = media.files.get(decodeURIComponent(url.pathname.slice('/media/'.length)));
        if (!file) return send(res, 404, 'Not found', 'text/plain');
        const type = file.endsWith('.avif') ? 'image/avif' : 'image/webp';
        return send(res, 200, fs.readFileSync(file), type, { 'Cache-Control': 'public, max-age=31536000, immutable' });
      }
      send(res, 404, 'Not found', 'text/plain');
    } catch (err) {
      send(res, 500, { ok: false, error: err.message });
    }
  });

  server.listen(port, hostName, () => {
    console.log(`Element playground: http://${hostName === '0.0.0.0' ? 'localhost' : hostName}:${port}`);
    if (hostName === '0.0.0.0') console.log('Listening on all network interfaces (LAN access on).');
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
