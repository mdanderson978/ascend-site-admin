# Changelog

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
