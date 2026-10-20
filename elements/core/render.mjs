// Renders a layout tree to HTML. The same function runs in the site build
// (host.mode 'build') and in the admin preview (host.mode 'preview'), which
// is what makes the preview the real output.
//
// The host supplies everything environment-specific:
//   mode           'build' | 'preview'
//   resolveImage   async (src) => { width, height, focal?, avif: [{ url, width }], fallback: { url } }
//                  or { url, width, height } for an image with no AVIF set yet, or null
//   resolveLink    (ref) => href | undefined   (undefined falls back to the defaults below)
//   renderUnknown  async (node) => html | null  (site-specific elements in the source repo)
//   containerMax / wideMax / narrowMax          px widths used to compute `sizes`
//
// Cross-cutting rules live here rather than in each element:
//   - hidden blocks are skipped; empty containers collapse (shown as a slot in preview)
//   - exactly one LCP image: the first image in the first visible section
//   - `sizes` comes from where the image sits, never hand-written
//   - heading and anchor ids are unique across the page
//   - FAQ entries from every FAQ block become one FAQPage JSON-LD object

import { parseFragment, serialize } from 'parse5';
import { attrs, cls, h, raw, SafeHtml } from './html.mjs';
import { loadLayout } from './pipeline.mjs';
import { safeHref, sanitizeRichText } from './sanitize.mjs';
import { ROOT_TYPE, cloneTree, walk } from './tree.mjs';

const DEFAULT_HOST = { mode: 'build', containerMax: 1200, wideMax: 1440, narrowMax: 760 };

function slugify(text) {
  const slug = String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  if (!slug) return 'section';
  return /^[0-9]/.test(slug) ? `h-${slug}` : slug;
}

// Decoded text of a parse5 node ("Café & more", not "Caf&eacute; &amp; more").
function textContent(node) {
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes || []).map(textContent).join('');
}

function uniqueId(base, state) {
  let id = base;
  for (let n = 2; state.ids.has(id); n++) id = `${base}-${n}`;
  state.ids.add(id);
  return id;
}

function isFilled(value) {
  return !(value == null || value === '' || value === false || (Array.isArray(value) && !value.length));
}

function round(n, places = 0) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** `sizes` for an image occupying `fraction` of a container capped at `max` px (null = full bleed). */
export function sizesFor({ max, fraction = 1 }) {
  if (max == null) return fraction === 1 ? '100vw' : `${round(fraction * 100, 2)}vw`;
  const atMax = Math.round(max * fraction);
  const fluid = fraction === 1 ? 'calc(100vw - 2rem)' : `calc((100vw - 2rem) * ${round(fraction, 4)})`;
  return `(min-width: ${max + 64}px) ${atMax}px, ${fluid}`;
}

function defaultLink(ref) {
  if (typeof ref === 'string') return safeHref(ref);
  if (!ref || typeof ref !== 'object') return null;
  const hash = ref.anchor ? `#${String(ref.anchor).replace(/^#/, '')}` : '';
  if (ref.page != null) {
    const page = String(ref.page).replace(/^\/+|\/+$/g, '');
    return (page === '' || page === 'home' ? '/' : `/${page}/`) + hash;
  }
  if (ref.url) return safeHref(ref.url);
  if (ref.tel) return `tel:${String(ref.tel).replace(/[^\d+]/g, '')}`;
  if (ref.email) return safeHref(`mailto:${String(ref.email).trim()}`);
  if (ref.document) return `/documents/${encodeURIComponent(ref.document)}`;
  return hash || null;
}

// Reserve every explicit anchor first, so generated heading ids never take a
// name an editor chose on purpose.
function reserveAnchors(layout, registry, state) {
  walk(layout.children, node => {
    const def = registry.get(node.type);
    if (!def) return false;
    if (node.props?.anchor) {
      if (state.ids.has(node.props.anchor)) {
        state.problems.push({ id: node.id, type: node.type, field: 'anchor', message: `The anchor name "${node.props.anchor}" is used more than once on this page.` });
      }
      state.ids.add(node.props.anchor);
    }
  });
}

// The LCP candidate: the first filled image field, in document order, inside
// the first visible top-level block.
function findLcp(layout, registry) {
  const first = layout.children.find(node => {
    const def = registry.get(node.type);
    return def && !node.props?.hidden;
  });
  if (!first) return null;
  let found = null;
  walk([first], node => {
    if (found) return false;
    const def = registry.get(node.type);
    if (!def || node.props?.hidden) return false;
    for (const [name, field] of Object.entries(def.fields)) {
      if (field.type === 'image' && isFilled(node.props?.[name])) {
        found = { id: node.id, field: name };
        return false;
      }
    }
  });
  return found;
}

function withDefaults(node, registry) {
  const def = registry.get(node.type);
  return def ? { ...node, props: { ...cloneTree(def.defaults), ...(node.props || {}) } } : node;
}

function placeholderProps(def, props) {
  const out = { ...props };
  let used = false;
  for (const [name, value] of Object.entries(def.placeholder?.props || {})) {
    if (!isFilled(out[name])) {
      out[name] = value;
      used = true;
    }
  }
  return { props: out, used };
}

async function renderNodes(nodes, ctx, env) {
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const html = await renderNode(nodes[i], { ...ctx, index: i }, env);
    if (html) out += html.value;
  }
  return raw(out);
}

async function renderNode(node, ctx, env) {
  const { registry, host, state } = env;
  const preview = host.mode === 'preview';
  const def = registry.get(node.type);

  if (!def) {
    if (host.renderUnknown) {
      const out = await host.renderUnknown(node, { parentType: ctx.parentType });
      if (out != null) return out instanceof SafeHtml ? out : raw(out);
    }
    state.problems.push({ id: node.id, type: node.type, message: `No renderer for block type "${node.type}".` });
    return preview ? h`<div class="ab-empty-slot" data-node="${node.id}">${node.type} (site-specific block)</div>` : null;
  }
  if (node.props?.hidden) return null;
  if (ctx.parentType && !def.allowedParents.includes(ctx.parentType)) {
    state.problems.push({ id: node.id, type: node.type, message: `A ${def.title} block is in a place it isn't designed for.` });
  }

  const ph = preview ? placeholderProps(def, node.props || {}) : { props: { ...(node.props || {}) }, used: false };
  if (node.placeholder) ph.used = true;
  const props = ph.props;
  const selectable = preview && !node.placeholder;

  let children = raw('');
  let firstHeadingId = null;
  if (def.container) {
    const extra = def.childContext ? def.childContext(props, ctx, host) || {} : {};
    const childCtx = { ...ctx, ...extra, parentType: node.type, depth: ctx.depth + 1 };
    let kids = Array.isArray(node.children) ? node.children : [];
    if (!kids.length && preview && def.placeholder?.children) {
      // Sample children aren't real nodes: no data-node, so a click in the
      // preview selects the real container instead.
      kids = def.placeholder.children.map((child, i) => ({
        ...withDefaults({ id: `${node.id}-ph${i}`, ...cloneTree(child) }, registry),
        placeholder: true,
      }));
    }
    state.headingFrames.push([]);
    children = await renderNodes(kids, childCtx, env);
    firstHeadingId = state.headingFrames.pop()[0] || null;
    if (!children.value.trim()) {
      if (preview) children = h`<div class="ab-empty-slot">Empty ${def.title.toLowerCase()}: add something here</div>`;
      else if (!def.keepEmpty?.(props)) return null;
    }
  }

  if (def.css) state.css.add(def.css);

  const api = {
    node,
    props,
    def,
    host,
    mode: host.mode,
    preview,
    isPlaceholder: ph.used,
    ctx,
    children,
    firstHeadingId,
    h,
    raw,
    cls,
    attrs,
    /**
     * Attributes for the element's root tag: anchor id and preview hooks
     * included. Pass { anchor: false } when the anchor id belongs on an inner
     * tag instead (e.g. a heading inside a wrapper), so it isn't duplicated.
     */
    root(map = {}, { anchor = true } = {}) {
      return attrs({
        ...map,
        id: (anchor && props.anchor) || map.id || null,
        'data-node': selectable ? node.id : null,
        'data-element': selectable ? node.type : null,
      });
    },
    /** Id for a heading this element renders; registers it for aria-labelledby and the outline. */
    headingId(text) {
      const id = props.anchor || uniqueId(slugify(text), state);
      const frame = state.headingFrames[state.headingFrames.length - 1];
      if (frame) frame.push(id);
      return id;
    },
    link(ref) {
      if (!ref) return null;
      const custom = host.resolveLink?.(ref);
      return custom !== undefined ? custom : defaultLink(ref);
    },
    /** Sanitised rich text; with headings, H2/H3 get unique ids and join the page outline. */
    richText(html, { headings = false } = {}) {
      const clean = sanitizeRichText(html, { headings });
      if (!headings || !/<h[23]>/.test(clean)) return raw(clean);
      const fragment = parseFragment(clean);
      for (const child of fragment.childNodes) {
        if (child.nodeName !== 'h2' && child.nodeName !== 'h3') continue;
        const text = textContent(child).replace(/\s+/g, ' ').trim();
        const id = uniqueId(slugify(text), state);
        child.attrs.push({ name: 'id', value: id });
        state.headings.push({ level: Number(child.nodeName[1]), text, id });
      }
      return raw(serialize(fragment));
    },
    /**
     * <picture> for an image field: AVIF srcset, WebP fallback, intrinsic
     * width/height, automatic sizes and LCP priority.
     *   options: alt, decorative, sizes (override), className, focal ({ x, y } percentages)
     */
    async picture(field, options = {}) {
      const src = props[field];
      if (!isFilled(src)) return null;
      const info = await host.resolveImage?.(src);
      if (!info) {
        state.problems.push({ id: node.id, type: node.type, field, message: `The image "${src}" couldn't be found.` });
        return null;
      }
      const alt = options.decorative ? '' : String(options.alt ?? '').trim();
      if (!options.decorative && !alt) {
        state.problems.push({ id: node.id, type: node.type, field, message: 'An image is missing its description (alt text).' });
      }
      const isLcp = !!(state.lcp && state.lcp.id === node.id && state.lcp.field === field);
      const sizes = options.sizes || sizesFor(ctx.width || { max: host.containerMax });
      const focal = options.focal || info.focal;
      const imgAttrs = attrs({
        class: options.className || null,
        src: info.fallback?.url || info.url,
        alt: alt || '',
        width: info.width || null,
        height: info.height || null,
        loading: isLcp ? 'eager' : 'lazy',
        fetchpriority: isLcp ? 'high' : null,
        decoding: isLcp ? null : 'async',
        style: focal ? `--ab-focal: ${round(focal.x, 1)}% ${round(focal.y, 1)}%` : null,
      });
      // attrs() omits empty values, but alt="" is meaningful for decorative images.
      const altFix = alt ? '' : ' alt=""';
      if (!info.avif?.length) return h`<img${imgAttrs}${raw(altFix)}>`;
      const srcset = info.avif.map(s => `${s.url} ${s.width}w`).join(', ');
      return h`<picture><source type="image/avif" srcset="${srcset}" sizes="${sizes}"><img${imgAttrs}${raw(altFix)}></picture>`;
    },
    /** Adds structured-data entries (e.g. FAQ questions) for the page. */
    collect(kind, entry) {
      (state.collected[kind] ||= []).push(entry);
    },
    problem(message, field) {
      state.problems.push({ id: node.id, type: node.type, field, message });
    },
  };

  const out = await def.render(api);
  if (out == null || out === '') {
    return preview ? h`<div class="ab-empty-slot" data-node="${node.id}">Empty ${def.title.toLowerCase()}</div>` : null;
  }
  if (!(out instanceof SafeHtml)) {
    throw new Error(`site-admin elements: "${def.name}" render() must return h\`...\` (SafeHtml), not a plain string`);
  }
  return out;
}

function buildStructuredData(state) {
  const data = [];
  const faqs = state.collected.faq || [];
  if (faqs.length) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    });
  }
  return data;
}

/** One <script type="application/ld+json"> per structured-data object, safe to inline. */
export function structuredDataHtml(data) {
  return (data || [])
    .map(obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`)
    .join('');
}

/**
 * Renders a layout. Returns:
 *   html            the page body markup
 *   css             element stylesheet names used (see css.mjs)
 *   headings        [{ level, text, id }] from article prose, for a table of contents
 *   structuredData  JSON-LD objects (write once per page with structuredDataHtml)
 *   problems        [{ id, type, field?, message }] found while rendering
 */
export async function renderLayout(input, host, registry) {
  if (!registry) throw new Error('site-admin elements: renderLayout() needs a registry');
  const fullHost = { ...DEFAULT_HOST, ...(host || {}) };
  const layout = loadLayout(input, registry);
  const state = {
    ids: new Set(),
    css: new Set(),
    headings: [],
    headingFrames: [],
    collected: {},
    problems: [],
    lcp: null,
  };
  reserveAnchors(layout, registry, state);
  state.lcp = findLcp(layout, registry);
  const ctx = { parentType: ROOT_TYPE, depth: 0, width: { max: fullHost.containerMax, fraction: 1 } };
  const html = await renderNodes(layout.children, ctx, { registry, host: fullHost, state });
  return {
    html: html.value,
    css: [...state.css],
    headings: state.headings,
    structuredData: buildStructuredData(state),
    problems: state.problems,
  };
}
