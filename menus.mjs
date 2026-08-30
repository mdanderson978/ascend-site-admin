/**
 * Menu store — src/content/.site-admin/menus.json.
 *
 * One JSON blob is the whole store, same pattern as redirects.mjs's
 * redirects.json: no per-item files, invisible to every collection's
 * glob() loader (scoped to its own subfolder, never a blanket
 * 'src/content/**'), and already inside the /api/git/push handler's
 * blanket `git add src/content ...` — no publishPaths config change
 * needed. See MENUS.md for the consumption contract a site's own build
 * reads at render time.
 *
 * Page-type items store a content stable_id, never a slug/path — a rename
 * changes a page's slug/filename but never its stable_id, so there is
 * nothing in this file that ever goes stale and nothing to rewrite when a
 * page is renamed. Resolution (stable_id -> current live path) happens
 * live, at read time, in index.mjs's GET /api/menus for the admin UI, and
 * separately in the consuming site's own build for the live nav.
 */
import fs from 'fs';
import path from 'path';

export function menusPath(contentDir) {
  return path.join(contentDir, '.site-admin', 'menus.json');
}

export function loadMenus(contentDir) {
  const fp = menusPath(contentDir);
  if (!fs.existsSync(fp)) return { version: 1, menus: [], slotAssignments: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    return { version: 1, menus: Array.isArray(parsed.menus) ? parsed.menus : [], slotAssignments: parsed.slotAssignments || {} };
  } catch (_) {
    // Corrupt/hand-edited file — never let a bad menus.json crash the
    // admin. Treat it as empty; the next successful write repairs it.
    return { version: 1, menus: [], slotAssignments: {} };
  }
}

export function saveMenus(contentDir, store) {
  const fp = menusPath(contentDir);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}
