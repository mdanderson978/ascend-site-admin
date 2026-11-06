// Performance budget: deterministic checks on a finished HTML page, so
// "PageSpeed 100" is a property of the output rather than a later audit.
// Used by the Astro integration on every builder page at build time and by
// the engine's own tests. Browser-safe (parse5 only).
//
// Rules (each problem has a `rule` id so a site can see what failed):
//   render-blocking   external stylesheets, or head scripts without async/defer/module
//   third-party-font  fonts from Google's CDN or another origin (fonts are self-hosted)
//   font-display      @font-face without font-display: optional, or not woff2
//   font-preload      a font preload that isn't woff2 with crossorigin
//   lcp               more than one fetchpriority="high" image, or a high one that is lazy
//   image-size        an <img> without width and height
//   image-avif        a builder image without an AVIF <source> carrying srcset and sizes
//   media-size        an <iframe> or <video> without width and height
//   css-budget        inline CSS over budget
//   js-budget         inline JavaScript over budget

import { parse } from 'parse5';

export const DEFAULT_BUDGET = Object.freeze({
  // Measured 2026-10-21: the pilot site's global stylesheet is 44 KB and
  // every built-in element plus tokens is 16 KB before minifying (the
  // per-page CSS the pilot adds today, up to 27 KB, is what the elements
  // replace). 80 KB leaves room for the phase 2 elements.
  css: 80 * 1024,
  js: 20 * 1024,
});

const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value ?? null;
const has = (node, name) => node.attrs?.some(a => a.name === name) ?? false;

function* walk(node, ancestors = []) {
  for (const child of node.childNodes || []) {
    yield [child, ancestors];
    if (child.nodeName === 'template') continue;
    yield* walk(child, [...ancestors, child]);
  }
  if (node.content) yield* walk(node.content, [...ancestors, node]);
}

const text = node => (node.childNodes || []).map(c => (c.nodeName === '#text' ? c.value : text(c))).join('');
const bytes = s => new TextEncoder().encode(s).length;
const isExternal = url => /^(https?:)?\/\//i.test(url || '');
const isBuilderImage = ancestors => ancestors.some(a => /(^|\s)ab-/.test(attr(a, 'class') || ''));
const describe = img => (attr(img, 'src') || '(no src)').slice(0, 80);

function fontProblems(css, problems) {
  for (const match of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const body = match[1];
    const family = /font-family\s*:\s*([^;]+)/.exec(body)?.[1].trim() || 'a font';
    const display = /font-display\s*:\s*([a-z-]+)/.exec(body)?.[1];
    if (display !== 'optional') {
      problems.push({ rule: 'font-display', message: `${family} uses font-display: ${display || 'auto'}; use optional so text never visibly swaps.` });
    }
    const urls = [...body.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(m => m[1]);
    if (urls.some(isExternal)) problems.push({ rule: 'third-party-font', message: `${family} loads from another site; self-host it.` });
    if (urls.length && !urls.every(u => /\.woff2(\?|#|$)/i.test(u))) {
      problems.push({ rule: 'font-display', message: `${family} has a source that isn't woff2; ship woff2 only.` });
    }
  }
}

/**
 * Checks one page. Returns { problems: [{ rule, message }], stats }.
 * `budget` overrides DEFAULT_BUDGET's byte limits.
 */
export function checkPage(html, budget = {}) {
  const limits = { ...DEFAULT_BUDGET, ...budget };
  const doc = parse(html);
  const problems = [];
  const stats = { css: 0, js: 0, images: 0, highPriority: 0, fonts: 0 };
  let inlineCss = '';

  for (const [node, ancestors] of walk(doc)) {
    const inHead = ancestors.some(a => a.nodeName === 'head');
    switch (node.nodeName) {
      case 'link': {
        const rel = (attr(node, 'rel') || '').toLowerCase().split(/\s+/);
        const href = attr(node, 'href') || '';
        if (rel.includes('stylesheet')) {
          if (/fonts\.(googleapis|gstatic)\.com/i.test(href)) problems.push({ rule: 'third-party-font', message: `Google Fonts stylesheet (${href}); self-host the fonts.` });
          else problems.push({ rule: 'render-blocking', message: `External stylesheet ${href}; stylesheets should be inlined.` });
        }
        if (rel.includes('preload') && attr(node, 'as') === 'font') {
          stats.fonts++;
          if (!/\.woff2(\?|#|$)/i.test(href) || !has(node, 'crossorigin')) {
            problems.push({ rule: 'font-preload', message: `Font preload ${href} needs to be a woff2 file with crossorigin.` });
          }
        }
        break;
      }
      case 'style':
        inlineCss += text(node);
        break;
      case 'script': {
        const type = (attr(node, 'type') || '').toLowerCase();
        if (type === 'application/ld+json' || type === 'application/json') break;
        if (has(node, 'src')) {
          const deferred = has(node, 'async') || has(node, 'defer') || type === 'module';
          if (inHead && !deferred) problems.push({ rule: 'render-blocking', message: `Script ${attr(node, 'src')} blocks rendering; add defer.` });
        } else {
          stats.js += bytes(text(node));
        }
        break;
      }
      case 'img': {
        stats.images++;
        const priority = (attr(node, 'fetchpriority') || '').toLowerCase() === 'high';
        if (priority) {
          stats.highPriority++;
          if ((attr(node, 'loading') || '').toLowerCase() === 'lazy') {
            problems.push({ rule: 'lcp', message: `The high-priority image ${describe(node)} is lazy-loaded; it must load eagerly.` });
          }
        }
        if (!has(node, 'width') || !has(node, 'height')) {
          problems.push({ rule: 'image-size', message: `Image ${describe(node)} has no width and height, so the page shifts as it loads.` });
        }
        const parent = ancestors[ancestors.length - 1];
        if (isBuilderImage(ancestors) && !/\.svg(\?|#|$)/i.test(attr(node, 'src') || '')) {
          const avif = parent?.nodeName === 'picture'
            ? parent.childNodes.find(c => c.nodeName === 'source' && attr(c, 'type') === 'image/avif')
            : null;
          if (!avif) problems.push({ rule: 'image-avif', message: `Image ${describe(node)} has no AVIF version. Run npx site-admin-media backfill in the content repo.` });
          else if (!attr(avif, 'srcset') || !attr(avif, 'sizes')) problems.push({ rule: 'image-avif', message: `Image ${describe(node)} has an AVIF source without srcset and sizes.` });
        }
        break;
      }
      case 'iframe':
      case 'video':
        if (!has(node, 'width') || !has(node, 'height')) {
          problems.push({ rule: 'media-size', message: `A <${node.nodeName}> has no width and height, so the page shifts as it loads.` });
        }
        break;
    }
  }

  if (stats.highPriority > 1) {
    problems.push({ rule: 'lcp', message: `${stats.highPriority} images are marked high priority; only the main (first) image should be.` });
  }
  fontProblems(inlineCss, problems);
  stats.css = bytes(inlineCss);
  if (stats.css > limits.css) {
    problems.push({ rule: 'css-budget', message: `Inline CSS is ${Math.round(stats.css / 1024)} KB, over the ${Math.round(limits.css / 1024)} KB budget.` });
  }
  if (stats.js > limits.js) {
    problems.push({ rule: 'js-budget', message: `Inline JavaScript is ${Math.round(stats.js / 1024)} KB, over the ${Math.round(limits.js / 1024)} KB budget.` });
  }
  return { problems, stats };
}
