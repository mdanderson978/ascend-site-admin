# Redirect data contract

Renaming a page from the admin (`POST /api/rename/...`) records a 301
redirect in the content repo, alongside the content itself:

```
src/content/.site-admin/redirects.json
```

```json
{
  "version": 1,
  "redirects": {
    "/old-path": "/new-path"
  },
  "meta": {
    "/old-path": { "createdAt": "2026-08-29T03:00:00.000Z", "collection": "pages", "slug": "new-path", "reason": "rename" }
  }
}
```

## What a consuming site needs to know

`redirects` is the entire contract. It is a flat map of root-relative paths,
no trailing slash, no query string or hash:

```
{ "/old-path": "/new-path", ... }
```

Every entry is a real, resolvable redirect at the time it's written — chains
are collapsed automatically (renaming a page twice never leaves a dangling
intermediate hop), and a page renamed back onto a formerly-redirected slug
never leaves a stale or self-referential entry. Nothing else in the file
needs interpreting to serve the redirects correctly.

`meta` is engine-internal bookkeeping (chain-collapse history, auditing).
Consumers can ignore it entirely.

## What this package does NOT do

This file lives inside `src/content`, which every site's `/api/git/push`
handler already commits and pushes as part of a normal Publish — writing it
requires no `publishPaths` configuration and no site-specific setup.

**Reading it and actually serving the redirects is separate, per-site
follow-up work.** This package has no opinion on and no access to how a
given site serves HTTP redirects — a Cloudflare Worker's own routing code, a
Netlify `_redirects` file, an Nginx config, or anything else. Upgrading the
engine version does not wire this up for you on any site. A typical
integration:

1. In the site's build (or a step before deploy), read
   `src/content/.site-admin/redirects.json` from the pulled/rsynced content.
2. Merge its `redirects` map into whatever redirect mechanism the site
   already uses, deciding how to handle a conflict with an existing
   hand-maintained entry (a common choice: the hand-maintained entry wins,
   since a developer's explicit entry is presumably deliberate).
3. Deploy as normal.

See the Local Pool Renovations site (`lpr-astro` + `lpr-astro-content`) for
a concrete example: `lpr-astro/scripts/apply-redirects.mjs` reads this file
during `npm run prebuild` and regenerates `src/worker/generated-redirects.ts`,
which the site's Cloudflare Worker merges into its own redirect map
(hand-authored entries win on conflict).
