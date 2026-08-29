/**
 * Redirect store — src/content/.site-admin/redirects.json.
 *
 * Consumption contract: `redirects` is a flat { "/old-path": "/new-path" }
 * map, root-relative paths, no trailing slash, no query/hash. That map is
 * the ENTIRE contract a consuming site's build/worker needs — see
 * REDIRECTS.md. `meta` is engine-internal bookkeeping (chain-collapse
 * history, auditing) and can be ignored by consumers.
 *
 * Lives inside src/content, which every site's /api/git/push handler
 * already `git add`s — no publishPaths config change is needed, and it is
 * invisible to every collection's glob() loader (each is scoped to its own
 * subfolder, e.g. base: './src/content/pages', never a blanket
 * 'src/content/**').
 */
import fs from 'fs';
import path from 'path';

export function redirectsPath(contentDir) {
  return path.join(contentDir, '.site-admin', 'redirects.json');
}

export function loadRedirects(contentDir) {
  const fp = redirectsPath(contentDir);
  if (!fs.existsSync(fp)) return { version: 1, redirects: {}, meta: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    return { version: 1, redirects: parsed.redirects || {}, meta: parsed.meta || {} };
  } catch (_) {
    // Corrupt/hand-edited file — never let a bad redirects.json crash the
    // admin. Treat it as empty; the next successful write repairs it.
    return { version: 1, redirects: {}, meta: {} };
  }
}

export function saveRedirects(contentDir, store) {
  const fp = redirectsPath(contentDir);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

// Leading slash, no trailing slash (except root itself), no query/hash.
export function normalizePath(p) {
  if (!p) return '/';
  let out = String(p).split('?')[0].split('#')[0];
  if (!out.startsWith('/')) out = '/' + out;
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out || '/';
}

// The single '{slug}' template substitution, shared by the rename engine
// and (a later phase) the hub-owned effective-prefix resolver, so both
// always agree on what a collection's live URL actually is.
export function resolveUrl(config, collection, slug) {
  if (slug === 'home') return '/';
  const pattern = config.urlPatterns?.[collection];
  if (!pattern) return null;
  return normalizePath(pattern.replace('{slug}', slug));
}

// Records from -> to, collapsing chains: any existing record whose `to`
// equals the new `from` is rewritten to point directly at the new `to`
// (A->B, then B->C becomes A->C, not a dangling A->B). Any existing record
// whose `from` equals the new `to` is dropped — renaming back onto a slug
// that used to redirect away from here would otherwise leave a stale or
// self-referential entry.
export function recordRedirect(store, from, to, meta = {}) {
  from = normalizePath(from);
  to   = normalizePath(to);
  if (from === to) return store;

  const now = new Date().toISOString();
  for (const [existingFrom, existingTo] of Object.entries(store.redirects)) {
    if (existingTo === from) {
      store.redirects[existingFrom] = to;
      store.meta[existingFrom] = { ...(store.meta[existingFrom] || {}), ...meta, updatedAt: now };
    }
  }

  delete store.redirects[to];
  delete store.meta[to];

  store.redirects[from] = to;
  store.meta[from] = { ...meta, createdAt: store.meta[from]?.createdAt || now };
  return store;
}
