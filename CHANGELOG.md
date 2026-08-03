# Changelog

## 1.10.0 - 2026-08-03

- Add click-and-drag ordering for dynamic collection sidebar entries when the
  consuming site configures an `orderField`.
- Save reordered values through a narrow endpoint that preserves page body and
  unrelated frontmatter, then prompt the editor to publish the changes.
- Reject traversal-style slugs in reorder requests.
