/**
 * site-admin — the generic local CMS admin engine for Ascend Web Design's
 * split-repo Astro sites (content-repo edition).
 *
 * This package is the SINGLE canonical copy of the admin engine. Per-site
 * repos consume it as a git dependency pinned to a version tag and supply
 * everything site-specific through startAdmin(config):
 *
 *   import { startAdmin } from 'site-admin';
 *   import { config } from './admin.config.mjs';
 *   startAdmin(config);
 *
 * Config keys (site-specific values live in the content repo, never here):
 *   root            (required) absolute path to the content repo root. The
 *                   engine only assumes the standard content-repo layout:
 *                   src/content, src/assets/uploads, public/documents.
 *   fields          (required) the FIELDS map: '<collection>/<slug>' → field
 *                   array. See the contract comment in references/admin.config.mjs.
 *   siteTitle       (required) e.g. 'Example Community Centre' — sidebar logo + console.
 *   developerName   (required) shown in client-facing error messages.
 *   developerEmail  (required) shown in client-facing error messages.
 *   sections        SECTIONS map: collection → field-name → {label, hint}.
 *   pageLabels      '<collection>/<slug>' → friendly page name.
 *   navStructure    sidebar groups mirroring the live site's menu:
 *                   [{ label, breadcrumb?: false, items: [{ key, sub? }] }].
 *                   breadcrumb:false omits that group's label from the top-bar
 *                   trail (use it on the main "Website Pages" group).
 *   tasks           start-screen shortcuts: [{ goto, field?, label }].
 *   startScreenIntro / startScreenNote   optional start-screen copy
 *                   (note may contain simple HTML: <br>, <strong>).
 *   browserTitle    optional browser-tab title, default '<siteTitle> — Content Admin'.
 *   altPlaceholder  optional example text for single-image description inputs.
 *   port            default port (env ADMIN_PORT always wins), default 4322.
 *   gitIdentity     { name, email } used only when the machine has no git
 *                   identity at all; defaults to Website Admin <developerEmail>.
 *   pullOnStart     optional; false disables the best-effort startup pull
 *                   for CI and read-only verification. Defaults to true.
 *
 * Every route, the sharp upload pipeline, the git publish flow, upload
 * pruning, search, and history/restore live here. The admin UI (admin.html,
 * shipped in this package) is fully generic — it fetches all site-specific
 * values from GET /api/config at boot.
 */
import http from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import matter from 'gray-matter';
import sharp from 'sharp';
import Busboy from 'busboy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Replaced/removed images and PDFs would otherwise sit in the working tree
// (and every deploy) forever. At publish time, delete any upload/document no
// page references — but only if it's older than 48 hours, so a photo the
// editor uploaded this session and hasn't saved yet can never be swept away.
// Git history still keeps every committed file, which is what makes the
// version-restore feature able to bring pruned files back.
const PRUNE_AGE_MS = 48 * 60 * 60 * 1000;

export function startAdmin(config) {
  for (const key of ['root', 'fields', 'siteTitle', 'developerName', 'developerEmail']) {
    if (!config?.[key]) throw new Error(`site-admin: config.${key} is required`);
  }

  const ROOT     = path.resolve(config.root);
  const CONTENT  = path.join(ROOT, 'src', 'content');
  const UPLOADS  = path.join(ROOT, 'src', 'assets', 'uploads');
  const ASSETS   = path.join(ROOT, 'src', 'assets');
  const DOCS     = path.join(ROOT, 'public', 'documents');
  const PORT     = parseInt(process.env.ADMIN_PORT || String(config.port || 4322), 10);

  const FIELDS   = config.fields;
  const SECTIONS = config.sections || {};
  const { siteTitle, developerName, developerEmail } = config;

  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(DOCS,    { recursive: true });

  const git = (args, options = {}) => execFileSync(
    'git', ['-C', ROOT, ...args],
    { encoding: 'utf-8', stdio: 'pipe', ...options },
  );

  function isInside(parent, candidate) {
    const rel = path.relative(path.resolve(parent), path.resolve(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  }

  // ── Form section headings ────────────────────────────────────────────────
  // Injected at serve time before the named field, so every page's long form
  // is broken into labelled sections without editing each FIELDS array by
  // hand. Several field names may map to the same heading (deduped by label)
  // because pages differ in which field starts a section.
  function withSections(key, fields) {
    const map = SECTIONS[key.split('/')[0]];
    if (!map) return fields;
    const seen = new Set();
    const out  = [];
    for (const f of fields) {
      const sec = map[f.name];
      if (sec && !seen.has(sec.label)) {
        seen.add(sec.label);
        out.push({ name: '_section_' + f.name, label: sec.label, hint: sec.hint, type: 'heading' });
      }
      out.push(f);
    }
    return out;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function jsonResp(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      let buf = '';
      req.on('data', c => (buf += c));
      req.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    });
  }

  function resolveAssetPath(frontmatterVal, contentFilePath) {
    if (!frontmatterVal || typeof frontmatterVal !== 'string') return null;
    return path.resolve(path.dirname(contentFilePath), frontmatterVal);
  }

  function relFromRoot(absPath) {
    return path.relative(ROOT, absPath).replace(/\\/g, '/');
  }

  function contentFile(collection, slug) {
    return path.join(CONTENT, collection, slug + '.md');
  }

  function sanitize(name) {
    return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  // Convert what the browser sent into what the .md file must store, per
  // field type. The critical one is `number`: a text input sends a STRING,
  // and gray-matter/js-yaml writes the JS string "1600" as the QUOTED YAML
  // string '1600', which z.number() then rejects — breaking the whole site
  // build on the client's next publish. Coerce to a real JS number here so
  // the YAML stays unquoted. (Keep z.coerce.number() in content.config.ts as
  // defense in depth.)
  function coerceValue(f, v) {
    if (v === null || v === undefined || v === '') return v;
    if (f.type === 'number') {
      const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
      return Number.isFinite(n) ? n : v; // invalid input is caught by validateData
    }
    if (f.type === 'list' && Array.isArray(v)) {
      // Drop fully-empty rows, but do NOT trim items — leading/trailing
      // spaces can be meaningful inside delimited list formats.
      return v.filter(item => String(item).trim() !== '');
    }
    return v;
  }

  // Friendly, field-level validation errors — shown verbatim in the admin UI.
  // This is what stands between a client's typo and a broken Netlify build.
  function validateData(fields, merged) {
    const errors = [];
    for (const f of fields) {
      const v = merged[f.name];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) {
        errors.push(`"${f.label}" cannot be empty.`);
      }
      if (f.type === 'number' && !empty && typeof v !== 'number') {
        errors.push(`"${f.label}" must be a number, e.g. 495 or 840.50 — no $ sign, commas or letters.`);
      }
    }
    return errors;
  }

  // Image values are { src, alt } objects (alt = client-written description,
  // rendered on the site for Google and screen readers); bare strings are
  // legacy content from before alt-text existed.
  function imgSrc(v) {
    return typeof v === 'string' ? v : (v && typeof v === 'object' ? v.src : null);
  }

  function buildPreviews(data, fields, filePath) {
    const previews = {};
    for (const f of fields) {
      if (f.type === 'image' && data[f.name]) {
        const abs = resolveAssetPath(imgSrc(data[f.name]), filePath);
        if (abs && fs.existsSync(abs)) {
          previews[f.name] = '/api/preview?p=' + encodeURIComponent(relFromRoot(abs));
        }
      }
      if (f.type === 'images' && Array.isArray(data[f.name])) {
        previews[f.name] = data[f.name].map(p => {
          const abs = resolveAssetPath(imgSrc(p), filePath);
          return (abs && fs.existsSync(abs))
            ? '/api/preview?p=' + encodeURIComponent(relFromRoot(abs))
            : null;
        });
      }
    }
    return previews;
  }

  // ── Orphaned upload pruning ──────────────────────────────────────────────

  function pruneOrphanUploads() {
    const referenced = new Set();
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.md')) {
          const txt = fs.readFileSync(p, 'utf-8');
          for (const m of txt.matchAll(/(?:uploads|documents)\/([A-Za-z0-9._-]+)/g)) referenced.add(m[1]);
        }
      }
    })(CONTENT);

    const removed = [];
    for (const dir of [UPLOADS, DOCS]) {
      for (const name of fs.readdirSync(dir)) {
        const p  = path.join(dir, name);
        const st = fs.statSync(p);
        if (!st.isFile() || referenced.has(name)) continue;
        if (Date.now() - st.mtimeMs < PRUNE_AGE_MS) continue;
        try { fs.unlinkSync(p); removed.push(name); } catch (_) { /* locked file — next publish */ }
      }
    }
    if (removed.length) console.log('  Pruned ' + removed.length + ' unused upload(s):', removed.join(', '));
    return removed;
  }

  // A fresh Git install has no user.name/user.email, and the first commit on
  // a client's machine fails with a raw "Please tell me who you are" error.
  // Set a repo-local identity (never --global — don't touch the client's own
  // config).
  function ensureGitIdentity() {
    let email = '';
    try { email = git(['config', 'user.email']).trim(); }
    catch (_) { /* unset — git exits 1 */ }
    if (email) return;
    const id = { name: 'Website Admin', email: developerEmail, ...(config.gitIdentity || {}) };
    try {
      git(['config', 'user.name', String(id.name)]);
      git(['config', 'user.email', String(id.email)]);
    } catch (_) { /* non-fatal; publish will surface any real git problem */ }
  }

  // ── File upload handlers ─────────────────────────────────────────────────

  async function handleImageUpload(req) {
    return new Promise((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
      let imgType  = 'hero';
      let buffer   = null;
      let tooBig   = false;
      let origName = 'upload';

      bb.on('field', (name, val) => { if (name === 'imageType') imgType = val; });
      bb.on('file', (_name, file, info) => {
        origName = path.parse(info.filename || 'upload').name;
        const chunks = [];
        file.on('data', d => chunks.push(d));
        file.on('limit', () => { tooBig = true; });
        file.on('close', () => { buffer = Buffer.concat(chunks); });
      });
      bb.on('close', async () => {
        if (tooBig)  { reject(new Error('That image is over 25 MB. Please use a smaller photo.')); return; }
        if (!buffer) { reject(new Error('No file data')); return; }
        const maxWidth = imgType === 'gallery' ? 1200 : 1920;
        const stamp    = Date.now();
        const outName  = stamp + '-' + sanitize(origName) + '.webp';
        const outPath  = path.join(UPLOADS, outName);
        try {
          await sharp(buffer)
            .resize({ width: maxWidth, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(outPath);
          resolve({
            // Relative from src/content/<collection>/<slug>.md so the source
            // repo's zod image() helper resolves it natively.
            path:    '../../assets/uploads/' + outName,
            preview: '/api/preview?p=' + encodeURIComponent('src/assets/uploads/' + outName),
          });
        } catch (e) {
          reject(new Error('Could not read that image. Please use a JPG, PNG or WebP photo. iPhone HEIC photos may need converting first — open the photo and Save As JPG, or email it to yourself (which usually converts it).'));
        }
      });
      req.pipe(bb);
    });
  }

  async function handlePdfUpload(req) {
    return new Promise((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
      let buffer   = null;
      let tooBig   = false;
      let filename = 'document.pdf';

      bb.on('file', (_name, file, info) => {
        // Stable filename on purpose: replacing a PDF keeps its public URL.
        filename = sanitize(info.filename || 'document.pdf');
        if (!filename.endsWith('.pdf')) filename += '.pdf';
        const chunks = [];
        file.on('data', d => chunks.push(d));
        file.on('limit', () => { tooBig = true; });
        file.on('close', () => { buffer = Buffer.concat(chunks); });
      });
      bb.on('close', async () => {
        if (tooBig)  { reject(new Error('That PDF is over 25 MB. Please compress it first.')); return; }
        if (!buffer) { reject(new Error('No file data')); return; }
        await fsp.writeFile(path.join(DOCS, filename), buffer);
        resolve({ path: '/documents/' + filename });
      });
      req.pipe(bb);
    });
  }

  // ── HTTP Server ──────────────────────────────────────────────────────────

  const server = http.createServer(async (req, res) => {
    const url   = new URL(req.url, 'http://localhost:' + PORT);
    const path_ = url.pathname;

    const allowedOrigins = new Set([
      `http://localhost:${PORT}`,
      `http://127.0.0.1:${PORT}`,
    ]);
    const origin = req.headers.origin;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET');

    // This unauthenticated service is deliberately localhost-only. Reject
    // cross-origin writes so a hostile website cannot drive a running admin
    // through the visitor's browser. Same-origin responses need no CORS.
    if ((origin && !allowedOrigins.has(origin)) || (mutating && !origin)) {
      jsonResp(res, 403, { error: 'Forbidden origin' });
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204); res.end(); return;
    }

    try {

      if (path_ === '/' && req.method === 'GET') {
        const html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // Everything site-specific the admin UI needs — admin.html is generic
      // and fetches this at boot instead of hardcoding any of it.
      if (path_ === '/api/config' && req.method === 'GET') {
        jsonResp(res, 200, {
          siteTitle,
          browserTitle:     config.browserTitle || (siteTitle + ' — Content Admin'),
          pageLabels:       config.pageLabels   || {},
          navStructure:     config.navStructure || [],
          tasks:            config.tasks        || [],
          startScreenIntro: config.startScreenIntro || 'Pick a page from the left, type in the search box to find any setting, or jump straight to a common task:',
          startScreenNote:  config.startScreenNote  || 'Fields are listed top-to-bottom in the same order they appear on the website.<br>Make your changes, click <strong>Save Draft</strong>, then <strong>Publish Changes</strong> when ready.',
          altPlaceholder:   config.altPlaceholder   || 'e.g. "Guests dining in the main dining room"',
        });
        return;
      }

      if (path_ === '/api/content' && req.method === 'GET') {
        const tree = {};
        for (const key of Object.keys(FIELDS)) {
          const [col, slug] = key.split('/');
          (tree[col] = tree[col] || []).push(slug);
        }
        jsonResp(res, 200, tree);
        return;
      }

      // Every editable field on every page — powers the sidebar "find
      // anything" search so editors don't need to know which page a setting
      // lives on. Each entry also carries the field's current saved value so
      // the search matches the words on the website, not just our field
      // names. The client re-fetches this after every save.
      if (path_ === '/api/search' && req.method === 'GET') {
        const index = {};
        for (const [key, fields] of Object.entries(FIELDS)) {
          const [col, slug] = key.split('/');
          let data = {}, body = '';
          const fp = contentFile(col, slug);
          if (fs.existsSync(fp)) ({ data, content: body } = matter(fs.readFileSync(fp, 'utf-8')));
          index[key] = fields
            .filter(f => f.type !== 'heading')
            .map(f => {
              const v = f.type === 'markdown' ? body : data[f.name];
              let value = '';
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') value = String(v);
              else if (Array.isArray(v)) value = v.map(x => (x && typeof x === 'object') ? Object.values(x).join(' ') : String(x)).join('\n');
              else if (v && typeof v === 'object') value = Object.values(v).filter(x => typeof x === 'string').join(' ');
              return { name: f.name, label: f.label, hint: f.hint || '', value };
            });
        }
        jsonResp(res, 200, index);
        return;
      }

      // ── Version history & restore ────────────────────────────────────
      // Every Save/Publish is a git commit, so every page already has a full
      // undo trail — these endpoints just expose it. Restore never rewrites
      // history: it materialises the chosen version into the working tree as
      // an ordinary edit (plus any pruned uploads that version references),
      // which the editor then Publishes like any other change. Even a
      // restore can therefore be restored.
      const historyMatch = path_.match(/^\/api\/history\/([^/]+)\/(.+)$/);
      if (historyMatch && req.method === 'GET') {
        const [, collection, slug] = historyMatch;
        if (!FIELDS[collection + '/' + slug]) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const rel = `src/content/${collection}/${slug}.md`;
        let out = '';
        try {
          out = git(['log', '--format=%H%x09%ct%x09%s', '-n', '30', '--', rel]);
        } catch (_) { /* not committed yet — empty history */ }
        const versions = out.trim().split('\n').filter(Boolean).map(line => {
          const [sha, epoch, ...msg] = line.split('\t');
          return { sha, date: parseInt(epoch, 10) * 1000, message: msg.join('\t') };
        });
        jsonResp(res, 200, { versions });
        return;
      }

      const restoreMatch = path_.match(/^\/api\/restore\/([^/]+)\/(.+)$/);
      if (restoreMatch && req.method === 'POST') {
        const [, collection, slug] = restoreMatch;
        if (!FIELDS[collection + '/' + slug]) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const { sha } = await parseJsonBody(req);
        if (!/^[0-9a-f]{7,40}$/i.test(sha || '')) { jsonResp(res, 400, { error: 'Bad version id' }); return; }
        const rel = `src/content/${collection}/${slug}.md`;

        let oldContent;
        try {
          oldContent = git(['show', `${sha}:${rel}`]);
        } catch (_) {
          jsonResp(res, 400, { error: 'Could not read that version.' });
          return;
        }

        // Bring back any upload/document that version references but which
        // has since been pruned from the working tree. The file was
        // committed in the same commit as the page that referenced it, so it
        // exists at sha.
        const restoredFiles = [];
        for (const m of oldContent.matchAll(/(uploads|documents)\/([A-Za-z0-9._-]+)/g)) {
          const assetRel = m[1] === 'uploads'
            ? `src/assets/uploads/${m[2]}`
            : `public/documents/${m[2]}`;
          if (fs.existsSync(path.join(ROOT, assetRel))) continue;
          try {
            git(['checkout', sha, '--', assetRel]);
            restoredFiles.push(m[2]);
          } catch (_) { /* asset predates repo or path changed — page still restores */ }
        }

        fs.writeFileSync(path.join(ROOT, rel), oldContent, 'utf-8');
        jsonResp(res, 200, { ok: true, restoredFiles });
        return;
      }

      const contentMatch = path_.match(/^\/api\/content\/([^/]+)\/(.+)$/);
      if (contentMatch && req.method === 'GET') {
        const [, collection, slug] = contentMatch;
        if (!FIELDS[collection + '/' + slug]) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const fp = contentFile(collection, slug);
        if (!fs.existsSync(fp)) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const { data, content: body } = matter(fs.readFileSync(fp, 'utf-8'));
        const fields   = withSections(collection + '/' + slug, FIELDS[collection + '/' + slug] || []);
        const previews = buildPreviews(data, fields, fp);
        jsonResp(res, 200, { data, body, fields, previews });
        return;
      }

      if (contentMatch && req.method === 'POST') {
        const [, collection, slug] = contentMatch;
        if (!FIELDS[collection + '/' + slug]) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const fp     = contentFile(collection, slug);
        const fields = FIELDS[collection + '/' + slug] || [];
        const { data, body } = await parseJsonBody(req);

        // Coerce incoming values per field type BEFORE merging/writing.
        const byName  = Object.fromEntries(fields.map(f => [f.name, f]));
        const coerced = Object.fromEntries(
          Object.entries(data || {}).map(([k, v]) => [k, byName[k] ? coerceValue(byName[k], v) : v])
        );

        let existing = {};
        if (fs.existsSync(fp)) existing = matter(fs.readFileSync(fp, 'utf-8')).data;
        // Clearing a field removes its key from the .md (falls back to the
        // template default / zod .optional()). `false` is kept — only
        // genuinely empty values are dropped.
        const merged = Object.fromEntries(
          Object.entries({ ...existing, ...coerced }).filter(([, v]) => v !== null && v !== undefined && v !== '')
        );

        const errors = validateData(fields, merged);
        if (errors.length) { jsonResp(res, 400, { ok: false, error: errors.join(' ') }); return; }

        fs.writeFileSync(fp, matter.stringify(body || '', merged), 'utf-8');
        jsonResp(res, 200, { ok: true });
        return;
      }

      if (path_ === '/api/upload/image' && req.method === 'POST') {
        try { jsonResp(res, 200, await handleImageUpload(req)); }
        catch (e) { jsonResp(res, 400, { error: e.message }); }
        return;
      }

      if (path_ === '/api/upload/pdf' && req.method === 'POST') {
        try { jsonResp(res, 200, await handlePdfUpload(req)); }
        catch (e) { jsonResp(res, 400, { error: e.message }); }
        return;
      }

      if (path_ === '/api/preview' && req.method === 'GET') {
        const p = url.searchParams.get('p') || '';
        const abs = path.resolve(ROOT, p);
        // Previews cover both CMS-uploaded images (src/assets/uploads) and
        // legacy images already in the repo when it was migrated to the CMS
        // (src/assets/images, etc.) — buildPreviews() resolves image fields
        // to wherever the content file's frontmatter actually points, which
        // for pre-CMS content is anywhere under src/assets, not just uploads.
        if ((!isInside(ASSETS, abs) && !isInside(DOCS, abs)) || !isInside(ROOT, abs)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        if (!fs.existsSync(abs)) { res.writeHead(404); res.end('Not found'); return; }
        const ext  = path.extname(abs).toLowerCase();
        const mime = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        fs.createReadStream(abs).pipe(res);
        return;
      }

      if (path_ === '/api/git/push' && req.method === 'POST') {
        const { message } = await parseJsonBody(req);
        const msg = String(message || 'Content update').replace(/[\r\n]+/g, ' ').slice(0, 200);
        let gitOk     = false;
        let gitOutput = '';
        try {
          // Sweep out uploads nothing references any more (git add below
          // stages the deletions), then commit local changes first so the
          // pull below merges two real commits instead of choking on
          // uncommitted edits.
          pruneOrphanUploads();
          git(['add', 'src/content', 'src/assets/uploads', 'public/documents']);
          try { git(['diff', '--cached', '--quiet']); }
          catch (_) { git(['commit', '-m', msg]); }

          // Pull in anything another editor published since this copy was
          // last opened. Two editors is the NORMAL case, not an edge case.
          // Most of the time this merges cleanly (different pages changed);
          // only a real same-file conflict needs a human.
          try {
            git(['pull', '--no-rebase', '--no-edit']);
          } catch (pullErr) {
            try { git(['merge', '--abort']); } catch (_) {}
            throw Object.assign(
              new Error(`Someone else published changes just before you that overlap with your edit. Please contact ${developerName} so both changes can be combined, then try Publish again.`),
              { friendly: true }
            );
          }

          const out = git(['push']);
          gitOk     = true;
          gitOutput = out || 'Changes pushed successfully.';
        } catch (e) {
          gitOutput = e.friendly ? e.message : ((e.stdout || '') + (e.stderr || '') || e.message || `Something went wrong publishing your changes. Please try again or contact ${developerName} (${developerEmail}).`);
        }

        // Publishing = pushing the content repo. Netlify watches this repo,
        // so the push itself triggers the rebuild — no build hook, no
        // client-side secrets, no separate "push worked but hook failed"
        // state.
        jsonResp(res, 200, { ok: gitOk, output: gitOutput });
        return;
      }

      res.writeHead(404); res.end('Not found');

    } catch (e) {
      console.error(e);
      jsonResp(res, 500, { error: e.message });
    }
  });

  // Bind to localhost only — this tool has no auth; it must never be
  // reachable from the network.
  server.listen(PORT, '127.0.0.1', () => {
    console.log('\n  ' + siteTitle + ' Content Admin');
    console.log('  ->  http://localhost:' + PORT);
    console.log('  ->  Make changes -> Save Draft -> Publish Changes -> site rebuilds automatically\n');

    ensureGitIdentity();

    // Best-effort: start from the latest content another editor may have
    // published, so this session isn't already stale before anyone types.
    if (config.pullOnStart !== false) {
      try { git(['pull', '--no-rebase', '--no-edit']); }
      catch (_) { /* non-fatal — the pull-before-push in /api/git/push still protects publishing */ }
    }
  });

  return server;
}
