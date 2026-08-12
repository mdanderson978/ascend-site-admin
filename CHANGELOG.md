# Changelog

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
