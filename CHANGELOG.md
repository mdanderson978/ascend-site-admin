# Changelog

## 2.13.0 - 2026-09-03

A `date` field (2.12.0) accepts several delimiters and both ISO and
Australian day/month order, which means a mis-ordered or ambiguous
value could previously only be caught by the server's rejection after
Publish was clicked - nothing confirmed *how* fuzzy input was actually
understood while the editor was still typing it.

- Added a live preview line under any `date` field, shown the moment
  the current input parses successfully - e.g. typing `30/08/2026`
  immediately shows "Sunday, 30 August 2026" beneath the box. Weekday
  + long month name + year is deliberately unambiguous regardless of
  which order the raw input used.
- New `formatFriendlyDate()` in `ui/src/lib/content.ts`, alongside
  `parseFuzzyDate()`. Both avoid ever constructing a `Date` from an ISO
  *string* (only from already-parsed y/m/d integers via the local
  constructor), so this can't reintroduce the timezone-shift class of
  bug `index.mjs`'s `toDateAwareString()` already guards against.

## 2.12.0 - 2026-09-03

Added a `date` field type. Previously a date was just a plain `string`
field with a hint telling the editor to type `YYYY-MM-DD` exactly -
easy to get subtly wrong (a different delimiter, day/month swapped),
and any collection using `sortFields` on that field sorts by plain
string comparison, so a mis-typed date doesn't just look wrong, it
silently sorts into the wrong place with no visible error.

- `type: 'date'` accepts flexible human input: `-`, `/`, `.` or a space
  as the delimiter, in either ISO (`YYYY-MM-DD`) or Australian
  (`DD-MM-YYYY`) order, identified by which group is the 4-digit year.
- Always normalized server-side to canonical `YYYY-MM-DD` before it's
  written, regardless of how the editor typed it in - `30/08/2026`,
  `30-08-2026` and `30.08.2026` all save identically.
- A 2-digit year, or input with no 4-digit year group at either end
  (e.g. US-style `08-30-2026`), is rejected with a friendly error
  rather than guessed at - a wrong guess would silently misfile an
  entry under the wrong sort position.
- Client-side validation gives the same early feedback before save,
  mirroring the existing `number` field's pattern.

## 2.11.1 - 2026-09-02

`/api/content` and `/api/search` both parsed a FIELDS key by splitting it on
every `/` and destructuring straight into `[col, slug]`, keeping only the
first segment after the collection. That's exact for a flat key
(`boardMembers/john-clark`), but a nested static page key's slug is itself
allowed to contain `/` (`pages/about/index`, or two directories deep like
`pages/awards/hall-of-fame/criteria`) - every nested key sharing that first
segment collapsed onto the same truncated slug, which the sidebar's
orphan-detection then duplicated once per colliding key (generically
mislabeled, since the truncated slug doesn't match any real `pageLabels`
entry), and 404s when opened, reaching for a file that was never at that
truncated path. Found on the Australian Masters Athletics site
(2026-09-02), which uses this nested key convention throughout - every
site whose `admin.config.mjs` keys any static page more than one directory
deep hit this the moment that page count grew past a handful, since the
generic "Other" bucket duplicate count scales with however many sibling
files share the truncated first segment.

- Both endpoints now split on the *first* `/` only (`key.indexOf('/')` +
  `slice`), preserving the full remainder as the slug - matching what
  `resolveFields()` and `contentFile()` already expected.
- Added a regression test covering both a two-deep and a three-deep nested
  key in one fixture; confirmed it fails against the old code (collapsing
  to the exact duplicate/truncated pattern observed live) and passes
  against the fix.

The React app's own topbar (App.tsx) had the identical `key.split('/')`
mistake computing `collection`/`slug` for the current entry, found while
wiring up `siteUrl`/`urlPatterns` (the "View live page" button) for the
first time on a site with nested static keys - the button would have
linked one level too deep, or 404d, for any such page. Fixing it surfaced
a second, previously-latent bug in the same computation: `liveUrl` ran
`encodeURIComponent()` on the whole multi-segment slug at once, which also
escapes `/` (into `%2F`), mangling a nested slug's own path separators
into one bogus segment - invisible before now only because the truncation
bug meant a multi-segment slug never actually reached that line.

- Extracted the key-splitting and live-URL-building logic out of App.tsx
  into two small, independently tested pure functions in `lib/content.ts`
  (`splitKey`, `liveUrlFor`) rather than leaving it inline and untested a
  second time. `liveUrlFor` now encodes each path segment individually and
  rejoins with `/`, instead of encoding the slug as one unit.
- 12 new unit tests for the two functions, covering the nested-nothing,
  nested-one-level, nested-two-levels, bare-"index", "home", and
  special-character-within-a-segment cases. Full suite: 22 server tests +
  59 UI tests passing, typecheck clean.

## 2.11.0 - 2026-09-02

A plain `select` field always got a hardcoded `— Choose —` placeholder
prepended, even for a field where "nothing selected" is itself a real,
meaningful choice (e.g. a hero-image style field where unset means
"show the plain regular photo," not "unanswered question") - forcing
that field's own answer for the empty state into a second, redundant
option instead.

- `select` fields (not `allowCustom`) now skip the generic placeholder
  when the field's own `options` already includes an entry with
  `value: ''` - so a field can supply its own label (e.g. `{ value: '',
  label: 'Regular Image' }`) as the real first, pre-selected choice
  instead of getting `— Choose —` above it. A field that doesn't
  define its own empty option keeps the exact previous behavior.

## 2.10.0 - 2026-09-01

The "Paste ChatGPT HTML" importer already rehosts embedded base64
*images* as real files (`DATA_IMAGE_PATTERN`). Nothing stopped it
accepting any other embedded file the same way ChatGPT sometimes
produces one when it has no access to a site's real uploads: a PDF (or
similar) either as a non-image `data:` URI, or (seen in the wild)
the whole file base64-encoded into a `<script>`, decoded with
`atob()` and handed out via `Blob()`/`createObjectURL()` at runtime.
Both work for visitors, but ship the file as unreplaceable dead
weight with no real URL, easy to miss because the page still renders
looking correct, and a second copy waiting to drift from a real
upload of the same file added later.

- `sortChatGptHtml()` now rejects the paste outright in both cases,
  with a message pointing the editor at the page's own PDF/file
  upload field instead. Detection: a non-image `data:...;base64,`
  URI anywhere in the extracted markup/CSS/scripts, or `atob(`
  together with `new Blob(`/`createObjectURL(` in the same script
  (both signals required, so ordinary clipboard/decode code that
  uses only one doesn't false-positive).

## 2.8.0 - 2026-08-30

Deprecates the legacy (1.x, `admin.html`) interface. It keeps working
exactly as before — `adminUi: 'legacy'` and `/legacy` are unchanged
functionally — but this is the start of retiring it now that V2 has
covered every legacy feature plus page rename and Menu Manager.

- Boot-time `console.warn` when `config.adminUi === 'legacy'` is set, and
  a second one (deduped) the first time `/legacy` or `?legacy=1` is
  actually visited.
- A static warning banner at the top of the legacy interface itself,
  pointing at `/v2`.
- Removed the "Open legacy admin" link from V2's own sidebar — `/legacy`
  still works for anyone who navigates there directly, or a developer
  doing an actual rollback, it's just no longer a discoverable option
  inside the interface you're supposed to be migrating away from.
- Reconciled `RELEASING.md`'s rollback section with `index.mjs`'s own
  contract comment (the two had drifted: one mentioned `/legacy` staying
  available, the other only mentioned `/v2`) and added the deprecation
  timeline: removal target is a future major version, once no known site
  in the fleet still sets `adminUi: 'legacy'`.

## 2.7.0 - 2026-08-30

The Rename control shipped in 2.6.0 was a topbar icon button — invisible
on mobile entirely (global.css already hid every topbar icon-button below
a width breakpoint), and there was nowhere in the admin that showed
whether a page would render nested under a hub's URL prefix or flat at
the top level. Separately, a site's main nav was either a hardcoded array
in the source repo or, since this session's earlier per-page-flag work,
a single flat menu — no way for a client to run more than one named menu,
link to an external URL or anchor, or build a dropdown group.

- Move Rename into a new identity card rendered above every other section
  of the entry form (including Schema) — reachable on every viewport now,
  not just desktop. The same card shows a plain-English sentence for
  where this entry actually lives ("Top-level page" vs "Nested under
  `<hub>`"), computed from `config.urlPatterns`, and — when the new
  optional `config.crossListable` names a per-collection boolean field —
  whether this entry is also cross-listed on another collection's hub
  grid (e.g. a flagship page also shown on a Services grid).
- Add a Menus screen: create, rename, and delete any number of named
  menus, each holding an ordered list of items that are a link to an
  existing page (by `stable_id`, so a later rename needs no rewrite —
  see `MENUS.md`), an arbitrary URL/anchor, or a non-clickable heading
  with one level of dropdown children. A new optional
  `config.menuSlots` lets a developer declare permanent slot IDs a
  template renders, so the admin can freely reassign which menu fills a
  slot without ever touching template code.
- New `GET /api/menu-pages` endpoint backs the "link to a page" picker —
  `stable_id` wasn't exposed anywhere else client-side (`GET /api/search`
  only ever includes `FIELDS`-declared fields).
- Strengthened the rename dialog's redirect/SEO messaging into a
  highlighted callout on both steps, instead of one easy-to-miss sentence.
- This coexists with, rather than replaces, the simpler per-page
  `in_main_nav`/`nav_label`/`nav_order` flag pattern for sites that only
  need one flat top-level menu — see `MENUS.md`'s "Coexisting" section.

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
