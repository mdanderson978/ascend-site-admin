// Layout tree helpers. A layout is:
//
//   { schema: 1, children: [ node, ... ] }
//   node = { type: 'section', id: 'k3x9a1', props?: {...}, children?: [node] }
//
// The root has no type of its own; it is addressed as 'layout' when an
// element declares which parents it may sit in.

/** Schema number stamped on every saved layout. Bump it only when adding a migration. */
export const LAYOUT_SCHEMA = 1;

export const ROOT_TYPE = 'layout';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A short random node id, unique within `taken`. */
export function newId(taken = new Set()) {
  for (;;) {
    let id = '';
    for (let i = 0; i < 6; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    // Ids are also used in HTML attributes and CSS-free hooks; never start with a digit.
    if (/^[0-9]/.test(id)) continue;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

export function cloneTree(value) {
  return value == null ? value : structuredClone(value);
}

/** Accepts anything a content file might hold and returns a well-formed root. */
export function normalizeRoot(input) {
  const root = input && typeof input === 'object' && !Array.isArray(input) ? cloneTree(input) : {};
  if (Array.isArray(input)) root.children = cloneTree(input);
  if (!Array.isArray(root.children)) root.children = [];
  if (root.schema == null) root.schema = 1;
  return root;
}

/**
 * Depth-first walk in document order. `visit(node, parent, index)` may return
 * false to skip that node's children.
 */
export function walk(nodes, visit, parent = null) {
  (nodes || []).forEach((node, index) => {
    if (!node || typeof node !== 'object') return;
    if (visit(node, parent, index) === false) return;
    if (Array.isArray(node.children)) walk(node.children, visit, node);
  });
}

export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a == null || b == null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}
