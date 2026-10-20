// HTML building blocks for element renderers.
//
// Every element renders through the `h` tagged template. Interpolated values
// are HTML-escaped unless they are themselves SafeHtml (the result of another
// h`` call, or raw() for HTML that has already been sanitised). That makes
// "forgot to escape a client's text" impossible by default, which matters
// because the same render functions run in the admin preview and in the
// site build.

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** Marks an already-safe HTML string (e.g. sanitised rich text) as trusted. */
export function raw(value) {
  return new SafeHtml(value == null ? '' : String(value));
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

function piece(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(piece).join('');
  return escapeHtml(value);
}

/** Escaping tagged template: h`<p>${text}</p>` → SafeHtml. */
export function h(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += piece(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/**
 * Class list builder. Accepts strings, arrays and { className: condition }
 * objects; falsy entries are skipped and duplicates removed.
 *   cls('ab-heading', { 'ab-heading--xl': size === 'xl' }) → "ab-heading ab-heading--xl"
 */
export function cls(...args) {
  const out = [];
  const add = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(add);
    if (typeof value === 'object') {
      for (const [name, on] of Object.entries(value)) if (on) out.push(name);
      return;
    }
    for (const name of String(value).split(/\s+/)) if (name) out.push(name);
  };
  args.forEach(add);
  return [...new Set(out)].join(' ');
}

/**
 * Attribute string builder: attrs({ class: 'a', hidden: true, href: null })
 * → SafeHtml(' class="a" hidden'). null/undefined/false are omitted, true
 * renders a bare attribute, everything else is escaped.
 */
export function attrs(map) {
  let out = '';
  for (const [name, value] of Object.entries(map)) {
    if (value == null || value === false || value === '') continue;
    if (!/^[a-z][a-z0-9:_-]*$/i.test(name)) throw new Error(`Invalid attribute name "${name}"`);
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`;
  }
  return new SafeHtml(out);
}
