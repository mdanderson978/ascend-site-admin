# site-admin

**A simple local CMS that makes Astro websites comfortable for non-technical
editors—without adding a hosted CMS, database or public admin panel.**

Astro is brilliant at producing fast, secure static websites from structured
content. For a developer, editing that content in Git is straightforward. Open
a Markdown file, update its YAML frontmatter, add an image with the correct
relative path, commit the result and push it.

For most website owners, that is not an editing experience. It is a list of
ways to accidentally break their site.

`site-admin` places a friendly browser interface over an Astro content
repository. An editor opens a launcher, chooses a page by the same name they
see on the website, changes clearly labelled fields, uploads photos or PDFs,
and clicks **Publish Changes**. The engine handles the Markdown, frontmatter,
media processing and Git workflow underneath.

```text
Open Website Admin
        ↓
Choose “Home Page”, “Bookings” or “Contact Details”
        ↓
Edit labelled fields and upload media
        ↓
Save and publish
        ↓
Structured content is committed and pushed
        ↓
The static Astro site rebuilds
```

The client gets an experience closer to a traditional CMS. The website keeps
the speed, portability and simplicity of Astro.

## The problem it solves

An Astro content repository is an excellent source of truth, but GitHub is not
a comfortable CMS for many clients. Editing content directly can require them
to understand:

- which Markdown file controls which part of the website;
- YAML syntax, frontmatter and content-schema rules;
- relative image paths and structured `{ src, alt }` values;
- image sizing, format conversion and accessible alternative text;
- Git commits, pulls, pushes and merge conflicts;
- how to recover an earlier version when a mistake is published.

Those are reasonable developer concerns. They should not become prerequisites
for changing a phone number, replacing a brochure or reordering a photo
gallery.

`site-admin` translates the site's content model into task-oriented forms and
protects the underlying structure. It validates values before writing them,
converts uploaded images to WebP, keeps media paths correct, exposes Git-backed
version history, and publishes through the content repository.

## Why a local CMS?

The admin runs on the editor's computer and listens only on localhost. There
is no public `/admin` route to host, patch or defend, and no second content
database that can drift away from the website's source of truth.

This keeps the system deliberately small:

- no hosted CMS service or subscription;
- no public authentication system;
- no database or proprietary content API;
- no vendor lock-in—the content remains ordinary Markdown and media;
- Git repository permissions remain the publishing boundary;
- Git history provides an existing audit trail and recovery mechanism.

Local does not mean developers edit the interface separately for every site.
The engine is shared, public and versioned. Each private content repository
supplies only its own fields, navigation labels, task shortcuts and branding.

## Why it works so well with Astro

Astro already treats content as build input rather than mutable production
database state. That makes the CMS boundary unusually clean:

```text
Public, versioned engine
ascend-site-admin
        │
        │ exact Git dependency
        ▼
Private content repository
Markdown + uploads + admin.config.mjs
        │
        │ commit and push
        ▼
Astro build
        │
        ▼
Static website
```

The CMS edits the same files Astro consumes. There is no synchronization layer
between a remote CMS database and the codebase, no runtime content fetch, and
no loss of Astro's static output. Content schemas can remain the authoritative
contract while the admin presents those values in language the editor
understands.

## What editors can do

The generic engine supports the workflows commonly needed on brochure and
content-driven sites:

- edit text, numbers, lists and Markdown;
- upload images, convert them to WebP and write alt text;
- reorder galleries and manage per-photo descriptions;
- upload and replace PDFs;
- search field names and saved content across the site;
- navigate using a sidebar that mirrors the public website;
- add or delete entries in collections the site marks as client-manageable (e.g. a list of projects or events), without a developer commit;
- save drafts and publish through Git;
- inspect page history and restore an earlier version;
- safely prune media that is no longer referenced.

The exact pages and fields are defined by the consuming site. The engine does
not contain client content or site-specific navigation.

## Shared engine, site-specific configuration

Each content repository pins an immutable engine release and keeps a small
configuration layer:

```text
content-repo/
  package.json          "site-admin": "github:mdanderson978/ascend-site-admin#v1.2.1"
  scripts/
    admin.mjs           starts the shared engine
    admin.config.mjs    fields, sections, labels, navigation, tasks and branding
    verify-admin.mjs    checks this site's config against the installed engine
    run-admin.bat       installs approved updates and launches the CMS
```

A minimal wrapper looks like this:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAdmin } from 'site-admin';
import { config } from './admin.config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
startAdmin({ ...config, root });
```

The full configuration contract is documented at the top of `index.mjs`.

## Content-repository conventions

The engine assumes only the split-repository content layout:

- `src/content/<collection>/<slug>.md` for gray-matter Markdown content;
- `src/assets/uploads/` for images processed by the upload pipeline;
- `public/documents/` for PDFs;
- a Git `origin` that accepts non-interactive pull and push.

Publishing means committing the editable content and media, pulling compatible
remote changes, and pushing the result. The hosting platform can then rebuild
the Astro site using its normal deployment workflow.

## Verification and updates

The package exports `verifySite` from `site-admin/verify`. Consuming sites run
it in CI to prove that every configured page loads, the search index builds,
the browser script parses, and the local security boundaries remain intact.

Sites should pin exact tags for reproducibility. Compatible engine releases
can then be discovered automatically, installed, audited and accepted only
after that site's verification passes. A changed lockfile causes the local
launcher to install the approved version on the editor's next launch.

See [RELEASING.md](RELEASING.md) for the compatibility and release policy.

## Security model

The admin server binds to `127.0.0.1` and rejects cross-origin writes. It has
no application login because it is not a hosted service and must never be
exposed through a network proxy or changed to listen on a public interface.

Access to publishing remains controlled by the Git credentials on the editor's
machine. The public engine grants no access to private content repositories or
deployments.

Please report suspected vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).

## Project boundaries

This repository contains the reusable engine, browser interface, verifier and
engine tests. It intentionally contains no client names, content-repository
inventory, deployment credentials or site-specific configuration. Private
fleet operations belong outside the public engine.

Never edit engine files inside a site's `node_modules` or copy the server and
UI into individual content repositories. Sites configure the engine; they do
not fork it.

## Licence

Copyright 2026 Ascend Web Design. Licensed under the
[Apache License 2.0](LICENSE).
