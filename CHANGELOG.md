# Changelog

## 2.6.0 - 2026-08-29

Renaming a page's slug/URL after creation was previously impossible — the
slug was derived from the Title once, at creation, was never shown anywhere
in the admin UI, and there was no concept of a redirect anywhere in the
engine. Found while renaming a page by hand on a live site and discovering
the CMS itself couldn't do it.

- Add a Rename action (topbar, next to History/Delete) for every dynamic-
  collection entry, plus any static page listed in the new
  `config.renamable`. Shows a two-step dialog: edit the URL with a live
  sanitize preview, then confirm — the confirm step shows the real old→new
  path, blocks on a genuine collision (existing filename or an existing
  redirect already targeting that path), reports how many other pages will
  have their internal links auto-updated, and lists
  `config.externalLinkSurfaces` (nav/footer/breadcrumbs — things living in a
  separate source repo the engine has no reach into) so the editor knows
  what still needs a developer's manual follow-up.
- A rename records a 301 in `src/content/.site-admin/redirects.json`
  (already inside the existing Publish path — see `REDIRECTS.md` for the
  consumption contract every consuming site's build/worker can read
  against), collapsing chains automatically (rename A→B then B→C leaves a
  direct A→C, never a dangling A→B) and rewrites hand-authored internal
  links to the old URL found elsewhere in the content repo.
- `GET /api/history/:collection/:slug` now uses `git log --follow`, so a
  renamed page's history no longer looks like it was "born" at the rename
  commit.
- Every content file now gets a permanent `stable_id` (a one-time backfill
  on first boot after upgrading, and on every create/update from then on) —
  a page's filename was its only identity before this; renaming needs
  something that survives the filename changing. Purely additive
  frontmatter, safe for every site without any content-schema change.
- `GET /api/content/:collection/:slug` now includes `slug` in its response.

## 2.5.1 - 2026-08-22

- Fix `sortChatGptHtml()` throwing (and failing the whole save) if one of
  the old `page-<hash>.css/js` or `image-<hash>.webp` files it clears before
  writing new ones is briefly held by something else — antivirus scanning
  it, Explorer generating a thumbnail, a sync client. Each removal now gets
  a few short retries (real locks like this clear within milliseconds) and
  falls back to skipping that one file with a log message rather than
  crashing the save, the same tradeoff `pruneOrphanUploads()` already makes
  elsewhere in this engine.

## 2.5.0 - 2026-08-17

- Add `allowCustom: true` to the `select` field type: renders a text
  input with a `<datalist>` of `field.options` instead of a strict
  `<select>`, so the editor can pick a suggested value or type a new
  one — for fields whose vocabulary should stay open-ended (e.g. a
  project category site owners will keep adding to) rather than fixed
  by whoever wrote `admin.config.mjs`. `select` without `allowCustom`
  keeps the exhaustive-dropdown behaviour from 2.4.0 unchanged.

## 2.4.0 - 2026-08-17

- Add a `select` field type: a fixed-choice dropdown (`field.options: {
  value, label }[]`) for frontmatter fields that should be a small
  controlled vocabulary — e.g. a project's category — instead of free
  text, where a typo would either fail schema validation on publish or
  silently create a new, uncategorised bucket. Required-field validation
  applies the same as every other field type.

## 2.3.0 - 2026-08-12

Closes the remaining gaps between the React admin (introduced in 2.0.0) and
the legacy single-file interface it replaced, found by direct comparison
against `admin.html` after a client reported drag-and-drop working "before."

- Add drag-and-drop to the markdown editor's page-content text box —
  dropping a photo onto it while writing uploads it and opens the same
  required-alt-text panel the toolbar's Photo button uses, instead of
  requiring the toolbar every time.
- Add drag-and-drop to multi-image ("gallery") fields' "+ Add photo" zone,
  including multiple files in one drop, alongside the existing drag-to-
  reorder for photos already added.
- Replace the publish-failure toast, which showed the same detail as the
  legacy banner but auto-dismissed after 8 seconds, with a persistent
  banner that stays until the editor dismisses it — a failed publish can
  mean the live site did not update, so its detail is no longer easy to
  miss.

## 2.2.0 - 2026-08-12

- Add drag-and-drop upload to single-image fields (Hero Image, Hub Card
  Image, etc.) — dropping a photo onto the field uploads it directly,
  matching the ChatGPT HTML image workflow's existing drop zone.
- Fix a single-image field showing the wrong photo after a fresh pick or
  drop: the preview preferred the server's once-computed, never-refreshed
  `preview` snapshot over the field's own current value, so the old photo
  kept reappearing no matter what was newly selected. The field's live
  value now takes priority, matching the pattern the multi-image field
  already used.

## 2.1.1 - 2026-08-04

- Publishing now resolves concurrent edits to the same content file in favour of the editor's saved local page while retaining unrelated remote updates.
- Startup pulls use the same deterministic content-editor policy instead of leaving a checkout in an unresolved merge state.

## 2.1.0 - 2026-08-04

- Add a page-specific drag-and-drop image library to the ChatGPT HTML workflow.
- Process uploaded JPG, PNG and WebP files into WebP and show their final public
  paths with individual and bulk copy actions for ChatGPT.
- Preserve uploaded page images when a later HTML import replaces generated
  page CSS, JavaScript and embedded-image assets.

## 2.0.1 - 2026-08-04

- Preserve pasted inline style attributes directly so their browser cascade
  semantics remain exact, including normal and `!important` declarations.

## 2.0.0 - 2026-08-04

- Replace the default single-file interface with a responsive React and
  TypeScript application while retaining `/legacy` as a rollback path.
- Add “Paste ChatGPT HTML”, which separates complete generated documents into
  editable page content, page-scoped CSS and JavaScript, and compressed WebP
  assets instead of leaving base64 images in Markdown.
- Preserve the v1.10 dynamic collection ordering contract in both interfaces.
- Add browser workflow coverage and a production content migration utility.

## 1.10.0 - 2026-08-03

- Add click-and-drag ordering for dynamic collection sidebar entries when the
  consuming site configures an `orderField`.
- Save reordered values through a narrow endpoint that preserves page body and
  unrelated frontmatter, then prompt the editor to publish the changes.
- Reject traversal-style slugs in reorder requests.
