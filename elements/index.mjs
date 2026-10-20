// site-admin/elements: the page-builder element library.
//
// Runs unchanged in Node (the admin server), the browser (the admin preview,
// via Vite) and Astro builds (the source repo), so it is plain ESM with no
// Node built-ins. Node-only helpers live in ./css.mjs.

import { defaultRegistry } from './library/index.mjs';
import { loadLayout as load, saveLayout as save } from './core/pipeline.mjs';
import { renderLayout as render } from './core/render.mjs';

export { SafeHtml, attrs, cls, escapeHtml, h, raw } from './core/html.mjs';
export { LAYOUT_SCHEMA, newId } from './core/tree.mjs';
export {
  ALIGNMENTS,
  FIELD_TYPES,
  GENERAL_FIELDS,
  HEADING_LEVELS,
  TOKEN_SCALES,
  createRegistry,
  defineElement,
  general,
} from './core/registry.mjs';
export { LayoutVersionError } from './core/pipeline.mjs';
export { richTextToPlain, safeHref, sanitizeRichText } from './core/sanitize.mjs';
export { sizesFor, structuredDataHtml } from './core/render.mjs';
export { layoutSchema } from './core/zod.mjs';
export { builtinElements, defaultRegistry } from './library/index.mjs';

/** Migrates, fills defaults and assigns ids (registry defaults to the fleet library). */
export function loadLayout(layout, registry = defaultRegistry) {
  return load(layout, registry);
}

/** Normalises a layout for storage: { layout, problems }. */
export function saveLayout(layout, registry = defaultRegistry) {
  return save(layout, registry);
}

/** Renders a layout: { html, css, headings, structuredData, problems }. */
export function renderLayout(layout, host = {}, registry = defaultRegistry) {
  return render(layout, host, registry);
}
