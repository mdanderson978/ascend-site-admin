# Ascend Site Admin 2.0

## Purpose

Ascend Site Admin 2.0 will replace the current single-file browser interface with a polished React application while retaining the proven Node.js content engine.

The goal is a CMS that feels like a professional desktop application without disrupting how Andrew launches it, edits content, uploads media, or publishes changes.

## Product principles

- Keep Andrew's workflow simple. Starting and using the CMS should work the same way it does today.
- Preserve complete compatibility with existing site content and `admin.config.mjs` files.
- Improve the interface without coupling the CMS to any one client website.
- Make important actions - saving, publishing, deleting, restoring and reordering - clear and difficult to trigger accidentally.
- Support keyboard use, accessible controls and responsive layouts from the beginning.
- Prefer a staged migration with measurable feature parity over a high-risk rewrite.

## Proposed architecture

### Backend

Keep the existing Node.js server in `index.mjs` as the local content and publishing engine. Its responsibilities remain:

- Reading and writing Astro content collections
- Serving site-specific configuration
- Image and PDF uploads
- Image processing and preview delivery
- Content search
- Entry ordering
- History and restore operations
- Git-based publishing
- Localhost and origin security controls

Existing `/api/*` behaviour should remain backward-compatible unless a deliberate API version is introduced.

### Frontend

Build a new frontend with:

- React
- TypeScript
- Vite
- Reusable form and media components
- Accessible drag-and-drop
- A small, documented design-token system for colours, spacing, typography and elevation

Vite will be a development and build dependency only. Production assets will be compiled and included in the published `ascend-site-admin` package, so consuming sites do not need Vite installed and do not gain a frontend build step.

## Visual direction

The interface should feel like a premium Ascend product rather than a generic developer utility.

### Application shell

- Branded sidebar with site navigation and content search
- Clear page title, breadcrumbs and entry status
- Persistent save and publish controls
- Collapsible navigation for smaller screens
- Useful empty, loading and error states
- Toast notifications for completed actions

### Content editing

- Calm, spacious form layout with related fields grouped into cards or sections
- Consistent field labels, descriptions, validation and error messages
- Better Markdown editing with formatting controls and preview support
- Modern image picker with thumbnails, upload progress, alt text and replacement controls
- Gallery management with obvious drag handles and ordering feedback
- Clear distinction between saved drafts and published changes

### Safety and accessibility

- Confirmation dialogs for destructive actions
- Visible focus states and complete keyboard navigation
- Sufficient colour contrast
- Screen-reader labels for icon-only controls
- Reduced-motion support
- Controls that remain usable without relying solely on drag-and-drop

## Compatibility contract

Version 2.0 must initially preserve:

- The existing `startAdmin(config)` integration
- Current `admin.config.mjs` configuration shapes
- Existing content collection files and frontmatter
- Existing upload and document locations
- Existing shortcode definitions
- Current launch scripts used by Andrew
- Current localhost-only security model

No content migration should be required for the first 2.0 release.

## Proposed repository structure

```text
ascend-site-admin/
|-- index.mjs                 # Node server and existing public entry point
|-- server/                   # Extracted server modules over time
|-- ui/
|   |-- src/
|   |   |-- api/              # Typed API client
|   |   |-- components/       # Shared interface components
|   |   |-- features/         # Editor, media, ordering, history, publishing
|   |   |-- styles/           # Tokens and global styles
|   |   |-- App.tsx
|   |   `-- main.tsx
|   |-- index.html
|   `-- vite.config.ts
|-- dist/admin/               # Compiled frontend shipped to consumers
|-- test/                     # Node engine and API tests
`-- V2-PLAN.md
```

The exact structure may change during implementation, but frontend source, compiled assets and server responsibilities should remain clearly separated.

## Migration phases

### Phase 1: Foundation

- Add the React, TypeScript and Vite toolchain.
- Create the application shell, design tokens and responsive navigation.
- Add a typed client for the existing `/api/config`, `/api/content` and `/api/search` endpoints.
- Add a temporary route or development flag that allows the legacy and V2 interfaces to run side by side.
- Configure the package so compiled V2 assets are included in releases.

### Phase 2: Navigation and basic editing

- Port the configured sidebar and dynamic collection navigation.
- Port search and common-task shortcuts.
- Implement text, number, boolean, list and multiline fields.
- Implement loading, validation, saving and error handling.
- Verify existing sites render equivalent forms from their current configuration.

### Phase 3: Rich content and media

- Port Markdown editing and shortcode controls.
- Port image upload, selection, previews, replacement and alt text.
- Port galleries, PDFs and multi-document fields.
- Preserve upload pruning and image-processing behaviour.

### Phase 4: Ordering, history and publishing

- Port accessible drag ordering for hub pages and galleries.
- Port deletion, history and restore controls.
- Port draft status and Git publishing.
- Add clear progress and outcome feedback for long-running operations.

### Phase 5: Verification and release

- Run feature-parity checks against the legacy interface.
- Test with Andrew's site and at least one additional configured site.
- Add browser-level tests for critical editing and publishing workflows.
- Check responsive behaviour and keyboard accessibility.
- Make V2 the default interface while retaining a short-lived legacy fallback.
- Remove the fallback only after the production workflow has been proven.
- Release as `v2.0.0` with migration and rollback notes.

## Testing strategy

Testing should cover three levels:

### Engine tests

Retain and expand the existing Node tests for file operations, uploads, ordering, security and Git behaviour.

### Frontend tests

Test field rendering, validation, navigation state, API error handling and accessible interactions independently.

### Workflow tests

Use browser automation for the most important user journeys:

1. Open a configured site and locate a page.
2. Edit and save ordinary fields.
3. Upload and replace an image.
4. Reorder entries and confirm persistence.
5. Publish changes successfully.
6. Restore an earlier revision.

Publishing tests must not push to a real production repository.

## Release and rollback

- Continue using immutable Git version tags for consuming sites.
- Build and verify frontend assets before creating a release tag.
- Keep the last stable 1.x tag available for immediate rollback.
- Upgrade Andrew's site to a specific 2.x tag only after acceptance testing.
- Document any future configuration changes with defaults that preserve older sites.

## Out of scope for the initial 2.0 release

- Hosting the CMS publicly
- Multi-user authentication and permissions
- Replacing Git as the publishing mechanism
- Changing Astro content formats
- Requiring consuming sites to build the admin frontend
- Redesigning client websites themselves

These can be considered later without delaying the core interface rebuild.

## Definition of done

Ascend Site Admin 2.0 is ready when:

- Andrew can launch it through his existing workflow.
- All currently supported field types and content operations work in the React interface.
- Existing site configuration and content work without migration.
- Drag ordering, uploads, drafts, history and publishing have been verified end to end.
- The interface is responsive, keyboard-accessible and visually consistent.
- The compiled frontend is shipped with the engine package.
- The legacy interface can be restored quickly if a production issue is discovered.
