# Ascend Site Admin 3.0: Page Builder

## Purpose

Version 3 adds a visual page builder to Ascend Site Admin. A client with no web
skills should be able to build a good-looking, well-structured page, either a
landing page assembled from designed sections or a long-form article with rich
components, see it as it will appear on the site, and publish it. The HTML that
comes out the other end must stay as clean as hand-written code.

Three sources shaped this plan:

- **YOOtheme Pro** (5.0.52, reviewed in full) has the best output of any visual
  builder: semantic, responsive, consistent markup built from a tested design
  system. Its architecture (a structured node tree, element schemas, a
  transform pipeline, versioned migrations and a real rendered preview) is the
  model here.
- **Nicepage** (Joomla plugin, reviewed in full) is friendlier for the first
  ten minutes: editing directly on the page, stock photos, palette-driven
  colour and coordinated section designs. Its storage, output and responsive
  approach are what to avoid.
- **The pilot client's ChatGPT workflow** is our own user research. It shows what
  a real client wants that 2.x can't do, and what happens when the only way
  to get it is pasting generated HTML.

## Evidence: what the pilot site shows

The pilot site's editor built around 2.x's limits by asking ChatGPT for styled HTML and pasting
it into Page Content. Measured on 2026-10-21:

- **50 of the pilot site's 70 content files** contain hand-pasted HTML. The largest, a
  trade terminology glossary, is 205 KB with 293 FAQ-style entries.
- **42 pages carry their own CSS (and some JS)** in `public/content-assets/`,
  about 1.1 MB in total. Single-page stylesheets reach 40 KB.
- **1,334 distinct site-prefixed class names** are used in content. Only 357 are defined
  in the source repo's CSS; **819 exist only in single-page CSS files**. Each
  page grew its own small design system (`site-topic-a-*`, `site-topic-b-*`,
  `site-topic-c-*`, and so on).
- The same components are rebuilt repeatedly: gallery viewer markup appears
  on 27 pages.
- Guardrails were already needed: a 114-line ChatGPT prompt restricting output
  to existing classes, an authoring workflow ("send the developer a brief when styles
  run out"), and build-time checks rejecting inline CSS, scripts, data URLs,
  duplicate ids and broken anchors.

What he built most often is the clearest requirements list we have:

| Need | Evidence in the pilot site's content |
|---|---|
| FAQ and accordions | 293 + 98 `<details>`, `site-faq-*` |
| Glossary with categories and counts | `site-glossary-*`, 267 entries |
| Photo galleries with a lightbox | 164 gallery cards, viewer on 27 pages |
| Before/after comparison | `site-ba-*`, `site-compare-*` |
| Kicker + heading + intro | `site-eyebrow` x175, `site-intro` x127 |
| Buttons and calls to action | `site-button` x148, mid-page and final CTAs |
| Cards and related links | `site-card`, `site-related-*` x158 |
| Process steps | `site-process-*` |
| Service areas | `site-postcode` x350 |
| Guide furniture | table of contents, back to top, byline, "our opinion" callout |
| Colour and finish explainers | `site-colour-*`, finish grid |
| Packages | `site-package-*` |

Two conclusions drive this plan:

1. **The main need is long-form articles with components, not just landing
   pages.** 3.0 must have an article mode, not only a section stacker.
2. **AI-assisted writing is how this client wants to work.** 3.0 should give
   ChatGPT a proper, validated channel instead of fighting it.

## Why YOOtheme's output is good (and what that means for us)

| YOOtheme mechanism | Effect on output | Our rule |
|---|---|---|
| Nearly every option is a `select` of named tokens (935 selects vs 15 colour pickers in core) | Users cannot produce off-brand sizes, colours or spacing | Style fields choose from design tokens, never raw px or hex |
| Every option maps to a class in one tested CSS framework; no inline styles | Consistent, cacheable, overridable CSS | Elements emit classes only, from one shared stylesheet |
| HTML element is a separate field from visual style (`title_element: h2` + `title_style: heading-large`) | Correct heading outline regardless of look | Every heading has a separate **Level** (semantic) and **Size** (visual) |
| Templates skip rendering when content is empty; empty containers collapse | No empty wrappers or stray `<h2></h2>` | Renderer drops empty elements and collapses empty containers |
| Section style picks a tone and text colour inverts automatically | Readable contrast without thinking about it | Section **Tone** sets an inverse colour context |
| Images get width/height, srcset, lazy loading, focal-point cropping | Good Core Web Vitals without effort | Image pipeline does this always |
| Fixed breakpoints; columns stack automatically | Responsive by default | Clients never set breakpoints |
| Version stamp on the root, per-element version-keyed migrations | Old pages never break when elements evolve | Same, from day one |
| Save-time optimiser strips empties and defaults and sorts keys | Small, stable stored data | Same, which also gives readable Git diffs |

Where YOOtheme falls short and we differ:

- **Option overload.** Its grid element is 71 KB of option definitions.
  Clients see a curated subset; the rest is behind developer mode.
- **Lock-in.** A YOOtheme page is unreadable without the template. Our data is
  plain YAML and the renderer is our own package.
- **Heavy editor.** A 1.2 MB Vue bundle and an in-browser LESS compiler.
- **No quality coaching.** It happily allows three H1s and no alt text. We add
  Page Check.

## Lessons from Nicepage

Nicepage stores browser-generated HTML strings (no structured model, no
migrations), ships an 81 MB editor with Froala bundled in for text, produces
about 670 KB of base CSS plus per-element pixel CSS for 5 breakpoint modes, and
inside a normal template its responsive layout is a jQuery script that swaps
breakpoint classes on resize. None of that is copied.

What it does better, and what we take:

| Nicepage feature | Our version |
|---|---|
| Edit directly on the page: click text to type, click an image for Replace / Crop, click a button to edit label and link | Inline editing plus floating toolbars on the preview canvas (phase 4) |
| 5 brand colours, each auto-generated into 7 shades (35 tokens), plus typography presets | The developer defines the brand once; shades are generated; the editor offers only those named colours (phase 1). Never client-editable |
| Stock photo search (Unsplash, Pixabay) in the image picker | Not taken for 3.0. Clients who want a stock photo download it and upload it as usual. Revisit only if it turns out trivial |
| Coordinated "design sets" of sections that look right together | Presets ship as coordinated sets, not loose blocks (phase 5) |
| Editing one repeated item updates its siblings | Inherent in schema-based items; made visible by highlighting siblings and "add another like this" |
| Copy and paste style | Copy an element's Style-tab values (phase 6) |
| Layout responds to the content area, not the screen | CSS container queries, no JavaScript |
| Ships only the colour CSS a page uses | One CSS file per element so Astro bundles only what a page uses |
| On-device smart cropping (TensorFlow.js) | `sharp`'s `attention` crop strategy suggests a focal point on upload (sharp is already in the engine) |

What we avoid: free positioning and pixel values per breakpoint (the root of
both its friendliness and its fragility: clients must check 5 views and mobile
usually breaks), stored HTML strings, contenteditable over free HTML, per-element
id-based CSS, and JavaScript-dependent responsiveness.

## Product principles

1. **Start from something good.** The default way to add content is a designed
   preset, not an empty element. Empty states show believable placeholder content.
2. **Edit what you see.** Click anything in the preview to edit it. The form and
   preview stay in sync.
3. **Constrain style, not content.** Clients write anything; style comes only
   from the site's design tokens.
4. **The structure guarantees the HTML.** Output quality comes from schemas and
   templates, never from cleaning up after free typing.
5. **Two ways to build, one element library.** Landing pages stack sections;
   articles flow text with components dropped in. Both use the same elements.
6. **Welcome ChatGPT by copy and paste, validate everything it produces.**
   ChatGPT output enters through the same schemas as hand-built content. No AI
   provider APIs in 3.0.
7. **Fast by construction.** Every page the builder produces should score 100
   on PageSpeed Insights without a second optimisation pass: AVIF images with
   correct sizes, an automatic LCP image, inlined CSS, no render-blocking
   requests, zero layout shift. See Performance by construction.
8. **Fluid by default: `clamp()` everywhere.** All type and spacing come from
   clamp-css tokens. No pixel sizes and no breakpoints for type or spacing.
9. **Professional polish.** The admin should feel like premium design software,
   not a developer tool. See Interface quality bar.
10. **Progressive disclosure.** Content tab first, Style second, Advanced only
    in developer mode.
11. **Nothing breaks on upgrade.** Every stored layout carries a version and is
    migrated on load.
12. **Zero JavaScript by default on the live site.** Native HTML (`<details>`,
    `<dialog>`) first; tiny opt-in scripts only where unavoidable.
13. **Respect the split.** Clients only ever touch the content repo. No
    developer code goes into it, and no secret goes onto a client machine.
14. **Fleet-wide, not per site.** Elements, presets and page templates ship
    with the engine for every site, so sites never drift into incompatible
    variants. Sites differ through brand tokens and their own CSS.
15. **Keep 2.x compatible.** Existing fields, the flat `blocks` type, content
    files and launch workflow keep working.

## How it fits the split-repo system

This section is load-bearing. Every other decision has to respect it.

### What lives where

| Location | Who can access it | Owns |
|---|---|---|
| **Source repo** (private) | Developer only | Site template: header, footer, nav, page shell, global CSS, clamp tokens and brand definition, fonts, routing, site-specific components, `<BuilderLayout>` |
| **Content repo** (private) | Client and developer | Pages, layouts and articles as data, uploads, documents, `admin.config.mjs`, the deploy workflow |
| **Engine package** (this repo) | Pinned by tag | Admin engine and UI, plus the fleet-wide element library: schemas, render functions, element CSS, migrations, presets, page templates |

The client's machine has only the content repo and the engine. It never has
the source repo. At deploy, the content repo's `publish-deploy.yml` clones the
source repo into `_build`, copies content in, and runs `npm ci` and the build
in `_build`.

### One effective engine version per site

The build only installs the source repo's dependencies, so the source repo must
also depend on the engine (for the renderer, element CSS and zod schemas). Two
pins per site would drift; the pilot site's content repo is already on 2.15.2 while the
engine is at 2.17.0.

**Rule: the content repo's pin decides.** `publish-deploy.yml` gains one step
before the build that reads the content repo's `site-admin` spec and installs
exactly that into the source checkout (`_build` in the workflow template):

```yaml
- name: Use the content repo's engine version
  working-directory: _build
  run: |
    if node -e "process.exit(require('./package.json').dependencies?.['site-admin'] ? 0 : 1)"; then
      spec=$(node -p "require('../package.json').dependencies['site-admin']")
      npm install --no-save "site-admin@$spec"
    fi
```

The source repo's own pin only matters for local development. `verifySite`
warns when the content repo's installed engine differs from its pin, and the
build writes its engine version into `brand.json`, so the admin can tell when
the live site was built with a different version. (Built in phase 1 part 3.) If a layout's version is newer than the renderer,
the build fails with a message naming both versions and the fix.

### What the preview can and can't show

The admin can't see the source repo, so the preview borrows the **deployed**
site's shell. That means:

- The **page body** is exact: rendered by the same functions the build uses.
- The **surroundings** (header, footer, site CSS, token mapping) are whatever is
  currently deployed. Undeployed source changes won't show until deployed.
- Site-wide token mappings must live in global CSS, so the deployed stylesheet
  always has them.
- Every new site is deployed to its workers.dev address early, so the preview
  has a shell from the first day. Offline or before any deploy, a bare shell
  with the element CSS and token values is used.
- Unpublished menu edits don't appear in the borrowed header.

### Site-specific elements

They stay in the source repo as normal `.astro` components. The admin edits
their fields from `admin.config.mjs` (as `blocks` does today) and the preview
shows a labelled placeholder card. No developer code goes into the content repo.

### The trade-off

Today each site's block components can have completely bespoke markup. Under
3.0, standard elements share one markup across all sites; sites differ through
tokens, variants and their own CSS. That's what makes the real preview and
"define each element once" possible. Anything truly bespoke still lives in the
source repo as a site-specific element.

## Current state (2.17.0) and the gaps

Reused as-is: the Node content engine, React frontend, Git publishing with
deploy status, history and restore, WebP upload pipeline, YouTube thumbnails,
menus, redirects, link fixer, search, and the flat `blocks` field type.

Gaps:

- **The three-way contract.** Each block type is defined three times per site:
  `admin.config.mjs`, a zod member in the source repo's `content.config.ts`,
  and an `.astro` component in `BlockList.astro`.
- **No repeatable items.** The pilot site's Card Grid uses `card1_` to `card3_` fields.
- **No rich components inside articles.** Hence the ChatGPT HTML workflow and
  its 819 one-off classes.
- **No preview, style controls, presets, library or quality checks.**

## Architecture

### Overview

```text
                   engine package: site-admin (this repo)
      ┌──────────────────────────────────────────────────────────┐
      │ elements/library/<name>/  element.mjs  style.css          │
      │                           presets/  icon.svg              │
      │ core/  tree, transforms, renderer, zod export, AI import  │
      └──────────────┬─────────────────────────────┬─────────────┘
                     │ pinned by content repo      │ same version, installed
                     ▼                             ▼ by publish-deploy.yml
      content repo (client machine)        _build (GitHub Actions)
      - admin UI: forms from schemas       - <BuilderLayout> renders with
      - preview runs the same render()       the same render() functions
      - migrations + optimise on save      - zod schema from the same schemas
      - layout/article data, uploads       - element CSS bundled per page
```

Each element is defined once and shipped once, which removes the three-way
contract for standard elements.

### Decision: elements render with plain JavaScript, not `.astro`

For the preview to be the real output, the admin must run the exact renderer
the build runs, on a machine with no Astro source. `.astro` components need the
Astro compiler and Vite, too heavy to ship inside the admin. Each element's
`render()` is therefore a plain async function returning an HTML string,
written with an escaping `h` tagged template and a class helper.

The library is plain ESM (`.mjs` with JSDoc types), not TypeScript: the same
files must load unchanged in Node (the admin), Vite (the admin UI) and Astro
builds from `node_modules`, and Node does not strip TypeScript types inside
`node_modules`. It also matches the rest of the engine. (Implemented in phase 1;
the sketch below shows the shape.)

```ts
export default defineRender<HeadingProps>(async ({ props, h, cls }) => {
  if (!props.text) return null; // empty elements never render
  const tag = props.level ?? 'h2';
  return h`<${tag} class="${cls('ab-heading', {
    [`ab-size-${props.size}`]: props.size,
    [`ab-tone-${props.colour}`]: props.colour,
    'ab-align-center': props.align === 'center',
  })}">${props.kicker ? h`<span class="ab-heading__kicker">${props.kicker}</span>` : ''}${props.text}</${tag}>`;
});
```

Host-specific behaviour is injected:

| Hook | Astro build | Admin preview |
|---|---|---|
| `resolveImage(src, opts)` | Reads the committed media manifest: AVIF srcset, WebP fallback, width/height, focal point | Same manifest; images not yet published are served by the admin |
| `resolveLink(ref)` | Source repo routing | `urlPatterns` from `admin.config.mjs`, plus `data-preview-link` to block navigation |
| `collection(name, query)` | `getCollection()` | Engine reads the same content files |
| `mode` | `'build'` | `'preview'`: adds `data-node` ids for selection |

In the source repo, one component does the work:

```astro
---
import { renderLayout } from 'site-admin/elements';
import { astroHost } from 'site-admin/elements/astro';
const { layout } = Astro.props;
const html = await renderLayout(layout, astroHost(Astro));
---
<div data-builder-root><Fragment set:html={html} /></div>
```

`resolveLink` uses two sources of truth (source routing and `urlPatterns`).
That's true today as well; `verifySite` checks they agree for every page.

### Data model

Layouts are stored in frontmatter under `layout`, as YAML, so history, search,
publishing and the link fixer keep working.

```yaml
layout:
  schema: 1
  children:
    - type: section
      id: n7f3k2
      props: { tone: muted, spacing: l }
      children:
        - type: heading
          id: q81mz0
          props: { kicker: What we do, text: Our services, level: h2, size: xl, align: center }
        - type: cards
          id: c02lpa
          props: { columns: 3, image_ratio: landscape }
          children:
            - type: card
              id: k3x9a1
              props: { title: Deck restoration, text: ..., image: ../../assets/uploads/deck.webp, link: { page: services/restoration } }
```

Rules:

- **Hierarchy:** `layout` › `section` (or `article`) › element, with an optional
  `columns` container (› `column` › element). Repeatable content uses item
  children (`cards › card`, `faq › faq_item`). Allowed nesting is fixed by
  schema (`allowedChildren`), so clients can't build arbitrary structures.
- **Stable node ids** on every node, kept on save. They key preview patching,
  selection, undo and comments, and make Git diffs easier to follow.
- **Schema number** on the root only: an integer that changes only when a
  migration is added (not the engine's semver, which would rewrite every saved
  page on each engine release).
- **Links** are stored as references (`{ page: 'services/renovations' }`), so
  renames go through the existing rename and link-fixer flow.

### Article mode

An `article` is a container whose children alternate between `prose` nodes and
component elements:

```yaml
    - type: article
      id: a1
      children:
        - type: prose
          id: p1
          props: { html: "<p>Timber decks age in predictable ways...</p><h2 id=\"greying\">Greying</h2><p>...</p>" }
        - type: callout
          id: c1
          props: { variant: opinion, title: Our view, text: "<p>Re-oil before...</p>" }
        - type: faq
          id: f1
          children:
            - type: faq_item
              props: { question: How long does restoration take?, answer: "<p>Usually 2 to 3 days...</p>" }
        - type: prose
          id: p2
          props: { html: "<p>...</p>" }
```

In the editor it is **one continuous Tiptap document**: prose is typed normally,
and components appear as embedded blocks (custom Tiptap nodes with their own
form and preview). On save the document is split back into this node list. A
page can mix modes: a hero section, then an article, then a CTA section.

Article mode allows `<h2>` and `<h3>` in prose (long-form needs them), and
powers the **Table of contents** element, which is generated from those
headings at render time, so anchors can never break.

### The transform pipeline

Ported in spirit from YOOtheme's `Builder` (fresh code, see Licensing):

| Stage | Transforms | Where it runs |
|---|---|---|
| load | migrate (version-keyed), fill defaults, assign missing ids | admin, build |
| save | validate against schema, sanitise prose, optimise (drop empty, null and default props, sort keys), stamp version | admin |
| render | drop `status: hidden`, placeholders (preview only), collapse empty containers, visibility classes, tone context, heading ids and outline, table of contents | admin preview, build |

Migrations live with each element, keyed by the schema number they upgrade to:

```js
// in elements/library/cards/element.mjs
migrations: {
  2: node => { node.props.columns ??= 3; },
  3: node => { node.props.image_ratio = node.props.img_ratio; delete node.props.img_ratio; },
},
```

### Element schema

An element folder contains `element.mjs` (definition, render and migrations),
`style.css`, and later `icon.svg`, `thumb.webp` (picker preview) and `presets/`.
See `elements/README.md` for the rules every element follows.

```ts
export default defineElement({
  name: 'heading',
  title: 'Heading',
  group: 'Text',
  allowedParents: ['section', 'column'],
  defaults: { level: 'h2', size: 'l' },
  placeholder: { text: 'A clear, helpful heading' },
  ai: 'A section heading with an optional short kicker line above it.',
  fields: {
    kicker: { type: 'string', label: 'Small line above', inline: true },
    text:   { type: 'string', label: 'Heading', inline: true, required: true },
    level:  { type: 'heading-level', label: 'Heading level',
              hint: 'Use H2 for main sections, H3 inside them. The page title is already H1.' },
    size:   { type: 'token', scale: 'type', label: 'Size' },
    colour: { type: 'token', scale: 'tone', label: 'Colour' },
    align:  { type: 'align', label: 'Alignment' },
    link:   { type: 'link', label: 'Link (optional)' },
    ...general,   // spacing, visibility, anchor, hidden, admin label
  },
  tabs: {
    Content:  ['kicker', 'text', 'link'],
    Style:    ['size', 'colour', 'align', 'spacing'],
    Advanced: ['level', 'anchor', 'visibility', 'label'],  // developer mode
  },
});
```

Field system additions on top of today's FieldConfig:

- **`enable` / `show` conditions** in a tiny safe expression language
  (`'image && !icon'`), parsed, never `eval`'d.
- **Token fields:** `token` (with `scale`: `space`, `type`, `tone`, `radius`,
  `width`), `align`, `heading-level`, `ratio`, shown as segmented controls or
  swatch rows, not jargon dropdowns.
- **Visual select:** options shown as small diagrams (column layouts, card
  styles, image position).
- **`items`:** sortable child nodes with add, duplicate, drag and delete,
  replacing `card1_`/`card2_`.
- **`richtext`:** schema-bound Tiptap (below).
- **`link`:** the existing `PageLinkPicker` plus external URL, phone, email,
  anchor on page and document.
- **Shared fragments** (`general`, `imageOptions`, `buttonOptions`).
- **`ai`:** a one-line description used to generate the ChatGPT prompt.

Every field gets a plain-English `hint` that explains consequences, not
mechanics. YOOtheme's descriptions are a large part of why non-developers
succeed with it.

### Rich text without Froala's output

Rich text uses **Tiptap (ProseMirror)** with a strict schema. Content that
doesn't fit the schema cannot exist.

- Allowed per field: paragraph, bold, italic, link, bulleted and numbered
  lists; H2/H3 only in article prose. No fonts, colours, sizes, alignment,
  inline styles, spans or divs.
- Paste from Word, Google Docs or the web is normalised through the schema.
- Stored as HTML that round-trips exactly. The renderer sanitises again on
  output.
- Visual heading size is the Heading element's job, not a big paragraph.

### Live preview

1. **Shell.** The admin server fetches the deployed page (or the home page for
   an unpublished one) from `siteUrl` with a browser User-Agent, caches the last
   good copy, and serves it same-origin with a `<base href>`. The contents of
   `[data-builder-root]` are replaced with the draft render. Without a shell
   (offline, never deployed), a bare shell is used.
2. **Styles.** All element CSS (wrapped in a cascade layer) is injected after
   the site's CSS, so elements not yet used on the live site still preview
   correctly. Brand and clamp tokens come from the deployed site's own CSS.
3. **Render in the browser.** The element library runs in the editor directly, with no
   server round trip per keystroke. Unpublished images come from the admin's
   upload route.
4. **Patch, don't reload.** Each render is morphed into the iframe with
   idiomorph, keyed by `data-node`. Scroll position is kept.
5. **Select and navigate.** Hover outlines with the element name, click to
   select, breadcrumb (`Section › Columns › Cards › Card 2`). Links are
   disabled in the preview.
6. **Device widths.** Desktop, tablet and phone toggles.

### Fluid tokens: `clamp()` everywhere

The element library follows the clamp-css system exactly:

- **All type and spacing are `clamp()` tokens** generated by clamp-css's
  `clamp.mjs` (default 375px to 1440px), never hand-calculated. Each value hits
  its minimum at the smallest viewport and its maximum at the largest, scaling
  smoothly in between.
- **Element CSS never contains** pixel font sizes, pixel margins, padding or
  gaps, or media queries for type or spacing. It uses only tokens:
  `--ab-step-*` (type), `--ab-space-*` (spacing), `--ab-tone-*`, `--ab-radius`,
  `--ab-font-*`. A lint test enforces this on every element stylesheet.
- **Layout switches use container queries** (`@container`), for example cards
  going from 3 columns to 1 in a narrow column. That's structure, not sizing;
  type and spacing still come from the same clamp tokens, so everything on a
  page scales together.
- The engine ships a default token set generated by `clamp.mjs`. Each site
  maps its own generated tokens to the `--ab-*` names in global CSS in the
  source repo.
- The only media queries allowed in element CSS are user-preference ones
  (`prefers-reduced-motion`, `hover`, `pointer`).

### Brand (developer-defined, never client-editable)

- The developer defines the brand once in the source repo: up to 5 named brand
  colours (Primary, Accent, Dark, Light, and so on), from which 7 shades each
  are generated in OKLCH; typography presets (title, subtitle, body); fonts
  (self-hosted woff2, never Google's CDN); corner radius.
- The source repo's build publishes the brand to the deployed site as
  `/_ascend/brand.json` (same pattern as `version.json`): colour names, values,
  roles and which pairs pass WCAG AA contrast.
- The admin reads `brand.json` from `siteUrl`, so **the colour and tone choices
  an editor sees are exactly the brand's named colours**, shown as real swatches
  ("Primary", "Accent"), never a colour picker or hex input. A colour that
  fails contrast on a given tone is not offered there. An `admin.config.mjs`
  `brand` entry is the fallback for a site that isn't deployed yet.
- Section **Tone** sets a colour context class; elements use contextual tokens,
  so text, links and buttons invert on dark sections automatically.

## The editing experience

### Two ways to build

- **Section mode** for landing and service pages: stack designed sections.
- **Article mode** for guides, FAQs and long-form SEO content: write in one
  flowing editor and drop in components with a `/` menu or `+` button.

### Adding content

The **Add** dialog has three tabs:

- **Sections** (default in section mode): fleet-wide presets with real
  thumbnails, organised as **coordinated design sets** (2 or 3 visual styles),
  grouped by purpose: Heroes, About, Services, Features, Testimonials, Gallery,
  FAQ, Call to action, Contact, Team, Pricing, Logos. Picking one inserts it
  fully formed, in the site's own brand.
- **Elements:** individual elements with icons, grouped, with search.
- **Library:** this site's saved sections (arrangements of fleet-wide elements,
  so they migrate like any other content).

### Editing on the canvas

- **Inline text editing** for fields marked `inline: true` (headings, kickers,
  button labels, short text): double-click in the preview to type. Inline
  fields are plain text or schema-bound rich text; the canvas is never a free
  contenteditable region.
- **Floating toolbars** on the selected element:
  - Image: Replace, Crop and focal point, Alt text.
  - Button and link: label, link picker, style.
  - Repeat item: Add another like this, Duplicate, Move, Delete; sibling items
    are highlighted so editing one card visibly applies to the set.
- **Sidebar form** with Content and Style tabs for everything else.
- **Outline panel:** page tree with drag, duplicate, hide, delete, rename label.
- **Drag sections on the page** (Nicepage's "move blocks"): each section in the
  preview has a grab handle; drag it up or down with a clear drop indicator
  and the page animating into place. Every section also has **Move up / Move
  down** buttons, so reordering works by keyboard, on touch screens and for
  anyone who finds dragging fiddly. A mis-drop is one Ctrl+Z away.
- **Undo and redo** (Ctrl+Z / Ctrl+Shift+Z), separate from Git history.
- **Copy and paste** nodes between pages; **copy and paste style** between
  elements of the same type.
- **Local draft autosave** so a crashed tab never loses work.

### Images

- Upload pipeline as today (sharp in the admin), extended to produce the AVIF
  set and WebP fallback at upload (see Performance by construction), plus a
  **suggested focal point** from sharp's `attention` strategy, which the client
  can adjust.
- The client never chooses formats, sizes or loading behaviour. The build
  handles all of it (see Performance by construction).
- Clients who want a stock photo download it themselves and upload it like any
  other image. Built-in stock search is not in 3.0.

### ChatGPT import

This replaces the pilot site's hand-maintained prompt file. It is copy and
paste only: the admin never calls an AI service, needs no API key and costs
nothing to run. The client keeps using ChatGPT (or any chat AI) the way they
already do.

1. **Copy prompt.** Two buttons copy a ready-made prompt to the clipboard,
   generated from the live element schemas (each element's `ai` description,
   fields and an example), so it is always in sync with what the site supports:
   - **Write new content:** the element vocabulary, the rules, and a space for
     the client's topic and notes.
   - **Improve this page:** the same, plus the current page's content already
     written out as component tags, so ChatGPT can revise it and the client
     pastes the result back.
2. **Component tags.** ChatGPT writes content using a small, fixed set of tags
   that map one-to-one to elements, which it handles more reliably than JSON:

   ```html
   <ab-heading kicker="Deck care" level="h2">Why decks turn grey</ab-heading>
   <ab-prose><p>Timber decks age in predictable ways...</p></ab-prose>
   <ab-callout variant="opinion" title="Our view"><p>Re-oil before...</p></ab-callout>
   <ab-faq>
     <ab-faq-item question="How long does restoration take?"><p>Usually 2 to 3 days.</p></ab-faq-item>
   </ab-faq>
   <ab-image note="Wide photo of a freshly oiled deck at dusk"></ab-image>
   ```

3. **Paste from ChatGPT.** The admin parses the paste, validates every tag and
   attribute against the schemas, sanitises prose, and inserts real elements at
   the cursor (or replaces the page, for "Improve this page", after a preview
   of the changes). Image notes become empty image slots showing the note, as a
   reminder of which photo to upload.
4. **Plain-English feedback.** Anything that doesn't fit (unknown tag, missing
   required field, inline style) is listed with what was skipped and why. Nothing
   reaches the build unvalidated.

The existing raw-HTML ChatGPT paste stays available in developer mode only.

### Request a new element

When nothing in the library fits, **Request an element** opens a short form
(what they want, an example link, which page) and then opens the client's own
email app with a message to the site's configured `developerEmail` already
filled in: subject, site name, page and description. The client attaches a
screenshot if they have one and presses Send. Nothing is stored in the content
repo and no mail server is involved. This formalises "send the developer a
brief"; each new element then benefits every site, not one page.

### Page Check

Runs on every render and flags issues inline on the offending node, with
one-click fixes where possible. Warnings only, except where noted.

- Heading outline: more than one H1, skipped levels, empty headings.
- Images: missing alt text (blocks Publish, as today), image too small for its
  slot, non-eager first image.
- Links: broken internal references, vague link text ("click here"), bare URLs.
- Contrast: tone and colour combinations failing WCAG AA.
- Content: very long paragraphs in narrow columns, all-caps text, empty sections.
- Performance: more than one video above the fold, oversized uploads.

### Library and templates

- **Saved sections** in `src/content/_library/`, reusable on any page of the site.
- **Page templates** for new pages (Service page, Guide, Landing page), shipped
  fleet-wide with the engine; a site's config chooses which ones it offers.
- **Global sections** (later): inserted by reference, edited once everywhere.

### Roles

- **Editor mode** (default): Content and Style tabs, presets, library, ChatGPT
  import, Page Check.
- **Developer mode** (config flag or local env var, never the client): Advanced
  tab, raw HTML element, raw ChatGPT HTML paste, schema inspector, and
  **section locking** so the client can edit text and photos but not delete or
  restyle a structure the developer built.

## Element catalogue

v1 elements, all zero-JS unless noted. Elements marked **pilot** come directly
from the evidence above.

| Group | Element | Notes |
|---|---|---|
| Layout | Section | tone, content alignment (left or centre; headings, text and buttons follow it and can override it), spacing, width, background image (a real `<img>`, not CSS) with focal point and overlay |
| Layout | Article | prose + components flow (article mode) |
| Layout | Columns | visual layout picker, gap, vertical align, mobile stack order |
| Text | Heading | level vs size, optional kicker (**pilot**) |
| Text | Text / Prose | rich text |
| Text | Callout | variants: note, tip, warning, opinion (**pilot**) |
| Text | Table of contents | generated from article headings, optional back-to-top links (**pilot**) |
| Text | Author byline | name, role, photo, reviewed date (**pilot**) |
| Text | Buttons | items; primary, secondary, link styles |
| Text | Icon / feature list | items; curated inline SVG icons |
| Media | Image | focal point, ratio, caption, optional link or lightbox |
| Media | Video | YouTube/Vimeo with local poster and click-to-load facade; self-hosted background video with a real poster image, autoplay only when reduced-motion and data-saver settings allow, and a pause button |
| Media | Gallery | items; grid or masonry; one shared `<dialog>` lightbox (small opt-in script) (**pilot**) |
| Media | Before / after | two images with a native range slider or side by side (**pilot**) |
| Repeatable | Cards | items; image, title, text, link; 2 to 4 columns |
| Repeatable | Related links | items or auto from a collection (**pilot**) |
| Repeatable | FAQ | items; `<details>`; FAQPage JSON-LD (**pilot**) |
| Repeatable | Glossary | categories with term counts, `<details>` entries, DefinedTermSet JSON-LD (**pilot**) |
| Repeatable | Steps / process | items; numbered (**pilot**) |
| Repeatable | Swatches / comparison grid | colour or finish options with image, name, notes (**pilot**) |
| Repeatable | Packages / pricing | items (**pilot**) |
| Repeatable | Testimonials | items; quote, name, suburb, optional rating |
| Repeatable | Stats | items; number and label |
| Repeatable | Logo strip | items; static grid (a carousel variant follows the carousel-no-lcp rules) |
| Site | CTA band | heading, text, buttons, phone; mid-page and final variants (**pilot**) |
| Site | Service area list | suburbs or postcodes, grouped, compact columns (**pilot**) |
| Site | Contact form | Turnstile + Email Routing (existing pattern) |
| Site | Map | static image plus "Open in Google Maps", no embed until clicked |
| Site | Latest from collection | cards bound to a collection with sort, limit, filter |
| Developer | HTML | raw HTML, developer mode only |
| Developer | Legacy HTML | holds pre-3.0 pasted HTML during migration (below) |

Later candidates from existing skills: Ken Burns hero, Facebook feed, Google
reviews, team grid, timeline, tabs. Interactive tools (calculators, filters)
remain site-specific developer work, as the pilot site's workflow doc already states.

Section presets for v1: about 30, in 2 or 3 coordinated design sets, each
checked with Page Check and axe. Presets are fleet-wide only: a site can't
define its own, so every preset is tested once and stays compatible
everywhere. A good section built for one client becomes a fleet preset.

## Output standards

Enforced by tests on every element and preset:

- Valid HTML (html-validate); no inline `style` except custom properties
  (for example a focal point's `object-position`).
- Element CSS uses only clamp tokens for type and spacing (lint-enforced; see
  Fluid tokens).
- Semantic elements: `<section>` with an accessible name when it has a heading,
  `<article>`, `<figure>/<figcaption>`, `<blockquote>`, real lists, `<details>`.
- Prefixed, flat class names (`ab-card`, `ab-card__title`); no utility soup, no
  framework coupling.
- **Container queries, not viewport media queries**, so an element lays out
  correctly whether it sits full width or in a narrow column.
- **One CSS file per element**, so a page only ships CSS for elements it uses.
- Images follow Performance by construction (AVIF, automatic `sizes`, width
  and height, automatic LCP handling) and always have alt (or `alt=""` when
  marked decorative).
- No empty elements or wrappers; no `<br>` for spacing.
- Unique ids, and every same-page anchor resolves (generated, not hand-typed).
- axe: zero serious or critical violations in all presets.
- JSON-LD where natural (FAQ, glossary, reviews, breadcrumbs).
- The pilot site's existing build checks (no embedded CSS/JS, data URLs, unsafe iframes)
  move into the engine's render and save stages for every site.

## Performance by construction

The goal is a PageSpeed Insights score of 100 (mobile and desktop) on pages the
builder produces, with no separate optimisation pass afterwards. Recent fleet
work showed what moves a site from the high 80s to 100: real AVIF images with
correct sizes, one clear high-priority hero image, inlined CSS and
non-swapping fonts. 3.0 builds all of that into the output so it can't be
forgotten.

### Images (AVIF, encoded once at upload)

**Decision: images are encoded once, at upload, and committed. Builds never
encode images.**

Why not let Astro encode at build: Astro does cache processed images between
builds (in `node_modules/.astro`), but the deploy runs on a fresh GitHub
Actions machine and `npm ci` deletes `node_modules`, so every publish
re-encodes every image on the site at every width. A cache step would help
only partly, because GitHub evicts caches unused for 7 days (about one publish
interval for a weekly site), so many publishes would still be cold. Encoding at
upload makes every publish fast regardless.

- **At upload,** the admin (sharp, already in the engine) encodes from the
  client's original photo:
  - **AVIF at a fixed width ladder** (400, 800, 1200, 1600, 1920), capped at the
    original's width. Quality about 50 (proven on fleet photos), one engine
    setting, not per image.
  - **One WebP fallback** for browsers without AVIF (mainly iPhones and iPads
    stuck on iOS 15 or earlier, roughly 5% of visitors, more for older
    audiences). AVIF-capable browsers never download it. The fallback is the
    existing upload itself, **copied into place at build time** (a file copy,
    never an encode), so it is never stored twice.
  - The client sees a progress indicator; this takes a few seconds per photo.
- **Opt-in per site** (`media: { avif: true }` in `admin.config.mjs`), turned
  on when a site adopts the V3 elements. 2.x sites keep using Astro's own
  image pipeline and gain no files they don't use. (Built in phase 1 part 2.)
- **Committed to the content repo** with everything else on Publish, because
  the build machine only sees what's in the two repos. Files live in
  `public/media/` (added to the copy step in `publish-deploy.yml`) so Astro
  serves them as-is and never reprocesses them.
- **Fingerprinted names** (`deck-a1b2c3-800.avif`, `deck-a1b2c3.webp`) so the
  site can mark them cacheable forever, and a replaced photo automatically gets
  new URLs.
- **A manifest** (`public/media/manifest.json`) records each image's
  fingerprint, available widths, intrinsic width and height and focal point, so
  both the admin preview and the build write `<picture>` markup without decoding
  any image.
- **The existing upload** in `src/assets/uploads/` stays as the master and
  keeps 2.x image fields working unchanged.
- **Pruning** treats an upload and its AVIF set as one unit: removed
  together, never leaving stray variants.
- **Changing the ladder or quality later:** `npx site-admin-media backfill`
  re-encodes anything made with older settings (from the masters), committed
  once.
- **Repo size, measured on 20 of the pilot site's real photos:** a full AVIF
  set adds about 54% of the upload's own size (roughly 7 MB on the pilot
  site's 12.7 MB of uploads), and encoding took 5.4 s for the 20 photos.
  Because the fallback is copied at build time, nothing else is added. Git
  LFS and external storage (R2) were rejected: LFS adds setup on every client
  machine and in CI, and external storage would need credentials on client
  machines.
- **Existing sites:** the same `npx site-admin-media backfill` generates sets
  for current uploads (from their stored WebP; second-generation loss is
  acceptable).

At render time:

- Every image renders as `<picture>` with an AVIF `<source>` (full srcset from
  the manifest) and the WebP as the `<img>` fallback.
- **`sizes` is computed automatically** from where the image sits: the
  renderer knows the container width, column fraction and section width, so it
  writes accurate `sizes` that hand-coding often gets wrong.
- **The LCP image is handled automatically:** the first image in the first
  section (or the hero background) is `loading="eager"` with
  `fetchpriority="high"`; every other image is lazy with `decoding="async"`.
  Nothing else on the page is high priority (not the logo).
- **Hero and section backgrounds are real `<img>` elements** with
  `object-fit` and `object-position` from the focal point, never CSS
  `background-image`, so the browser can discover and prioritise them.
- Width and height always set (from the manifest), plus `aspect-ratio` on
  media frames, so layout shift is zero.

### CSS, fonts and scripts

- **CSS inlined** (`build.inlineStylesheets: 'always'`). This is affordable
  because a page only carries CSS for the elements it uses; a size budget is set
  in phase 1 from measured pilot pages and enforced by tests.
- **Fonts** are self-hosted woff2, Latin subset, preloaded, with
  `font-display: optional` so text never visibly swaps on slow devices. That's
  set up once in the source template; `verifySite` checks it.
- **Zero JavaScript by default.** Opt-in element scripts (gallery lightbox,
  before/after) are tiny, deferred, and only included on pages that use that
  element.
- **No third-party requests by default.** Video and maps are click-to-load
  facades with local poster images.
- Long-lived cache headers for hashed assets in the source repo's `_headers`.

### Proving it

- **Deterministic budget tests** on every element and preset page: no
  render-blocking external requests, exactly one high-priority image, every
  image AVIF with width, height and `sizes`, JS and inlined CSS under budget,
  no layout-shifting media.
- **PageSpeed Insights** on the pilot site's key pages after each release,
  target 100 on mobile. PSI is the reference rather than local Lighthouse, which
  can report false third-party errors on this network.

## Interface quality bar

The admin must look and feel like professional design software. Clients should
trust it the way they trust Figma, Webflow or Linear. Polish is a release
requirement, not a later phase.

- **A real design system for the admin itself**, extending 2.x's `tokens.css`:
  type scale, 4/8 spacing grid, elevation, radius, one icon set with a
  consistent stroke, a restrained colour palette with one accent.
- **Every control has complete states:** hover, focus-visible, active,
  disabled, loading and error. No unstyled browser defaults anywhere.
- **Motion with purpose:** 150 to 250 ms ease-out for panels, menus and drag;
  drop indicators and drag previews that feel physical; everything respects
  reduced motion.
- **Perceived speed:** skeleton loading instead of spinners, optimistic
  updates, the preview responding within one frame of typing, the admin usable
  within about a second of launch.
- **Keyboard first-class:** shortcuts for common actions, a command palette
  (Ctrl+K) to add elements, jump to pages and run actions, and a shortcut
  cheat sheet.
- **Plain language only in editor mode:** never "node", "props", "schema" or
  "slug". Every message says what happened and what to do next. Destructive
  actions offer undo in a toast instead of an "are you sure?" dialog where
  possible.
- **Designed empty, loading and error states,** with illustrations and helpful
  copy.
- **Layout:** designed for 1280 to 1920 wide screens first, fully usable on a
  laptop, and responsive down to tablet; on a phone, quick text edits only.
- **Design review gate:** each phase ends with a visual review of every new
  screen at 1440 and 1280 wide, against reference screenshots, and a polish
  list that must be cleared before the phase counts as done.

## Migration of existing sites

- The flat `blocks` field type remains supported indefinitely.
- New field type `layout` enables the builder per page or collection. Opt-in.
- **Flexible-page converter:** the pilot site's flexible-page `sections` (and a second site's blocks) become
  `layout` trees; `card1_..card3_` becomes `cards` with `card` items.
- **Pasted-HTML converter (the pilot site's 50 pages):**
  - Maps repeat patterns to elements: `<details>` → FAQ or Glossary, gallery
    and viewer markup → Gallery, card grids, button rows, CTAs, process rows,
    callouts and headings with kickers.
  - Anything it can't map confidently goes into a **Legacy HTML** block that
    keeps rendering exactly as now, including its existing per-page CSS and JS
    from `public/content-assets/`.
  - Writes a report per page: what was converted, what stayed legacy, and any
    content the converter could not place. Nothing is dropped silently.
  - Run locally by the developer. The rendered text and images of each page are
    compared before and after in a real browser, then committed to main.
- As pages are reworked, Legacy HTML blocks and their per-page assets are
  removed. Progress is visible as "N pages still have legacy content".
- Source repos add, once: `<BuilderLayout>`, the clamp token mapping, the brand
  definition and its `brand.json` output, the font setup, `inlineStylesheets`,
  and in `publish-deploy.yml` the engine version step and the `public/media/`
  copy step.
  Per-site `BlockList.astro` and block zod members can then be deleted.
- `verifySite` gains checks: every stored layout loads and migrates, every node
  type is known, every page renders, and engine pins agree.

## Phases

The pilot site leads: it has real, measured demand and the most to gain.

### Phase 1: Core engine (no UI)

- `site-admin/elements` export: tree types, `defineElement`, `defineRender`,
  `html` template, `cls`, transform pipeline, migrations runner, optimiser,
  sanitiser, zod generator.
- Clamp token contract, default token set from `clamp.mjs`, and the element CSS
  lint.
- Brand definition, `brand.json` output and the admin's brand reader.
- Section, Article, Prose, Heading, Image, Buttons, Callout, FAQ.
- AVIF set and WebP fallback generated at upload, media manifest, pruning as a
  unit, and the backfill script for existing uploads.
- Astro host adapter and `<BuilderLayout>`, with AVIF `<picture>` output,
  automatic `sizes` and automatic LCP handling.
- `publish-deploy.yml` version step and media copy step; `verifySite` pin and font
  checks; performance budget tests.

**Done when:** a hand-written YAML layout renders identically in a test Astro
site and in Node, a fake old-version layout migrates on load, a content repo
pin change is picked up by the deploy without touching the source repo, and a
test page built from these elements scores 100 on PageSpeed Insights (mobile).

### Phase 2: Article editor and forms

- `layout` field type in the engine and UI.
- Tiptap article editor with component blocks, `/` menu, strict schema and
  paste normalisation.
- Outline panel (with drag to reorder), schema-generated forms with tabs,
  conditions, token fields, visual selects, items lists and the link field.
- Move up / Move down on every section and item, so reordering never depends
  on dragging.
- Undo/redo and local draft autosave.
- Remaining pilot-driven elements: Table of contents, Byline, Gallery,
  Before/after, Glossary, Steps, Swatches, Related links, CTA band, Service
  area list, Packages.

**Done when:** the pilot client can write a new guide with FAQ, callouts, a gallery and a
CTA without pasting any HTML.

### Phase 3: ChatGPT import and pilot migration

- "Write new content" and "Improve this page" copy-paste prompts, component-tag
  parser, validation and feedback.
- Flexible-page and pasted-HTML converters, Legacy HTML element and reports.
- Migrate the pilot site; remove per-page CSS for fully converted pages.

**Done when:** a ChatGPT-written article imports cleanly with any problems
explained, every pilot page renders its existing content, and the report shows
how much legacy HTML remains.

### Phase 4: Live preview and on-page editing

- Shell fetch and cache, style injection, in-browser render, idiomorph patching.
- Hover and click selection, breadcrumb, device widths.
- Inline text editing and floating toolbars, sibling highlighting.
- Drag sections up and down directly on the page, with a drop indicator and
  animated reflow.

**Done when:** typing updates the preview within one frame with no flicker,
clicking any element selects it, and preview HTML matches the built site's HTML
for the same layout (automated comparison).

### Phase 5: Section mode friendliness

- Add dialog with Sections, Elements and Library tabs.
- About 30 presets in coordinated design sets.
- Page Check.
- sharp focal-point suggestion.
- Hint copy review: every field has a plain-English hint.

**Done when:** a non-developer (the pilot client or another client) builds a five-section
services page from presets in under 15 minutes without help, and Page Check
reports nothing serious.

### Phase 6: Library and roles

- Saved sections, fleet-wide page templates, developer mode, section locking.
- Copy and paste style, Latest from collection, Request an element (email).

### Phase 7: Later

- Global sections, further elements, comments on nodes for client and
  developer review.
- Stock photo search, only if it proves trivial (no keys on client machines).

Every phase also passes the Interface quality bar's design review gate.

## Testing strategy

- **Element tests:** every element and preset with default, placeholder and
  maximal props; html-validate; snapshots; axe in a real browser.
- **Pipeline tests:** migrations per version, optimiser idempotence
  (`save(load(x)) === x`), unknown types preserved untouched.
- **Parity test:** the same layout rendered by the admin and by a real Astro
  build produces identical body HTML (ignoring `data-node`).
- **CSS lint:** element stylesheets contain no pixel type or spacing values and
  no width media queries.
- **Performance tests:** the deterministic budgets in Performance by
  construction, plus PageSpeed Insights on pilot pages after each release.
- **Import tests:** a corpus of real ChatGPT outputs (good, partly wrong,
  hostile) with expected results.
- **Migration tests:** the pilot site's 50 pasted-HTML pages converted, with text and image
  inventories compared before and after.
- **UI tests:** Vitest for components; Playwright (Edge by default) for flows:
  write an article, import from ChatGPT, add a preset, edit inline, reorder,
  undo, save, publish, restore.
- **Usability check:** timed tasks with the pilot client before release.

## Risks

| Risk | Mitigation |
|---|---|
| Preview and build HTML drift apart | Single renderer plus the automated parity test |
| Content and source repos run different engine versions | Content repo pin installed at deploy, `verifySite` check, loud version error |
| Shell fetch fails (offline, Cloudflare bot rules) | Browser User-Agent, cached last good shell, bare-shell fallback |
| Converter loses pilot content | Legacy HTML fallback, per-page reports, before/after comparison in a real browser |
| ChatGPT output keeps finding new edge cases | Validation with clear feedback; recurring requests become new elements |
| Shared markup feels less bespoke per site | Variants and tokens; truly bespoke work stays as site-specific elements |
| Option creep makes the editor YOOtheme-complex | Each client-visible field needs a reason; the rest goes to Advanced |
| Tiptap bundle size | Lazy load per editor; only needed extensions |
| AVIF encoding makes publishes slow | Encoded once at upload and committed; builds never encode images |
| Content repo grows with image variants | Fixed width ladder, AVIF at about q50, pruning as a unit; size measured in phase 1 |
| Inlined CSS grows as elements are added | Per-element CSS and an enforced size budget |
| `brand.json` and the source CSS disagree | Both generated from the same brand definition in the source build |
| Clients delete key structure | Section locking, undo, Git history and restore |

## Licensing

YOOtheme Pro and Nicepage are GPL-licensed; this engine is Apache-2.0. This plan
borrows ideas only. No YOOtheme or Nicepage code, templates, CSS, icons or images
may be copied into this repository.

## Out of scope for 3.0

- Hosting the admin publicly or simultaneous multi-user editing.
- Free positioning on the canvas or per-breakpoint styling for clients.
- Developer code in content repos.
- Interactive tools (calculators, filters); these stay site-specific.
- Animations beyond one "reveal on scroll" option per section.
- E-commerce elements.
- AI provider integrations (API calls from the admin). ChatGPT is supported by
  copy and paste only.
- Built-in stock photo search.
- Client-editable brand settings, colour pickers or font choices.
- Site-specific presets or page templates.

## Decisions made (2026-10-21)

- **Brand** is developer-defined in the source repo and never client-editable;
  editors choose only from the brand's named colours.
- **`clamp()` everywhere** for type and spacing, from clamp-css tokens.
- **Images** are encoded once at upload (AVIF width ladder plus one WebP
  fallback), committed to the content repo with fingerprinted names, and never
  encoded during builds.
- **PageSpeed 100** is a property of the output, verified by tests and PSI, not
  a second pass.
- **ChatGPT** is supported through copy-paste prompts and validated import; no
  AI APIs in 3.0.
- **Stock photos** are dropped from 3.0 unless they prove trivial.
- **Request an element** opens a pre-filled email to `developerEmail`.
- **Presets and page templates** are fleet-wide only.

## Open questions

None outstanding. New questions go here as implementation starts.
