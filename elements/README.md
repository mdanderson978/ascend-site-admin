# site-admin/elements

The page-builder element library for Ascend Site Admin 3.0 (see
[V3-PLAN.md](../V3-PLAN.md)). One definition per element drives the editor
form, defaults, migrations and HTML. The same render functions run in the site
build and in the admin preview, so the preview is the real output.

The library is plain ESM (`.mjs` with JSDoc) with no Node built-ins, so it
loads unchanged in Node (the admin), the browser (the admin preview, via Vite)
and Astro builds. Node-only helpers live in `css.mjs`.

## Try it: the playground

```sh
npm run playground                          # http://127.0.0.1:4330
npm run playground -- --photos "C:\photos"   # measure real photos (read in place, never copied)
npm run playground -- --host 0.0.0.0         # reachable on the LAN, e.g. to test on a real phone
```

A local test bench (not shipped in the package). Sample pages render through
this library as the published site and as the editor preview, at phone,
tablet and laptop widths, under several site brands. Edit the layout YAML and
the page re-renders; click anything in the editor preview to find its YAML.
Tabs show the published HTML, what gets saved, problems, the heading outline
and structured data, and the AVIF/WebP sizes. "Open as a real page" serves the
published version on its own, for Lighthouse or a close look. The samples are
also test fixtures (`test/elements/playground.test.mjs`).

## Layout data

Stored in a page's frontmatter under `layout`, written by `saveLayout()`:

```yaml
layout:
  schema: 1
  children:
    - type: section
      id: k3x9a1
      props: { tone: muted }
      children:
        - type: heading
          id: q81mz0
          props: { kicker: What we do, text: Our services }
```

- `schema` is an integer that only changes when a migration is added, so
  engine releases don't rewrite every saved page.
- Only values an editor chose are stored: empty values and defaults are
  dropped and keys are sorted, so re-saving an unchanged page is a no-op.
- Unknown types (a site-specific element, or one from a newer engine) are
  kept exactly as stored.

## API

```js
import { loadLayout, saveLayout, renderLayout, layoutSchema, structuredDataHtml } from 'site-admin/elements';
import { elementCss } from 'site-admin/elements/css'; // Node only

const { layout, problems } = saveLayout(edited);              // before writing to disk
const { html, css, headings, structuredData, problems } = await renderLayout(layout, host);
const styles = elementCss(css);                               // tokens + only the stylesheets used
```

The `host` supplies everything environment-specific:

| Key | Purpose |
|---|---|
| `mode` | `'build'` (default) or `'preview'` (adds `data-node` hooks, placeholders, empty slots) |
| `resolveImage(src)` | `{ width, height, focal?, avif: [{ url, width }], fallback: { url } }`, or `{ url, width, height }` for an image with no AVIF set, or `null` |
| `resolveLink(ref)` | Optional override for link references; return `undefined` to use the defaults |
| `renderUnknown(node)` | Optional renderer for site-specific element types |
| `containerMax` / `wideMax` / `narrowMax` | Content widths in px (default 1200 / 1440 / 760), used to compute `sizes` |

## Building pages in a source repo (Astro)

```js
// astro.config.mjs
import siteAdmin from 'site-admin/astro';

export default defineConfig({
  integrations: [
    siteAdmin({
      brand: {
        colors: { primary: '#1e5631', accent: '#c2410c', dark: '#1a2e1e', light: '#fdf8f0' },
        fonts: { display: 'Fraunces, Georgia, serif', body: 'Inter, system-ui, sans-serif' },
        radius: '12px',
      },
      widths: { containerMax: 1200 },   // match the site's CSS, used for image `sizes`
    }),
  ],
});
```

```astro
---
// src/pages/[...slug].astro (content.config.ts: layout: layoutSchema(z).optional())
import BuilderHead from 'site-admin/astro/BuilderHead.astro';
import BuilderLayout from 'site-admin/astro/BuilderLayout.astro';
const { layout } = entry.data;
---
<BaseLayout title={entry.data.title}>
  <BuilderHead slot="head" layout={layout} />
  <BuilderLayout layout={layout} />
</BaseLayout>
```

The integration:

- inlines every stylesheet; each builder page carries only the (minified) CSS
  for the elements it uses
- applies the brand's CSS variables to every page, in `@layer ascend-brand`,
  so the site's own CSS wins
- serves the WebP fallbacks in `astro dev` and copies them into the build
- writes `/_ascend/brand.json`, which the admin reads (`GET /api/brand`)
- runs `checkPage()` on every builder page and prints problems as warnings;
  `strict: true` fails the build instead, `budget: false` turns it off

The content repo's `publish-deploy.yml` needs two steps (in the split-repo
setup template): copy `public/media/` into the build, and install the
content repo's `site-admin` version into the source checkout, so the
content repo's pin decides the engine version.

### Brand

`defineBrand()` takes up to 5 named colours. Each gets 7 shades in OKLCH
(`--ab-color-<name>-100` lightest to `-700` darkest) and the base value
(`--ab-color-<name>`). Roles (`brand`, `brandInk`, `accent`, `ink`, `bg`,
`surface`, `muted`) default from the names `primary`, `accent`, `dark` and
`light`; set `roles` to a colour name, a shade (`primary-600`) or a hex value
to choose them yourself. `brand.json` lists, for each section tone, which
colours pass WCAG AA there (`text`: 4.5:1, `large`: 3:1), so editors are
never offered an unreadable choice, and `problems` lists any role pair in
the brand itself that fails.

## Images: the media manifest

With `media: { avif: true }` in a site's `admin.config.mjs`, every upload is
encoded once, at upload time, into an AVIF width ladder in `public/media/`,
recorded in `public/media/manifest.json` and committed with the content.
Builds never encode images.

```js
import { mediaResolver } from 'site-admin/elements';
import { readManifest, copyFallbacks } from 'site-admin/media'; // Node only

const host = { resolveImage: mediaResolver(readManifest(contentRoot)) };
copyFallbacks(contentRoot, 'dist/media'); // build step: the WebP fallbacks are the uploads, copied
```

From a content repo: `npx site-admin-media backfill` (encode existing
uploads, or re-encode after a settings change), `prune`, `stats`.

## Adding an element

An element is a folder in `library/` with `element.mjs` and `style.css`,
registered in `library/index.mjs`.

1. **Define it with `defineElement()`.** Fields, defaults, tabs, an `ai`
   description (used to generate the ChatGPT prompt) and `allowedParents`.
   Definitions are validated at boot. `anchor`, `hidden` and `label` are added
   to every element automatically and are reserved names.
2. **Render with `h`.** `render(api)` returns `` h`...` `` (escaped by
   default); returning a plain string throws. Return `null` when there is
   nothing to show: empty elements never reach a published page.
3. **Use the api, not hand-written markup, for the cross-cutting rules:**
   `root()` for the root tag's attributes (anchor id and preview hooks),
   `picture(field, { alt })` for every image (AVIF, `sizes`, LCP priority),
   `richText()` for rich text, `headingId()` for headings, `link()` for links,
   `collect()` for structured data, `problem()` to report an issue.
4. **Style with tokens only.** Wrap the file in `@layer ascend-elements`.
   Font sizes, margins, padding and gaps use only `--ab-*` tokens (all
   `clamp()`); colours use brand roles (`--ab-tone-*`); layout changes use
   container queries. The CSS lint test enforces this.
5. **Add a `MAXIMAL` fixture** in `test/elements/render.test.mjs`. The test
   suite fails until you do, then validates the element's HTML in build and
   preview mode.

## Changing an element later

Because defaults are not stored, **changing a default is a schema change**.
Bump `LAYOUT_SCHEMA` in `core/tree.mjs` and add a migration (keyed by the new
schema number) that writes the old default onto nodes that don't set the prop.
The same applies to renaming a prop or a type (use a registry-wide migration
for type renames). Migrations run when a layout loads, in the admin and in
the site build, so old content is never broken.
