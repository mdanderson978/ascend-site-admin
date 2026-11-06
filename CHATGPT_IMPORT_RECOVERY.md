# ChatGPT Import Hardening and Recovery

This document records the reliability work added to the ChatGPT HTML copy/paste workflow. It is intended as the starting point for future agents changing the importer.

## Objective

A non-developer editor may use the ChatGPT copy/paste workflow heavily. A successful import must be unlikely to cause a later site-build failure, and a bad result must be recoverable without Git or filesystem knowledge.

## Import validation and atomic writes

The main implementation is in `rich-html.mjs`.

- Parses the supplied document and separates body HTML, CSS, browser JavaScript, structured data, and embedded images.
- Preserves JSON-LD and skips non-browser script types.
- Converts embedded images to WebP before changing existing assets.
- Syntax-checks the combined browser JavaScript before changing existing assets.
- Normalizes the configured site's absolute URLs to root-relative URLs.
- Repairs unambiguous timestamp-prefixed uploaded image names.
- Converts `images/...` and `./images/...` HTML references to the page's content-assets path.
- Rejects ambiguous relative file references.
- Rejects `/_astro/...` URLs because they are build-generated and unstable.
- Verifies referenced local images, documents, scripts, styles, fonts, and media exist.
- Treats missing local files as blocking validation errors rather than warnings.
- Builds the next complete asset directory in staging and swaps it into place. Staging lives beside the recovery store inside Git's private metadata, never at the repository root. A failed conversion, validation, write, or swap leaves the previous directory intact.
- Retries Windows directory renames with bounded backoff when previews, antivirus, or Explorer briefly hold a file open. A persistent lock keeps the old directory in place and produces an editor-facing "file is in use" message.

The endpoint in `index.mjs` passes the site's public directory and canonical site URL into this validation and returns importer failures as actionable 400 responses.

## Exact-paste preservation

Every import attempt is archived before processing. The original text is gzip-compressed without normalization, so it can be returned exactly as supplied.

Records live under Git's private metadata directory:

```text
<git-dir>/ascend-site-admin/chatgpt-imports/<collection>/<slug>/records/<id>/
```

They are deliberately outside the working tree:

- They cannot be published with the website.
- They do not appear as untracked content-repository files.
- They survive browser and admin-server restarts for the lifetime of the clone.
- They are clone-local and are not pushed to GitHub.

Each record contains metadata, `original.html.gz`, and the body that existed immediately before the import. The active record also contains a snapshot of the previous page asset directory.

The newest five records per page are retained. Only the active import keeps a potentially large asset snapshot; older records retain the original paste and metadata but drop their asset snapshots. Failed pastes are retained for diagnosis.

## One-click undo

After a successful import, the Markdown toolbar exposes:

- **Undo ChatGPT import**
- **Copy original paste**

Undo restores the previous editor body and the complete previous `public/content-assets/<collection>/<slug>` directory. Directory restoration uses a staged swap, so a locked file or failed filesystem operation cannot intentionally leave a half-restored directory.

The restored body is returned to the editor and marked as an ordinary unsaved change. The editor reviews it and clicks **Save draft**. Undo remains available after closing the import dialog, saving, or reloading the browser, until another import supersedes it or it is used.

The exact original paste remains copyable after undo.

Relevant API routes:

```text
POST /api/import/chatgpt/<collection>/<slug>
POST /api/import/chatgpt-recovery/<collection>/<slug>
POST /api/import/chatgpt-undo/<collection>/<slug>
POST /api/import/chatgpt-original/<collection>/<slug>
```

The import request includes `previousBody`; this preserves unsaved editor changes, not merely the last body written to disk.

## Published History restoration

The existing History panel is Git-based and therefore covers published commits rather than immediate imports.

Restoring a historical page now also reconstructs that commit's complete page-specific content-assets directory. If the chosen commit predates page assets, the current page asset directory is removed. This prevents an old Markdown body being paired with newer CSS, JavaScript, or hashed image files.

Immediate import Undo and published History are complementary:

- **Undo ChatGPT import** restores the state immediately before the latest local import.
- **History → Restore** restores the page and page assets from a selected published commit.

## UI integration

- `ui/src/features/editor/ChatGptAssets.tsx` sends the pre-import body and receives recovery metadata.
- `ui/src/features/editor/MarkdownEditor.tsx` reloads recovery status for existing pages and owns the Undo/Copy controls.
- `ui/src/api/client.ts` defines the recovery API calls.
- `ui/src/api/types.ts` defines `ChatGptRecovery`.
- The copied prompt supplied to ChatGPT warns against invented local paths, `/_astro/` URLs, embedded downloadable data, and import statements.

## Regression coverage

`test/rich-html.test.mjs` covers importer validation, URL repair, invalid JavaScript/images, rollback preservation, JSON-LD, missing files, and retained generated images.

`test/engine.test.mjs` covers:

- Exact raw-paste round trips.
- Persistence of recovery status.
- Atomic restoration of the previous body and page assets.
- Continued raw-paste access after undo.
- Recovery data remaining outside Git's working tree.
- History restoring the matching committed content-assets directory.

`ui/src/features/editor/MarkdownEditor.test.tsx` covers persistent Copy and Undo controls and restoration of the prior body.

## Deliberate limits

- Recovery records are local to one clone. Re-cloning the content repository removes them; published Git History remains available.
- There is one active Undo per page. A newer successful import supersedes the prior Undo, although its original paste remains in the retained records.
- Undo does not silently save the restored body. It marks the editor dirty so the editor can review and save it.
- External CDN resources remain permitted. They are not mistaken for local missing files, but their runtime availability cannot be guaranteed by the site build.
- The importer validates JavaScript syntax, not every possible browser runtime failure.
- Page rename/delete lifecycle handling for content-assets is separate from this recovery work and should be considered before expanding recovery across renamed slugs.

## Verification expectation

Before releasing importer changes, run:

```text
node --test test/rich-html.test.mjs
npm run typecheck
npm test
npm run build
```

Do not weaken a blocking importer error into a warning unless the final Astro build is demonstrably able to succeed with that condition.
