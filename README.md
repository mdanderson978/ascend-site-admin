# site-admin (ascend-site-admin)

The generic local CMS admin engine for Ascend Web Design's split-repo Astro
sites. This repo is the **single canonical copy** of the engine — per-site
content repos consume it as a git dependency pinned to a version tag and never
carry their own copy of the server or UI.

```
content-repo/
  package.json          "site-admin": "github:mdanderson978/ascend-site-admin#v1.1.0"
  scripts/
    admin.mjs           import { startAdmin } from 'site-admin';
                        import { config } from './admin.config.mjs';
                        startAdmin(config);
    admin.config.mjs    ALL site-specific values: fields, sections, pageLabels,
                        navStructure, tasks, siteTitle, developer contact
    run-admin.bat       unchanged — the deps-stamp check auto-installs engine
                        updates on the client's next launch
```

The full config contract is documented at the top of `index.mjs`. A worked
example lives in the `new-astro-split-cms` skill at
`references/admin.config.mjs`.

## What the engine assumes about a content repo

Only the standard layout conventions:

- `src/content/<collection>/<slug>.md` — gray-matter markdown content
- `src/assets/uploads/` — WebP images written by the upload pipeline
- `public/documents/` — PDFs
- the repo is a git clone whose `origin` accepts non-interactive push
  (publishing = commit → pull --no-rebase → push)

## Installation access

This repository is designed for public distribution, so consuming machines
can install the pinned Git dependency anonymously once its visibility is
public. Editors then only need access to their own private content repository;
they never need access to or make changes in this engine repo.

## Security model

The admin server listens on `127.0.0.1` only and rejects cross-origin writes.
It has no user authentication and must not be exposed through a network proxy
or changed to listen on a public interface. Repository and deployment access
remain protected by the Git credentials on the editor's machine.

## Releasing a new engine version

1. Make changes here; test against a real site by temporarily pointing its
   dependency at a branch or commit sha.
2. Commit, then tag: `git tag vX.Y.Z && git push origin main --tags`.
3. In each site's content repo: bump the tag in `package.json`, run
   `npm install`, verify the admin boots, commit `package.json` +
   `package-lock.json`, push.
4. Each client machine picks the update up automatically on its next launch:
   the launcher pulls, sees `package-lock.json` differs from
   `node_modules\.deps-stamp`, and runs `npm install` non-interactively.

Never edit engine code inside a site's `node_modules` or re-copy engine files
into a content repo — that recreates the divergence problem this package
exists to fix.

## License

Copyright 2026 Ascend Web Design. Licensed under the
[Apache License 2.0](LICENSE).
