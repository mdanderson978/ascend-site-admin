# Menu data contract

The admin's Menus screen exists only on a site that declares at least one
`menuSlots` entry in `admin.config.mjs` — a site with none never shows
"Manage menus" at all, since it means the templates were never wired up to
render anything from this system. Where it does exist, exactly one menu is
auto-provisioned per declared slot the first time it's needed (named after
the slot's own `label`) — the client can rename that menu and edit its
items, but can never create an extra unassigned menu, delete a slot's only
menu, or reassign a different menu into a slot. Every slot always has
exactly one real menu; there is nothing else to assign. Stored in the
content repo alongside the content itself:

```
src/content/.site-admin/menus.json
```

```json
{
  "version": 1,
  "menus": [
    {
      "id": "a1b2c3d4-...",
      "name": "Main Menu",
      "items": [
        { "id": "i1", "type": "page", "stableId": "<content stable_id>", "label": "Pool Tiling" },
        { "id": "i2", "type": "link", "url": "https://facebook.com/...", "label": "Facebook", "newTab": true },
        { "id": "i3", "type": "heading", "label": "Services", "children": [
          { "id": "i4", "type": "page", "stableId": "<content stable_id>", "label": "Pool Resurfacing" }
        ] }
      ]
    }
  ],
  "slotAssignments": { "header_primary": "a1b2c3d4-..." }
}
```

## What a consuming site needs to know

Three item types, and `heading` allows exactly one level of `children`
(a dropdown group) — nothing deeper:

- `page` — a link to a page in this content repo, identified by **`stableId`,
  never a slug or path**. Resolve it at build time by matching
  `stableId` against a content entry's own `stable_id` frontmatter field
  (every entry has had one since engine `v2.6.0`), then compute that
  entry's live URL the normal way (the same `urlPatterns` substitution
  the admin itself uses). If no entry matches, the page no longer exists —
  skip the item or fall back to `label` with no link, your call.
- `link` — a plain URL in `url`: an absolute external address, a
  root-relative internal path, an in-page anchor (`#quote`), or a path
  with a hash (`/contact#quote`). Render it verbatim. `newTab: true` means
  open it in a new tab/window.
- `heading` — not a link. Renders as a non-clickable label with `children`
  (only `page` and `link` items, never a nested `heading`) as its dropdown.

`slotAssignments` maps a **developer-declared slot key** (see `menuSlots`
in `admin.config.mjs` — its `label` becomes both the admin's display name
for the slot and that slot's auto-provisioned menu's initial name) to the
id of the one menu filling it. Slot keys are permanent; the menu assigned
to one can be freely renamed and have its items edited, without the
developer's template code ever needing to change — but the assignment
itself never changes after that menu is first auto-provisioned, since
there is no second menu it could ever be swapped for. A slot with no
entry in `slotAssignments` (only possible from hand-edited data, since the
admin no longer offers any way to remove one) means render nothing for
that slot until the admin is next opened, which re-provisions it.

## Why `stableId`, not a slug or resolved path

A page's slug can change any time via the admin's rename feature
(`REDIRECTS.md`). `menus.json` never stores a resolved path anywhere, so
**a rename never goes stale here and never needs a rewrite step** — unlike
markdown body links, which `linkFixer.mjs` rewrites at rename time, this
file has nothing that could go stale, because nothing here is ever a
snapshot. Resolution always happens live, at read time, both in the admin
UI (`GET /api/menus` resolves every `page` item's `stableId` to a live path
and a `missing` flag on every request) and in your own site's build.

## What this package does NOT do

This file lives inside `src/content`, covered by the same blanket
`git add` every site's `/api/git/push` handler already runs — no
`publishPaths` configuration or site-specific setup is needed to have it
committed and pushed as part of a normal Publish.

**Reading it and actually rendering a menu somewhere on the site is
separate, per-site follow-up work.** This package has no opinion on and no
access to your templates. A typical integration:

1. In the site's build, read `src/content/.site-admin/menus.json` from the
   pulled/rsynced content.
2. Look up which menu is assigned to the slot your template needs
   (`slotAssignments[slotKey]`), find that menu in `menus`.
3. For each `page` item, resolve `stableId` to a live path via
   `getCollection()`/equivalent, matching on `stable_id` — the same shape
   `lpr-astro/src/lib/nav.ts` already uses for slug-based nav lookups.
4. Render `link` items' `url` verbatim, and `heading` items as a
   non-clickable label with their `children` as a dropdown.

## Coexisting with a simpler per-page nav flag

Not every site needs full Menu Manager. A single flat top-level nav with
no dropdowns, no external links, and only one menu location is simpler to
maintain as a handful of per-page fields (`in_main_nav` / `nav_label` /
`nav_order`, read by a small `getCollection('pages')` filter+sort at build
time — see the `new-astro-split-cms` skill's nav.ts template, and
`lpr-astro/src/lib/nav.ts` for a real example). Both mechanisms are
supported and independent; adopt Menu Manager only once a site actually
needs multiple menus, non-page links, or dropdown groups. Migrating an
existing site from the per-page-flag pattern to Menu Manager is optional,
manual, per-site work — bumping the engine version does not do it for you.
