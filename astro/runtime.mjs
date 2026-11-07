// Render side of the Astro adapter, used by <BuilderHead> and <BuilderLayout>.
// Reads everything it needs (media manifest, element CSS, widths) from the
// integration's virtual module, so it works wherever Astro renders a page.

import config from 'virtual:site-admin/astro-config';
import { mediaResolver, renderLayout, structuredDataHtml } from '../elements/index.mjs';

const resolveImage = mediaResolver(config.manifest, { mediaBase: config.mediaBase });

// Head and body render from one result: the same layout object is rendered once per page.
const cache = new WeakMap();

/**
 * Renders a stored layout for a page. Returns:
 *   head      inline <style>, JSON-LD and only the opt-in element scripts this page uses
 *   body      the page body markup
 *   headings  [{ level, text, id }] for a table of contents
 *   problems  render problems (also logged as build warnings by the components)
 * options: resolveLink, renderUnknown (site-specific elements), passed to the renderer.
 */
export function renderPage(layout, options = {}) {
  const key = layout && typeof layout === 'object' ? layout : null;
  if (key && cache.has(key)) return cache.get(key);
  const result = render(layout ?? { children: [] }, options);
  if (key) cache.set(key, result);
  return result;
}

async function render(layout, options) {
  const out = await renderLayout(layout, {
    mode: 'build',
    ...config.widths,
    resolveImage,
    resolveLink: options.resolveLink,
    renderUnknown: options.renderUnknown,
  });
  const css = [config.css.tokens, ...[...new Set(out.css)].sort().map(name => config.css[name] ?? '')].join('\n');
  const scripts = [...new Set(out.scripts || [])]
    .map(name => config.scripts?.[name] || '')
    .filter(Boolean)
    .map(source => `<script type="module" data-ascend-element>${source.replace(/<\/script/gi, '<\\/script')}</script>`)
    .join('');
  return {
    head: `<style data-ascend-builder>${css}</style>${structuredDataHtml(out.structuredData)}${scripts}`,
    body: out.html,
    headings: out.headings,
    problems: out.problems,
  };
}

export const engineVersion = config.engine;
