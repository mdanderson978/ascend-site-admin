# Changelog

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
