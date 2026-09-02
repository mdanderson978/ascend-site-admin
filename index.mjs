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
 *                   [{ label, breadcrumb?: false, items: [{ key, sub? } |
 *                   { dynamic: '<collection>', sub?, exclude?: string[] }] }].
 *                   breadcrumb:false omits that group's label from the top-bar
 *                   trail (use it on the main "Website Pages" group). A
 *                   dynamic item mounts that collection's entries and "+ New"
 *                   control at that point in the sidebar. `exclude` can keep
 *                   entries that belong under a different configured hub out
 *                   of that mount; unmounted dynamic collections still render
 *                   as their own sections.
 *   dynamicCollections   optional; collections the client can add/delete
 *                   entries in from the admin UI, keyed by collection name:
 *                     { <collection>: { fields, titleField, label,
 *                                       orderField?, sortFields?, sortDirection? } }
 *                   `fields` is the FIELDS-style array applied to every entry
 *                   in that collection (existing and new — there is no
 *                   static per-slug FIELDS entry for a dynamic collection,
 *                   since slugs don't exist ahead of time). `titleField`
 *                   names which submitted field is slugified for the new
 *                   file's filename. `label` is the singular noun shown in
 *                   UI copy ("+ New <label>", "Delete this <label>?").
 *                   `orderField`, when provided, names a numeric field used
 *                   to sort that collection's sidebar entries and enables
 *                   click-and-drag reordering. Reordering updates only that
 *                   field and still requires Publish Changes.
 *                   `sortFields` + `sortDirection` are the OTHER, automatic
 *                   way to order a dynamic collection's sidebar entries — no
 *                   dragging, no stored order field, just a live sort by each
 *                   entry's own real frontmatter value(s) every time the list
 *                   is read. `sortFields` is an array of field names (e.g.
 *                   ['date', 'service']) compared in order — the first
 *                   field breaks ties with the second, and so on. Values are
 *                   compared as plain strings (a missing field sorts as
 *                   '') — this is deliberate, not a limitation: an ISO
 *                   'YYYY-MM-DD' date string already sorts correctly as a
 *                   string with no date parsing needed, and a two-value enum
 *                   like 'am'/'pm' sorts correctly too ('pm' > 'am'). Don't
 *                   reach for real date parsing here unless a site's actual
 *                   date field isn't already zero-padded ISO. `sortDirection`
 *                   is 'asc' or 'desc' (required when sortFields is set — no
 *                   default, so a site always states its intent explicitly)
 *                   and applies to every key in sortFields uniformly. A
 *                   collection using sortFields should NOT also set
 *                   orderField — the automatic sort recomputes the order on
 *                   every read, which would fight a dragged position
 *                   immediately; sortFields wins if both are set (drag
 *                   reordering is simply disabled, matching orderField being
 *                   absent). A collection not listed here at all keeps
 *                   today's behavior exactly: a fixed, developer-defined set
 *                   of entries that can never be added to or deleted via the
 *                   admin.
 *   tasks           start-screen shortcuts: [{ goto, field?, label }].
 *   shortcodes      optional; controls which "advanced content" toolbar
 *                   buttons appear in every markdown body editor:
 *                     { include?: string[], custom?: [...] }
 *                   `include` lists built-in shortcode ids (see admin.html's
 *                   BUILTIN_SHORTCODES catalog) to show, REPLACING the
 *                   default set — omit `shortcodes` entirely to keep
 *                   today's default 6 advanced buttons unchanged. `custom`
 *                   lists site-specific declarative entries appended after
 *                   the built-ins (no functions — this crosses the JSON
 *                   wire to the browser, see the contract comment in
 *                   references/admin.config.mjs).
 *   siteUrl         optional; the base URL of the site an editor should see
 *                   when they click "View live site" (e.g.
 *                   'https://staging.example.com' while a rebuild hasn't
 *                   cut over DNS yet, or the real domain once it has). The
 *                   button is hidden entirely if this is omitted.
 *   urlPatterns     optional; '<collection>' -> a path template using
 *                   '{slug}', e.g. { pages: '{slug}', services:
 *                   'services/{slug}' }. A collection with no entry here
 *                   (or mapped to null, e.g. settings) never shows the
 *                   button for its entries. The slug 'home' always maps to
 *                   the site root ('') regardless of pattern — every site
 *                   in this fleet treats it as the special index page.
 *   startScreenIntro / startScreenNote   optional start-screen copy
 *                   (note may contain simple HTML: <br>, <strong>).
 *   browserTitle    optional browser-tab title, default '<siteTitle> — Content Admin'.
 *   altPlaceholder  optional example text for single-image description inputs.
 *   port            default port (env ADMIN_PORT always wins), default 4322.
 *   gitIdentity     { name, email } used only when the machine has no git
 *                   identity at all; defaults to Website Admin <developerEmail>.
 *   pullOnStart     optional; false disables the best-effort startup pull
 *                   for CI and read-only verification. Defaults to true.
 *   adminUi         optional; set to 'legacy' for a temporary rollback to
 *                   the 1.x interface. V2 remains available at /v2 and the
 *                   legacy interface always remains available at /legacy.
 *                   DEPRECATED (see RELEASING.md): logs a console warning
 *                   at boot when set, and again the first time /legacy or
 *                   ?legacy=1 is actually visited. Will be removed in a
 *                   future major version once no known site still sets it.
 *   renamable       optional; string[] of '<collection>/<slug>' keys for
 *                   STATIC (non-dynamic) pages the client may rename from
 *                   the admin UI, in addition to every dynamicCollections
 *                   entry (which is always renamable). Use this to allow
 *                   renaming a specific hub/landing page without opening
 *                   rename up to every static page on the site.
 *   externalLinkSurfaces   optional; string[] of plain-English descriptions
 *                   shown verbatim in the rename warning dialog, e.g.
 *                   ['Main navigation menu', 'Footer quick links',
 *                   'Breadcrumb schema on service pages']. These are
 *                   things the engine has no reach into on rename (they
 *                   live in the source repo, not this content repo) — list
 *                   whatever is actually true for this site so the warning
 *                   is accurate, not generic boilerplate.
 *   crossListable   optional; '<collection>' -> { field, targetCollection,
 *                   label? }, for a collection whose entries can ALSO be
 *                   cross-listed on another collection's hub grid via
 *                   their own boolean field (e.g. LPR's flagship
 *                   pages/pool-tiling-melbourne setting
 *                   also_in_services: true to also appear as a card on
 *                   the Services hub). Purely informational — shown as a
 *                   badge on the entry's identity card ("Also shown on:
 *                   <label>") when that entry's `field` is true. Does not
 *                   change urlPatterns or rendering; the field itself
 *                   still lives in this collection's own FIELDS array.
 *   menuSlots       optional; '<slotKey>' -> { label }, developer-declared
 *                   permanent IDs for where a source-repo template renders
 *                   a named menu (e.g. { header_primary: { label: 'Header
 *                   — Primary Nav' } }). The admin assigns which menu (see
 *                   src/content/.site-admin/menus.json, MENUS.md) currently
 *                   fills each slot; slot keys never change even when the
 *                   admin renames or replaces the assigned menu, so a
 *                   developer's template wiring never breaks from an
 *                   admin-side rename.
 *
 * Every route, the sharp upload pipeline, the git publish flow, upload
 * pruning, search, history/restore, and page renaming (with 301-redirect
 * bookkeeping in src/content/.site-admin/redirects.json — see
 * REDIRECTS.md for the consumption contract) live here. The admin UI
 * (admin.html, shipped in this package) is fully generic — it fetches all
 * site-specific values from GET /api/config at boot.
 */
import http from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import matter from 'gray-matter';
import sharp from 'sharp';
import Busboy from 'busboy';
import { sortChatGptHtml } from './rich-html.mjs';
import { loadRedirects, saveRedirects, recordRedirect, resolveUrl } from './redirects.mjs';
import { findInternalLinks, fixInternalLinks } from './linkFixer.mjs';
import { loadMenus, saveMenus } from './menus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Replaced/removed images and PDFs would otherwise sit in the working tree
// (and every deploy) forever. At publish time, delete any upload/document no
// page references — but only if it's older than 48 hours, so a photo the
// editor uploaded this session and hasn't saved yet can never be swept away.
// Git history still keeps every committed file, which is what makes the
// version-restore feature able to bring pruned files back.
const PRUNE_AGE_MS = 48 * 60 * 60 * 1000;

const DEFAULT_IMAGE_SIZES = {
  hero:    { w: 1200, h: 600, label: 'at least 1200 x 600 px', maxWidth: 1920 },
  gallery: { w: 800,  h: 400, label: 'at least 800 x 400 px',  maxWidth: 1200 },
};

export function startAdmin(config) {
  for (const key of ['root', 'fields', 'siteTitle', 'developerName', 'developerEmail']) {
    if (!config?.[key]) throw new Error(`site-admin: config.${key} is required`);
  }

  const ROOT     = path.resolve(config.root);
  const CONTENT  = path.join(ROOT, 'src', 'content');
  const UPLOADS  = path.join(ROOT, 'src', 'assets', 'uploads');
  const ASSETS   = path.join(ROOT, 'src', 'assets');
  const DOCS     = path.join(ROOT, 'public', 'documents');
  const CONTENT_ASSETS = path.join(ROOT, 'public', 'content-assets');
  const PORT     = parseInt(process.env.ADMIN_PORT || String(config.port || 4322), 10);
  const ADMIN_DIST = path.join(__dirname, 'dist', 'admin');

  const FIELDS   = config.fields;
  const SECTIONS = config.sections || {};
  const DYNAMIC  = config.dynamicCollections || {};
  for (const [col, d] of Object.entries(DYNAMIC)) {
    if (d.sortFields?.length && d.sortDirection !== 'asc' && d.sortDirection !== 'desc') {
      throw new Error(`site-admin: dynamicCollections.${col}.sortDirection must be 'asc' or 'desc' when sortFields is set`);
    }
  }

  // A `blocks` field's own block types are themselves ordinary FieldConfig
  // arrays — but two field types don't make sense one level down and would
  // otherwise fail confusingly at first-save instead of at boot: 'blocks'
  // (no nesting for v1 — a block palette inside a block palette has no
  // matching Zod discriminated-union shape on the Astro side) and
  // 'markdown' (a block isn't a full page body; the shortcode/MarkdownEditor
  // pipeline is scoped to one top-level field, not one block instance).
  // Checked once at boot, across every FIELDS/dynamicCollections field
  // template, so a bad config fails loudly at server start rather than
  // silently misbehaving the first time an editor opens the form.
  function validateBlockTypeConfig(fields, where) {
    for (const f of fields) {
      if (f.type !== 'blocks') continue;
      for (const blockType of f.blockTypes || []) {
        for (const sub of blockType.fields || []) {
          if (sub.type === 'blocks' || sub.type === 'markdown') {
            throw new Error(`site-admin: ${where} field "${f.name}" — block type "${blockType.id}" has a "${sub.name}" field of type '${sub.type}', which is not allowed inside a block (no nesting, and a block isn't a full page body).`);
          }
        }
      }
    }
  }
  for (const [key, fields] of Object.entries(FIELDS)) validateBlockTypeConfig(fields, `fields["${key}"]`);
  for (const [col, d] of Object.entries(DYNAMIC)) validateBlockTypeConfig(d.fields, `dynamicCollections.${col}.fields`);
  const IMAGE_SIZES = { ...DEFAULT_IMAGE_SIZES, ...(config.imageSizes || {}) };
  const { siteTitle, developerName, developerEmail } = config;

  // adminUi: 'legacy' and /legacy are deprecated (kept working as the
  // documented V2 rollback path — see RELEASING.md) but will be removed in
  // a future major version once no known site still sets adminUi: 'legacy'.
  // Warned once at boot for a persistent site-level config choice; the
  // route handlers below warn once more, deduped, for the more ephemeral
  // case of someone visiting /legacy or ?legacy=1 directly.
  if (config.adminUi === 'legacy') {
    console.warn('site-admin: adminUi: \'legacy\' is deprecated and will be removed in a future major version. Switch to the default V2 interface when convenient.');
  }
  let warnedLegacyRoute = false;
  function warnLegacyRoute() {
    if (warnedLegacyRoute) return;
    warnedLegacyRoute = true;
    console.warn('site-admin: the legacy admin interface is deprecated and will be removed in a future major version. The default V2 interface covers everything it does, plus page rename and Menu Manager.');
  }

  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(DOCS,    { recursive: true });
  fs.mkdirSync(path.join(CONTENT, '.site-admin'), { recursive: true });
  if (config.richHtmlImport) fs.mkdirSync(CONTENT_ASSETS, { recursive: true });

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

  // Static FIELDS entries keep working exactly as before; a collection
  // listed in DYNAMIC has no per-slug entry (slugs don't exist ahead of
  // time) so its shared field template applies to every one of its entries.
  function resolveFields(collection, slug) {
    const key = collection + '/' + slug;
    if (FIELDS[key]) return FIELDS[key];
    if (DYNAMIC[collection]) return DYNAMIC[collection].fields;
    return null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function jsonResp(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function serveAdminAsset(res, filename, cache = false) {
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) return false;
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.map': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
    }[path.extname(filename).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filename).pipe(res);
    return true;
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

  function richHtmlTargetSlug(collection, requestedSlug, data = {}) {
    if (requestedSlug !== 'new') return requestedSlug;
    const dynamic = DYNAMIC[collection];
    const titleValue = dynamic && data?.[dynamic.titleField];
    if (!titleValue) throw new Error('Enter the page title before uploading images or importing ChatGPT HTML.');
    const base = sanitize(String(titleValue)) || 'untitled';
    const dir = path.join(CONTENT, collection);
    let targetSlug = base;
    let suffix = 2;
    while (fs.existsSync(path.join(dir, targetSlug + '.md'))) targetSlug = `${base}-${suffix++}`;
    return targetSlug;
  }

  function sanitize(name) {
    return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  // Automatic sidebar ordering for a dynamic collection via
  // DYNAMIC[col].sortFields/sortDirection (see the config contract comment
  // at the top of this file) — an alternative to the manual-drag
  // orderField, for collections that should just always read in real
  // frontmatter order (newest sermon first, etc.) with no dragging and no
  // stored position field. Reads every entry's frontmatter once per call;
  // fine at fleet-realistic collection sizes (hundreds of entries, not
  // reading anything upload-heavy). String comparison only, deliberately —
  // see the contract comment for why that's correct for ISO dates and
  // short enums without needing real date parsing.
  //
  // gray-matter's underlying YAML parser auto-coerces an UNQUOTED
  // ISO-8601-looking scalar (date: 2026-01-05, no quotes) into a real JS
  // Date object, not a string — every admin-saved date is written quoted
  // (date: "2026-01-05") specifically to avoid this, but hand-edited or
  // differently-migrated content can still arrive unquoted. String(dateObj)
  // produces something like "Sun Jan 04 2026 13:00:00 GMT+0000 ..." which
  // sorts nothing like the ISO string it displays as — caught by this
  // function's own test using an unquoted fixture date and sorting wrong.
  // toDateAwareString() normalizes a Date back to its ISO calendar date
  // before the plain string comparison, so both quoted and unquoted dates
  // sort identically.
  function toDateAwareString(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value ?? '');
  }
  function sortDynamicSlugs(col, slugs) {
    const dyn = DYNAMIC[col];
    const fieldsToSort = dyn?.sortFields;
    if (!fieldsToSort?.length) return slugs;
    const dir = dyn.sortDirection === 'asc' ? 1 : -1;
    const keyed = slugs.map(slug => {
      const fp = contentFile(col, slug);
      let data = {};
      if (fs.existsSync(fp)) {
        try { ({ data } = matter(fs.readFileSync(fp, 'utf-8'))); } catch { /* malformed entry sorts as all-blank keys, not fatal */ }
      }
      return { slug, keys: fieldsToSort.map(f => toDateAwareString(data?.[f])) };
    });
    keyed.sort((a, b) => {
      for (let i = 0; i < a.keys.length; i++) {
        if (a.keys[i] < b.keys[i]) return -1 * dir;
        if (a.keys[i] > b.keys[i]) return 1 * dir;
      }
      return 0;
    });
    return keyed.map(k => k.slug);
  }

  // A page's filename is its only identity today (no separate content ID
  // anywhere in the schema) — stable_id gives rename logic (and, in a later
  // release, hub-ownership tracking) something that survives the filename
  // changing. Safe to write into every site's frontmatter unconditionally:
  // Zod's default z.object() (no site in the fleet uses .strict()) silently
  // drops unknown keys, so this needs no content-schema change to be safe —
  // only if a site later wants to *read* the value at build time.
  function ensureStableId(data) {
    if (typeof data.stable_id === 'string' && data.stable_id) return data;
    return { ...data, stable_id: crypto.randomUUID() };
  }

  // One-time (per file), idempotent sweep so every pre-existing content file
  // gets a stable_id on first boot after upgrading. Runs after the startup
  // pull so it never stamps a fresh ID onto content about to be replaced by
  // a teammate's already-ID'd version from origin.
  function backfillStableIds() {
    if (!fs.existsSync(CONTENT)) return 0;
    let touched = 0;
    for (const entry of fs.readdirSync(CONTENT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.site-admin') continue;
      const dir = path.join(CONTENT, entry.name);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.md')) continue;
        const fp = path.join(dir, file);
        const parsed = matter(fs.readFileSync(fp, 'utf-8'));
        if (typeof parsed.data.stable_id === 'string' && parsed.data.stable_id) continue;
        parsed.data.stable_id = crypto.randomUUID();
        fs.writeFileSync(fp, matter.stringify(parsed.content, parsed.data), 'utf-8');
        touched++;
      }
    }
    if (touched) console.log(`  Assigned stable_id to ${touched} content file(s) — this will show up as a larger-than-usual diff on the next Publish. This is expected, one-time, and additive-only.`);
    return touched;
  }

  // Every content page with its title and stable_id — the one full scan
  // both resolveStableId() (rename-proof resolution for menus.json's
  // page-type items) and GET /api/menu-pages (the "link to a page" picker,
  // which needs stable_id to build a menu item and it's exposed nowhere
  // else — GET /api/search only ever includes FIELDS-declared fields,
  // never the engine-internal stable_id) both need. Re-scans on every
  // call rather than caching, same "just re-read on every request"
  // approach as loadRedirects; acceptable at the file counts a local CMS
  // actually sees (backfillStableIds already does a full-repo scan at
  // boot with no concern).
  function allContentPages() {
    if (!fs.existsSync(CONTENT)) return [];
    const pages = [];
    for (const entry of fs.readdirSync(CONTENT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.site-admin') continue;
      const collection = entry.name;
      const dir = path.join(CONTENT, collection);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.md')) continue;
        const slug = file.slice(0, -3);
        const { data } = matter(fs.readFileSync(path.join(dir, file), 'utf-8'));
        pages.push({ collection, slug, key: `${collection}/${slug}`, title: typeof data.title === 'string' ? data.title : slug, stableId: typeof data.stable_id === 'string' ? data.stable_id : null });
      }
    }
    return pages;
  }

  function resolveStableId(stableId) {
    const page = allContentPages().find(p => p.stableId === stableId);
    return page ? { collection: page.collection, slug: page.slug, path: resolveUrl(config, page.collection, page.slug) } : null;
  }

  function imageSizePreset(type) {
    return IMAGE_SIZES[type] || IMAGE_SIZES.gallery;
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
    if (f.type === 'blocks' && Array.isArray(v)) {
      const byType = Object.fromEntries((f.blockTypes || []).map(bt => [bt.id, bt]));
      return v.map(block => {
        const def = block && typeof block === 'object' ? byType[block.type] : null;
        if (!def) return block; // unrecognized type — passed through, validateData rejects it
        const subByName = Object.fromEntries(def.fields.map(sub => [sub.name, sub]));
        const out = { type: block.type }; // UI-only `id` deliberately dropped here — never reaches YAML
        for (const [k, val] of Object.entries(block)) {
          if (k === 'id' || k === 'type') continue;
          const sub = subByName[k];
          const coerced = sub ? coerceValue(sub, val) : val;
          // Same empty-string convention the top-level save routes already
          // apply (index.mjs's POST /api/content/:collection/:slug) — an
          // optional sub-field left blank is omitted rather than written as
          // `''`, so a block re-saved without every optional value filled
          // in produces the same clean YAML either way.
          if (coerced !== null && coerced !== undefined && coerced !== '') out[k] = coerced;
        }
        return out;
      });
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
      if (f.type === 'blocks' && Array.isArray(v)) {
        const byType = Object.fromEntries((f.blockTypes || []).map(bt => [bt.id, bt]));
        if (typeof f.min === 'number' && v.length < f.min) errors.push(`"${f.label}" needs at least ${f.min} block${f.min === 1 ? '' : 's'}.`);
        if (typeof f.max === 'number' && v.length > f.max) errors.push(`"${f.label}" allows at most ${f.max} block${f.max === 1 ? '' : 's'}.`);
        v.forEach((block, index) => {
          const def = block && typeof block === 'object' ? byType[block.type] : null;
          const position = `Section ${index + 1}${def ? ` ("${def.label}")` : ''}`;
          if (!def) { errors.push(`${position}: unrecognized block type "${block?.type}".`); return; }
          for (const nested of validateData(def.fields, block)) errors.push(`${position}: ${nested}`);
        });
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
      if (f.type === 'blocks' && Array.isArray(data[f.name])) {
        const byType = Object.fromEntries((f.blockTypes || []).map(bt => [bt.id, bt]));
        // One preview-map per block, same recursive shape one level down —
        // BlocksField reads previews[field.name][blockIndex][subFieldName].
        previews[f.name] = data[f.name].map(block => {
          const def = block && typeof block === 'object' ? byType[block.type] : null;
          return def ? buildPreviews(block, def.fields, filePath) : {};
        });
      }
    }
    return previews;
  }

  // "Find anything" search (see /api/search below) flattened into a single
  // field per top-level value — a `blocks` field needs its own case since
  // its value is an array of differently-shaped objects, not one flat
  // value. Emits one labelled row PER SUB-FIELD of every block, so a
  // client searching for text buried inside, say, a testimonial block's
  // "quote" still finds the page it's on — the generic Array.isArray
  // fallback below would instead flatten a whole block into one noisy,
  // unlabelled blob.
  function searchRowsForBlocks(f, data) {
    const blocks = Array.isArray(data[f.name]) ? data[f.name] : [];
    const byType = Object.fromEntries((f.blockTypes || []).map(bt => [bt.id, bt]));
    return blocks.flatMap((block, index) => {
      const def = block && typeof block === 'object' ? byType[block.type] : null;
      if (!def) return [];
      const sectionLabel = `Section ${index + 1} — ${def.label}`;
      return (def.fields || []).filter(sub => sub.type !== 'heading').map(sub => {
        const v = block[sub.name];
        let value = '';
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') value = String(v);
        else if (v && typeof v === 'object' && 'alt' in v) value = String(v.alt || '');
        return { name: `${f.name}[${index}].${sub.name}`, label: `${sectionLabel} — ${sub.label}`, hint: sub.hint || '', value };
      });
    });
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
        const preset   = imageSizePreset(imgType);
        const resize   = {
          width: preset.maxWidth || preset.w || (imgType === 'gallery' ? 1200 : 1920),
          withoutEnlargement: true,
        };
        if (preset.maxHeight || preset.h) resize.height = preset.maxHeight || preset.h;
        if (preset.fit) resize.fit = preset.fit;
        if (preset.position) resize.position = preset.position;
        const stamp    = Date.now();
        const outName  = stamp + '-' + sanitize(origName) + '.webp';
        const outPath  = path.join(UPLOADS, outName);
        try {
          await sharp(buffer)
            .resize(resize)
            .webp({ quality: 82 })
            .toFile(outPath);
          resolve({
            // Relative from src/content/<collection>/<slug>.md so the source
            // repo's zod image() helper resolves it natively.
            name:    outName,
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

  async function handlePageImageUpload(req, collection, requestedSlug) {
    return new Promise((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
      let buffer = null;
      let tooBig = false;
      let origName = 'page-image';
      let data = {};

      bb.on('field', (name, value) => {
        if (name !== 'data') return;
        try { data = JSON.parse(value); } catch (_) { data = {}; }
      });
      bb.on('file', (_name, file, info) => {
        origName = path.parse(info.filename || 'page-image').name;
        const chunks = [];
        file.on('data', chunk => chunks.push(chunk));
        file.on('limit', () => { tooBig = true; });
        file.on('close', () => { buffer = Buffer.concat(chunks); });
      });
      bb.on('close', async () => {
        if (tooBig) { reject(new Error('That image is over 25 MB. Please use a smaller photo.')); return; }
        if (!buffer) { reject(new Error('No file data')); return; }
        try {
          const targetSlug = richHtmlTargetSlug(collection, requestedSlug, data);
          if (!/^[a-z0-9][a-z0-9._-]*$/i.test(targetSlug)) throw new Error('Invalid page name.');
          const imageDir = path.join(CONTENT_ASSETS, collection, targetSlug, 'images');
          if (!isInside(CONTENT_ASSETS, imageDir)) throw new Error('Invalid asset location.');
          await fsp.mkdir(imageDir, { recursive: true });
          const baseName = `${Date.now()}-${sanitize(origName) || 'page-image'}`;
          let outName = `${baseName}.webp`;
          let suffix = 2;
          while (fs.existsSync(path.join(imageDir, outName))) outName = `${baseName}-${suffix++}.webp`;
          const outPath = path.join(imageDir, outName);
          await sharp(buffer)
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(outPath);
          const publicPath = `/content-assets/${collection}/${targetSlug}/images/${outName}`;
          resolve({
            name: outName,
            path: publicPath,
            preview: '/api/preview?p=' + encodeURIComponent(relFromRoot(outPath)),
          });
        } catch (error) {
          reject(new Error(error.message?.startsWith('Enter the page title') ? error.message : 'Could not read that image. Please use a JPG, PNG or WebP photo.'));
        }
      });
      req.pipe(bb);
    });
  }

  function listPageImages(collection, requestedSlug, data) {
    const targetSlug = richHtmlTargetSlug(collection, requestedSlug, data);
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(targetSlug)) throw new Error('Invalid page name.');
    const imageDir = path.join(CONTENT_ASSETS, collection, targetSlug, 'images');
    if (!isInside(CONTENT_ASSETS, imageDir) || !fs.existsSync(imageDir)) return [];
    return fs.readdirSync(imageDir)
      .filter(name => /\.(?:webp|jpe?g|png|gif|avif)$/i.test(name))
      .map(name => ({ name, mtime: fs.statSync(path.join(imageDir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .map(({ name }) => ({
        name,
        path: `/content-assets/${collection}/${targetSlug}/images/${name}`,
        preview: '/api/preview?p=' + encodeURIComponent(relFromRoot(path.join(imageDir, name))),
      }));
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204); res.end(); return;
    }

    try {

      if ((path_ === '/' || path_ === '/v2') && req.method === 'GET') {
        const wantsLegacy = path_ === '/' && (config.adminUi === 'legacy' || url.searchParams.get('legacy') === '1');
        const v2Index = path.join(ADMIN_DIST, 'index.html');
        if (!wantsLegacy && serveAdminAsset(res, v2Index)) return;
        warnLegacyRoute();
        serveAdminAsset(res, path.join(__dirname, 'admin.html'));
        return;
      }

      if (path_ === '/legacy' && req.method === 'GET') {
        warnLegacyRoute();
        serveAdminAsset(res, path.join(__dirname, 'admin.html'));
        return;
      }

      if (path_.startsWith('/admin-assets/') && req.method === 'GET') {
        const relative = decodeURIComponent(path_.slice('/admin-assets/'.length));
        const asset = path.resolve(ADMIN_DIST, relative);
        if (!isInside(ADMIN_DIST, asset)) { res.writeHead(403); res.end('Forbidden'); return; }
        if (!serveAdminAsset(res, asset, true)) { res.writeHead(404); res.end('Not found'); }
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
          dynamicCollections: Object.fromEntries(
            // orderField (drag-to-reorder) is suppressed when sortFields is
            // set - the automatic sort would fight a dragged position on
            // the very next read, so the client shouldn't offer dragging.
            Object.entries(DYNAMIC).map(([col, d]) => [col, { label: d.label, titleField: d.titleField, orderField: d.sortFields?.length ? undefined : d.orderField }])
          ),
          tasks:            config.tasks        || [],
          shortcodes:       config.shortcodes   || {},
          siteUrl:          config.siteUrl      || '',
          urlPatterns:      config.urlPatterns  || {},
          renamable:        config.renamable    || [],
          externalLinkSurfaces: config.externalLinkSurfaces || [],
          crossListable:    config.crossListable || {},
          menuSlots:        config.menuSlots     || {},
          imageSizes:       IMAGE_SIZES,
          startScreenIntro: config.startScreenIntro || 'Pick a page from the left, type in the search box to find any setting, or jump straight to a common task:',
          startScreenNote:  config.startScreenNote  || 'Fields are listed top-to-bottom in the same order they appear on the website.<br>Make your changes, click <strong>Save Draft</strong>, then <strong>Publish Changes</strong> when ready.',
          altPlaceholder:   config.altPlaceholder   || 'e.g. "Guests dining in the main dining room"',
          richHtmlImport:   Boolean(config.richHtmlImport),
        });
        return;
      }

      if (path_ === '/api/content' && req.method === 'GET') {
        const tree = {};
        for (const key of Object.keys(FIELDS)) {
          const [col, slug] = key.split('/');
          (tree[col] = tree[col] || []).push(slug);
        }
        // Dynamic collections have no static FIELDS entries — the files on
        // disk ARE the source of truth for which entries exist.
        for (const col of Object.keys(DYNAMIC)) {
          const dir = path.join(CONTENT, col);
          const slugs = fs.existsSync(dir)
            ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
            : [];
          tree[col] = sortDynamicSlugs(col, slugs);
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
        const searchKeys = Object.keys(FIELDS);
        for (const col of Object.keys(DYNAMIC)) {
          const dir = path.join(CONTENT, col);
          if (!fs.existsSync(dir)) continue;
          for (const f of fs.readdirSync(dir)) {
            if (f.endsWith('.md')) searchKeys.push(col + '/' + f.slice(0, -3));
          }
        }
        for (const key of searchKeys) {
          const [col, slug] = key.split('/');
          const fields = resolveFields(col, slug) || [];
          let data = {}, body = '';
          const fp = contentFile(col, slug);
          if (fs.existsSync(fp)) ({ data, content: body } = matter(fs.readFileSync(fp, 'utf-8')));
          index[key] = fields
            .filter(f => f.type !== 'heading')
            .flatMap(f => {
              if (f.type === 'blocks') return searchRowsForBlocks(f, data);
              const v = f.type === 'markdown' ? body : data[f.name];
              let value = '';
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') value = String(v);
              else if (Array.isArray(v)) value = v.map(x => (x && typeof x === 'object') ? Object.values(x).join(' ') : String(x)).join('\n');
              else if (v && typeof v === 'object') value = Object.values(v).filter(x => typeof x === 'string').join(' ');
              return [{ name: f.name, label: f.label, hint: f.hint || '', value }];
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
        if (!resolveFields(collection, slug)) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const rel = `src/content/${collection}/${slug}.md`;
        let out = '';
        try {
          // --follow: a renamed file's history predates the rename commit —
          // without it, a renamed page looks "born" the moment it was renamed.
          out = git(['log', '--follow', '--format=%H%x09%ct%x09%s', '-n', '30', '--', rel]);
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
        if (!resolveFields(collection, slug)) { jsonResp(res, 404, { error: 'Not found' }); return; }
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

      // ── Dynamic collections: new-entry form + create ─────────────────────
      // Checked ahead of the generic contentMatch routes below, since "new"
      // would otherwise be swallowed as an ordinary (nonexistent) slug.
      const newMatch = path_.match(/^\/api\/content\/([^/]+)\/new$/);
      if (newMatch && req.method === 'GET') {
        const [, collection] = newMatch;
        const dyn = DYNAMIC[collection];
        if (!dyn) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const fields = withSections(collection + '/_new', dyn.fields);
        jsonResp(res, 200, { key: collection + '/new', data: {}, body: '', fields, previews: {} });
        return;
      }

      if (newMatch && req.method === 'POST') {
        const [, collection] = newMatch;
        const dyn = DYNAMIC[collection];
        if (!dyn) { jsonResp(res, 400, { error: 'Not a dynamic collection' }); return; }
        const fields = dyn.fields;
        const { data, body } = await parseJsonBody(req);

        const byName  = Object.fromEntries(fields.map(f => [f.name, f]));
        const coerced = Object.fromEntries(
          Object.entries(data || {}).map(([k, v]) => [k, byName[k] ? coerceValue(byName[k], v) : v])
        );
        const merged = Object.fromEntries(
          Object.entries(coerced).filter(([, v]) => v !== null && v !== undefined && v !== '')
        );

        const errors = validateData(fields, merged);
        if (errors.length) { jsonResp(res, 400, { ok: false, error: errors.join(' ') }); return; }

        const titleVal = merged[dyn.titleField];
        if (!titleVal) {
          const titleLabel = byName[dyn.titleField]?.label || dyn.titleField;
          jsonResp(res, 400, { ok: false, error: `"${titleLabel}" is needed to create a new ${dyn.label}.` });
          return;
        }

        const dir = path.join(CONTENT, collection);
        fs.mkdirSync(dir, { recursive: true });
        const base = sanitize(String(titleVal)) || 'untitled';
        let slug = base, n = 2;
        while (fs.existsSync(path.join(dir, slug + '.md'))) { slug = `${base}-${n++}`; }

        fs.writeFileSync(path.join(dir, slug + '.md'), matter.stringify(body || '', ensureStableId(merged)), 'utf-8');
        jsonResp(res, 200, { ok: true, slug });
        return;
      }

      // ── Rename ────────────────────────────────────────────────────────
      // Renames a dynamic-collection entry (or a static page explicitly
      // listed in config.renamable) to a new slug: moves its .md file,
      // records a 301 redirect (chain-collapsed against any redirect that
      // already pointed here), and rewrites any hand-authored internal link
      // to the old URL found elsewhere in this content repo. Two-step
      // preview/commit so the warning dialog can show real counts instead
      // of generic copy — commit re-runs the same computation itself rather
      // than trusting the client's (possibly stale) preview response.
      function canRename(collection, slug) {
        if (DYNAMIC[collection]) return true;
        return (config.renamable || []).includes(collection + '/' + slug);
      }

      // Pure computation, no filesystem writes — shared by preview and
      // commit so they can never disagree about what would happen.
      function computeRename(collection, slug, newSlugRaw) {
        const newSlug = sanitize(String(newSlugRaw || ''));
        if (!newSlug) return { ok: false, error: 'Enter a valid URL slug.' };
        if (newSlug === slug) return { ok: false, error: "That is already this page's URL." };

        const oldFile = contentFile(collection, slug);
        const newFile = contentFile(collection, newSlug);
        if (!fs.existsSync(oldFile)) return { ok: false, error: 'Not found.' };

        const oldPath = resolveUrl(config, collection, slug);
        const newPath = resolveUrl(config, collection, newSlug);
        if (!oldPath || !newPath) return { ok: false, error: 'This page has no public URL to redirect from — check urlPatterns for this collection.' };

        const store = loadRedirects(CONTENT);
        let collision = null;
        if (fs.existsSync(newFile)) collision = 'filename';
        else if (Object.prototype.hasOwnProperty.call(store.redirects, newPath)) collision = 'redirect-source';

        return { ok: true, newSlug, oldFile, newFile, oldPath, newPath, store, collision };
      }

      const renamePreviewMatch = path_.match(/^\/api\/rename\/([^/]+)\/([^/]+)\/preview$/);
      if (renamePreviewMatch && req.method === 'POST') {
        const [, collection, slug] = renamePreviewMatch;
        if (!canRename(collection, slug)) { jsonResp(res, 400, { ok: false, error: 'This page cannot be renamed.' }); return; }
        const { newSlug: requested } = await parseJsonBody(req);
        const c = computeRename(collection, slug, requested);
        if (!c.ok) { jsonResp(res, 400, c); return; }
        jsonResp(res, 200, {
          ok: true,
          oldPath: c.oldPath,
          newPath: c.newPath,
          newSlug: c.newSlug,
          collision: c.collision,
          linksToFix: c.collision ? [] : findInternalLinks(CONTENT, c.oldPath),
          cascade: [], // populated by hub-ownership support in a later release
          externalLinkSurfaces: config.externalLinkSurfaces || [],
        });
        return;
      }

      const renameMatch = path_.match(/^\/api\/rename\/([^/]+)\/([^/]+)$/);
      if (renameMatch && req.method === 'POST') {
        const [, collection, slug] = renameMatch;
        if (!canRename(collection, slug)) { jsonResp(res, 400, { ok: false, error: 'This page cannot be renamed.' }); return; }
        const { newSlug: requested } = await parseJsonBody(req);
        const c = computeRename(collection, slug, requested);
        if (!c.ok) { jsonResp(res, 400, c); return; }
        if (c.collision) {
          jsonResp(res, 409, {
            ok: false,
            error: c.collision === 'filename'
              ? `A page already exists at "${c.newSlug}".`
              : `"${c.newPath}" is already used as a redirect target elsewhere. Choose a different URL.`,
          });
          return;
        }

        fs.renameSync(c.oldFile, c.newFile);
        recordRedirect(c.store, c.oldPath, c.newPath, { collection, slug: c.newSlug, reason: 'rename' });
        saveRedirects(CONTENT, c.store);
        const linksFixed = fixInternalLinks(CONTENT, c.oldPath, c.newPath);

        jsonResp(res, 200, {
          ok: true,
          slug: c.newSlug,
          redirect: { from: c.oldPath, to: c.newPath },
          linksFixed: linksFixed.reduce((sum, f) => sum + f.count, 0),
          cascaded: 0, // populated by hub-ownership support in a later release
        });
        return;
      }

      // ── Menus ─────────────────────────────────────────────────────────
      // Admin-authored, freely add/rename/delete-able named menus (header,
      // footer, etc.), stored as one JSON blob (menus.mjs) rather than
      // per-slug content files — items can link to an existing page (by
      // stable_id, so a later rename needs no rewrite here at all), an
      // arbitrary URL/anchor, or be a non-clickable heading for a one-level
      // dropdown group. See MENUS.md for the full consumption contract.
      function resolveMenuItem(item) {
        if (item.type !== 'page') return item;
        const resolved = item.stableId ? resolveStableId(item.stableId) : null;
        return { ...item, key: resolved ? `${resolved.collection}/${resolved.slug}` : null, livePath: resolved?.path || null, missing: !resolved };
      }
      function resolveMenu(menu) {
        return {
          ...menu,
          items: menu.items.map(item => item.type === 'heading'
            ? { ...item, children: (item.children || []).map(resolveMenuItem) }
            : resolveMenuItem(item)),
        };
      }

      if (path_ === '/api/menu-pages' && req.method === 'GET') {
        jsonResp(res, 200, { pages: allContentPages().filter(p => p.stableId).map(p => ({ key: p.key, title: p.title, stableId: p.stableId })) });
        return;
      }

      if (path_ === '/api/menus' && req.method === 'GET') {
        const store = loadMenus(CONTENT);
        jsonResp(res, 200, { menus: store.menus.map(resolveMenu), slotAssignments: store.slotAssignments });
        return;
      }

      if (path_ === '/api/menus' && req.method === 'POST') {
        const { name } = await parseJsonBody(req);
        if (!String(name || '').trim()) { jsonResp(res, 400, { ok: false, error: 'Enter a menu name.' }); return; }
        const store = loadMenus(CONTENT);
        const menu = { id: crypto.randomUUID(), name: String(name).trim(), items: [] };
        store.menus.push(menu);
        saveMenus(CONTENT, store);
        jsonResp(res, 200, { ok: true, menu });
        return;
      }

      const menuMatch = path_.match(/^\/api\/menus\/([^/]+)$/);
      if (menuMatch && req.method === 'POST') {
        const [, id] = menuMatch;
        const { name, items } = await parseJsonBody(req);
        const store = loadMenus(CONTENT);
        const menu = store.menus.find(m => m.id === id);
        if (!menu) { jsonResp(res, 404, { ok: false, error: 'Menu not found.' }); return; }
        if (name !== undefined) {
          if (!String(name).trim()) { jsonResp(res, 400, { ok: false, error: 'Enter a menu name.' }); return; }
          menu.name = String(name).trim();
        }
        if (items !== undefined) {
          if (!Array.isArray(items)) { jsonResp(res, 400, { ok: false, error: 'Invalid menu items.' }); return; }
          menu.items = items;
        }
        saveMenus(CONTENT, store);
        jsonResp(res, 200, { ok: true });
        return;
      }

      if (menuMatch && req.method === 'DELETE') {
        const [, id] = menuMatch;
        const store = loadMenus(CONTENT);
        const before = store.menus.length;
        store.menus = store.menus.filter(m => m.id !== id);
        if (store.menus.length === before) { jsonResp(res, 404, { ok: false, error: 'Menu not found.' }); return; }
        for (const slot of Object.keys(store.slotAssignments)) {
          if (store.slotAssignments[slot] === id) delete store.slotAssignments[slot];
        }
        saveMenus(CONTENT, store);
        jsonResp(res, 200, { ok: true });
        return;
      }

      const menuSlotMatch = path_.match(/^\/api\/menu-slots\/([^/]+)$/);
      if (menuSlotMatch && req.method === 'POST') {
        const [, slotKey] = menuSlotMatch;
        if (!(config.menuSlots || {})[slotKey]) { jsonResp(res, 400, { ok: false, error: 'Unknown menu slot.' }); return; }
        const { menuId } = await parseJsonBody(req);
        const store = loadMenus(CONTENT);
        if (menuId !== null && !store.menus.some(m => m.id === menuId)) { jsonResp(res, 400, { ok: false, error: 'Menu not found.' }); return; }
        if (menuId === null) delete store.slotAssignments[slotKey];
        else store.slotAssignments[slotKey] = menuId;
        saveMenus(CONTENT, store);
        jsonResp(res, 200, { ok: true });
        return;
      }

      const contentMatch = path_.match(/^\/api\/content\/([^/]+)\/(.+)$/);
      if (contentMatch && req.method === 'GET') {
        const [, collection, slug] = contentMatch;
        const fieldTemplate = resolveFields(collection, slug);
        if (!fieldTemplate) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const fp = contentFile(collection, slug);
        if (!fs.existsSync(fp)) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const { data, content: body } = matter(fs.readFileSync(fp, 'utf-8'));
        const fields   = withSections(collection + '/' + slug, fieldTemplate);
        const previews = buildPreviews(data, fields, fp);
        jsonResp(res, 200, { key: collection + '/' + slug, slug, data, body, fields, previews });
        return;
      }

      if (contentMatch && req.method === 'DELETE') {
        const [, collection, slug] = contentMatch;
        if (!DYNAMIC[collection]) { jsonResp(res, 400, { error: 'This page cannot be deleted.' }); return; }
        const fp = contentFile(collection, slug);
        if (!fs.existsSync(fp)) { jsonResp(res, 404, { error: 'Not found' }); return; }
        fs.unlinkSync(fp);
        // No extra git-staging step needed — the publish handler's
        // `git add src/content ...` already stages deletions within that
        // path, same as any other modification.
        jsonResp(res, 200, { ok: true });
        return;
      }

      if (contentMatch && req.method === 'POST') {
        const [, collection, slug] = contentMatch;
        const fields = resolveFields(collection, slug);
        if (!fields) { jsonResp(res, 404, { error: 'Not found' }); return; }
        const fp     = contentFile(collection, slug);
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

        fs.writeFileSync(fp, matter.stringify(body || '', ensureStableId(merged)), 'utf-8');
        jsonResp(res, 200, { ok: true });
        return;
      }

      // Persist a complete dynamic-collection order in one request. Validate
      // the entire list before writing so an incomplete request changes no
      // files and can never leave duplicate positions.
      const orderMatch = path_.match(/^\/api\/order\/([^/]+)$/);
      if (orderMatch && req.method === 'POST') {
        const collection = orderMatch[1];
        const dyn = DYNAMIC[collection];
        if (!dyn?.orderField) { jsonResp(res, 400, { error: 'This collection is not orderable.' }); return; }
        const { slugs } = await parseJsonBody(req);
        if (!Array.isArray(slugs) || new Set(slugs).size !== slugs.length || slugs.some(slug => typeof slug !== 'string' || !/^[a-z0-9._-]+$/i.test(slug))) {
          jsonResp(res, 400, { error: 'Invalid entry order.' }); return;
        }
        const dir = path.join(CONTENT, collection);
        const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.md')).map(name => name.slice(0, -3)).sort() : [];
        if ([...slugs].sort().join('\0') !== existing.join('\0')) { jsonResp(res, 400, { error: 'Entry order is incomplete.' }); return; }
        for (const [index, slug] of slugs.entries()) {
          const filename = contentFile(collection, slug);
          const parsed = matter(fs.readFileSync(filename, 'utf-8'));
          parsed.data[dyn.orderField] = index + 1;
          fs.writeFileSync(filename, matter.stringify(parsed.content, parsed.data), 'utf-8');
        }
        jsonResp(res, 200, { ok: true });
        return;
      }

      // Sidebar drag-to-reorder for a dynamic collection's orderField (see
      // DYNAMIC_COLLECTIONS[col].orderField). A deliberately narrow sibling
      // to the full content POST above: it touches ONLY the order field in
      // each entry's frontmatter, never `body` — the sidebar only has each
      // entry's order value (from /api/search), not its full body, so
      // reusing the full save endpoint would silently wipe every reordered
      // entry's content back to empty.
      const reorderMatch = path_.match(/^\/api\/reorder\/([^/]+)$/);
      if (reorderMatch && req.method === 'POST') {
        const [, collection] = reorderMatch;
        const dyn = DYNAMIC[collection];
        if (!dyn || !dyn.orderField) { jsonResp(res, 400, { error: 'This collection cannot be reordered.' }); return; }
        const { order } = await parseJsonBody(req);
        if (!Array.isArray(order)) { jsonResp(res, 400, { error: 'Invalid order payload.' }); return; }

        const updated = [];
        for (const entry of order) {
          const slug  = entry?.slug;
          const value = entry?.value;
          if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(slug) || !Number.isFinite(value)) continue;
          const fp = contentFile(collection, slug);
          if (!fs.existsSync(fp)) continue;
          const { data, content: body } = matter(fs.readFileSync(fp, 'utf-8'));
          data[dyn.orderField] = value;
          fs.writeFileSync(fp, matter.stringify(body, data), 'utf-8');
          updated.push(slug);
        }
        jsonResp(res, 200, { ok: true, updated });
        return;
      }

      if (path_ === '/api/upload/image' && req.method === 'POST') {
        try { jsonResp(res, 200, await handleImageUpload(req)); }
        catch (e) { jsonResp(res, 400, { error: e.message }); }
        return;
      }

      const pageImageUploadMatch = path_.match(/^\/api\/upload\/page-image\/([^/]+)\/(.+)$/);
      if (pageImageUploadMatch && req.method === 'POST') {
        if (!config.richHtmlImport) { jsonResp(res, 404, { error: 'Rich HTML importing is not enabled for this site.' }); return; }
        const [, collection, requestedSlug] = pageImageUploadMatch;
        if (!resolveFields(collection, requestedSlug === 'new' ? '_new' : requestedSlug)) { jsonResp(res, 404, { error: 'Page not found.' }); return; }
        try { jsonResp(res, 200, await handlePageImageUpload(req, collection, requestedSlug)); }
        catch (e) { jsonResp(res, 400, { error: e.message }); }
        return;
      }

      const pageImagesMatch = path_.match(/^\/api\/page-images\/([^/]+)\/(.+)$/);
      if (pageImagesMatch && req.method === 'POST') {
        if (!config.richHtmlImport) { jsonResp(res, 404, { error: 'Rich HTML importing is not enabled for this site.' }); return; }
        const [, collection, requestedSlug] = pageImagesMatch;
        if (!resolveFields(collection, requestedSlug === 'new' ? '_new' : requestedSlug)) { jsonResp(res, 404, { error: 'Page not found.' }); return; }
        try {
          const { data } = await parseJsonBody(req);
          jsonResp(res, 200, { files: listPageImages(collection, requestedSlug, data || {}) });
        } catch (e) { jsonResp(res, 400, { error: e.message }); }
        return;
      }

      if (path_ === '/api/upload/pdf' && req.method === 'POST') {
        try { jsonResp(res, 200, await handlePdfUpload(req)); }
        catch (e) { jsonResp(res, 400, { error: e.message }); }
        return;
      }

      const chatGptImportMatch = path_.match(/^\/api\/import\/chatgpt\/([^/]+)\/(.+)$/);
      if (chatGptImportMatch && req.method === 'POST') {
        if (!config.richHtmlImport) { jsonResp(res, 404, { error: 'Rich HTML importing is not enabled for this site.' }); return; }
        const [, collection, requestedSlug] = chatGptImportMatch;
        const fieldTemplate = resolveFields(collection, requestedSlug === 'new' ? '_new' : requestedSlug);
        if (!fieldTemplate) { jsonResp(res, 404, { error: 'Page not found.' }); return; }
        const { html, data } = await parseJsonBody(req);
        let targetSlug;
        try { targetSlug = richHtmlTargetSlug(collection, requestedSlug, data); }
        catch (e) { jsonResp(res, 400, { error: e.message }); return; }
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(targetSlug)) { jsonResp(res, 400, { error: 'Invalid page name.' }); return; }
        const outputDir = path.join(CONTENT_ASSETS, collection, targetSlug);
        if (!isInside(CONTENT_ASSETS, outputDir)) { jsonResp(res, 400, { error: 'Invalid asset location.' }); return; }
        const result = await sortChatGptHtml({
          source: String(html || ''),
          outputDir,
          publicBase: `/content-assets/${collection}/${targetSlug}`,
        });
        jsonResp(res, 200, { ...result, targetSlug });
        return;
      }

      // Every image already in uploads/, newest first — powers the "choose an
      // existing photo" picker so editors can reuse a photo that only exists
      // in the CMS without re-uploading it from their device.
      if (path_ === '/api/uploads' && req.method === 'GET') {
        const files = fs.readdirSync(UPLOADS)
          .filter(n => /\.(webp|jpe?g|png|gif|avif)$/i.test(n))
          .map(n => ({ n, m: fs.statSync(path.join(UPLOADS, n)).mtimeMs }))
          .sort((a, b) => b.m - a.m)
          .map(({ n }) => ({
            name:    n,
            path:    '../../assets/uploads/' + n,
            preview: '/api/preview?p=' + encodeURIComponent('src/assets/uploads/' + n),
          }));
        jsonResp(res, 200, { files });
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
        if ((!isInside(ASSETS, abs) && !isInside(DOCS, abs) && !isInside(CONTENT_ASSETS, abs)) || !isInside(ROOT, abs)) {
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
          const publishPaths = ['src/content', 'src/assets/uploads', 'public/documents'];
          if (config.richHtmlImport) publishPaths.push('public/content-assets');
          git(['add', ...publishPaths]);
          try { git(['diff', '--cached', '--quiet']); }
          catch (_) { git(['commit', '-m', msg]); }

          // Pull in anything another editor published since this copy was
          // last opened. Two editors is the NORMAL case, not an edge case.
          // Most of the time this merges cleanly (different pages changed);
          // only a real same-file conflict needs a human.
          try {
            // A content editor's just-saved page is authoritative when the
            // same page changed remotely. Git still merges every unrelated
            // remote update, while -X ours removes command-line conflict
            // resolution from the editor's publishing workflow.
            git(['pull', '--no-rebase', '--no-edit', '-X', 'ours']);
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
      try { git(['pull', '--no-rebase', '--no-edit', '-X', 'ours']); }
      catch (_) { /* non-fatal — the pull-before-push in /api/git/push still protects publishing */ }
    }

    backfillStableIds();
  });

  return server;
}
