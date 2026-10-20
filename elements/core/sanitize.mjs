// Schema-bound rich text. Whatever arrives (an editor's own typing, a paste
// from Word or Google Docs, ChatGPT output), only this survives:
//
//   blocks:  <p>, <ul>/<ol> with <li>, and <h2>/<h3> when headings are allowed
//   inline:  <strong>, <em>, <a href>, <br>
//
// Everything else is unwrapped (its text kept) or, for scripts, styles,
// embeds and media, dropped with its content. No attributes survive except a
// validated href. Stray inline text is wrapped in <p>. Because the output
// shape is fixed, the same input always produces the same HTML, and a second
// pass changes nothing.

import { parseFragment } from 'parse5';
import { escapeHtml } from './html.mjs';

const DROP = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math',
  'head', 'title', 'meta', 'link', 'base', 'img', 'picture', 'video', 'audio', 'source',
  'track', 'canvas', 'map', 'area', 'form', 'input', 'button', 'select', 'option',
  'textarea', 'frame', 'frameset', 'dialog', 'slot',
]);

// Containers whose children are block content: unwrap and keep their blocks.
const BLOCK_UNWRAP = new Set([
  'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'blockquote',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'dl', 'dt', 'dd', 'pre', 'address', 'details', 'summary', 'center', 'fieldset', 'legend',
  'hgroup', 'body', 'html',
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LISTS = new Set(['ul', 'ol']);

/** Returns a safe href, or null when the value must not be linked. */
export function safeHref(value) {
  const href = String(value ?? '').trim();
  if (!href) return null;
  // Browsers ignore control characters and whitespace inside a scheme
  // ("java\tscript:"), so detect the scheme with them removed.
  const probe = href.replace(/[\u0000- \u007f]/g, '').toLowerCase();
  if (/^(https?:|mailto:|tel:)/.test(probe)) return href;
  if (probe.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/.test(probe)) return null; // javascript:, data:, vbscript:, ...
  return href; // relative path, #anchor or ?query
}

function trimInline(html) {
  let out = html.replace(/^(?:\s| |<br>)+/, '').replace(/(?:\s| |<br>)+$/, '');
  return out;
}

function headingTag(name, opts) {
  if (!opts.headings) return null;
  return name === 'h1' || name === 'h2' ? 'h2' : 'h3';
}

function inlineChildren(nodes, opts) {
  let out = '';
  for (const node of nodes || []) out += inlineNode(node, opts);
  return out;
}

function inlineNode(node, opts) {
  const name = node.nodeName;
  // Collapse source formatting (newlines, indentation) the way a browser
  // would; non-breaking spaces are deliberate and kept.
  if (name === '#text') return escapeHtml(node.value.replace(/[ \t\n\r\f]+/g, ' '));
  if (name === '#comment' || DROP.has(name)) return '';
  if (name === 'br') return '<br>';
  if (name === 'strong' || name === 'b' || name === 'em' || name === 'i') {
    const tag = name === 'b' || name === 'strong' ? 'strong' : 'em';
    const inner = inlineChildren(node.childNodes, opts);
    return trimInline(inner) ? `<${tag}>${inner}</${tag}>` : inner;
  }
  if (name === 'a') {
    const inner = inlineChildren(node.childNodes, opts);
    const href = safeHref(node.attrs?.find(a => a.name === 'href')?.value);
    if (!href || !trimInline(inner)) return inner;
    // A phone number must never wrap mid-number. Inline tags here carry no
    // attributes, so every space in `inner` is text.
    const text = /^tel:/i.test(href) ? inner.replace(/ /g, ' ') : inner;
    return `<a href="${escapeHtml(href)}">${text}</a>`;
  }
  if (name === 'p' || HEADINGS.has(name) || LISTS.has(name) || name === 'li' || BLOCK_UNWRAP.has(name)) {
    // A block inside inline content: keep its text, separated by a space.
    const inner = inlineChildren(node.childNodes, opts);
    return inner ? ` ${inner} ` : '';
  }
  return inlineChildren(node.childNodes, opts); // span, u, font, code, mark, ...
}

function listItems(listNode, opts) {
  let out = '';
  for (const child of listNode.childNodes || []) {
    if (child.nodeName === '#text' && !child.value.trim()) continue;
    const content = child.nodeName === 'li' ? itemContent(child.childNodes, opts) : itemContent([child], opts);
    if (content) out += `<li>${content}</li>`;
  }
  return out;
}

// List item content: inline text plus nested lists. Paragraphs inside an item
// (how most editors store list items) are unwrapped to inline text.
function itemContent(nodes, opts) {
  let out = '';
  let text = '';
  const flushText = () => {
    const t = trimInline(text.replace(/\s+/g, ' '));
    if (t) out += (out ? ' ' : '') + t;
    text = '';
  };
  for (const node of nodes) {
    const name = node.nodeName;
    if (LISTS.has(name)) {
      flushText();
      const items = listItems(node, opts);
      if (items) out += `<${name}>${items}</${name}>`;
    } else if (name === 'p' || HEADINGS.has(name) || BLOCK_UNWRAP.has(name) || name === 'li') {
      flushText();
      const inner = itemContent(node.childNodes, opts);
      if (inner) out += (out ? ' ' : '') + inner;
    } else {
      text += inlineNode(node, opts);
    }
  }
  flushText();
  return out;
}

function blockChildren(nodes, opts, out) {
  let inline = '';
  const flush = () => {
    const t = trimInline(inline);
    if (t) out.push(`<p>${t}</p>`);
    inline = '';
  };
  for (const node of nodes || []) {
    const name = node.nodeName;
    if (name === '#comment' || DROP.has(name)) continue;
    if (name === 'p') {
      flush();
      const t = trimInline(inlineChildren(node.childNodes, opts));
      if (t) out.push(`<p>${t}</p>`);
    } else if (HEADINGS.has(name)) {
      flush();
      const t = trimInline(inlineChildren(node.childNodes, opts));
      const tag = headingTag(name, opts);
      if (t) out.push(tag ? `<${tag}>${t}</${tag}>` : `<p><strong>${t}</strong></p>`);
    } else if (LISTS.has(name)) {
      flush();
      const items = listItems(node, opts);
      if (items) out.push(`<${name}>${items}</${name}>`);
    } else if (BLOCK_UNWRAP.has(name) || name === 'li') {
      flush();
      blockChildren(node.childNodes, opts, out);
    } else {
      inline += inlineNode(node, opts);
    }
  }
  flush();
  return out;
}

/**
 * Sanitises rich text to the fixed schema above.
 * @param {string} html
 * @param {{ headings?: boolean }} [options] headings: allow <h2>/<h3> (article prose only)
 */
export function sanitizeRichText(html, { headings = false } = {}) {
  if (html == null || html === '') return '';
  const fragment = parseFragment(String(html));
  return blockChildren(fragment.childNodes, { headings }, []).join('');
}

/** Plain text of a rich-text string (for summaries and outline labels). */
export function richTextToPlain(html) {
  const fragment = parseFragment(String(html ?? ''));
  const parts = [];
  const visit = node => {
    if (node.nodeName === '#text') parts.push(node.value);
    else if (!DROP.has(node.nodeName)) (node.childNodes || []).forEach(visit);
    if (node.nodeName === 'p' || node.nodeName === 'li' || HEADINGS.has(node.nodeName) || node.nodeName === 'br') parts.push(' ');
  };
  fragment.childNodes.forEach(visit);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
