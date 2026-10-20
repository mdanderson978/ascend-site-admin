// Load and save stages for layout trees.
//
// load: migrate old layouts up to LAYOUT_SCHEMA, fill defaults, make sure
//       every node has a unique id. Runs in the admin when a page opens and
//       in the site build before rendering.
// save: everything load does, then sanitise rich text, drop empty props and
//       props equal to their default, sort keys, and report problems. The
//       stored file therefore only holds what the editor actually chose, in a
//       stable order, so Git diffs stay small and readable.
//
// Because defaults are dropped on save, CHANGING A DEFAULT IS A SCHEMA
// CHANGE: add a migration that writes the old default onto nodes that don't
// set the prop, or existing pages will silently change appearance.
//
// Unknown element types (a site-specific element, or one from a newer
// engine) are never modified or dropped; they are kept exactly as stored.

import { LAYOUT_SCHEMA, ROOT_TYPE, cloneTree, deepEqual, isPlainObject, newId, normalizeRoot, walk } from './tree.mjs';
import { allowedValues } from './registry.mjs';
import { sanitizeRichText } from './sanitize.mjs';

export class LayoutVersionError extends Error {
  constructor(found, supported = LAYOUT_SCHEMA) {
    super(
      `This page was saved by a newer version of the page builder (layout schema ${found}; ` +
        `this version understands up to ${supported}). Update site-admin to the version ` +
        `the content repo's package.json uses.`,
    );
    this.name = 'LayoutVersionError';
    this.found = found;
  }
}

function migrate(node, registry, from) {
  for (let n = from + 1; n <= registry.schema; n++) {
    registry.migrations[n]?.(node);
    registry.get(node.type)?.migrations[n]?.(node);
  }
}

/** Migrates, fills defaults and assigns ids. Never mutates `input`. */
export function loadLayout(input, registry) {
  const root = normalizeRoot(input);
  const from = Number(root.schema) || 1;
  if (from > registry.schema) throw new LayoutVersionError(from, registry.schema);

  const taken = new Set();
  walk(root.children, node => {
    if (from < registry.schema) migrate(node, registry, from);
    if (typeof node.id !== 'string' || !node.id || taken.has(node.id)) node.id = newId(taken);
    else taken.add(node.id);

    const def = registry.get(node.type);
    if (!def) return false; // unknown: leave it (and everything inside it) as stored
    node.props = isPlainObject(node.props) ? node.props : {};
    for (const [name, value] of Object.entries(def.defaults)) {
      if (node.props[name] === undefined) node.props[name] = cloneTree(value);
    }
    if (def.container && !Array.isArray(node.children)) node.children = [];
  });
  root.schema = registry.schema;
  return root;
}

function isEmpty(value) {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function cleanValue(value, field) {
  if (!field) return value;
  if (field.type === 'richtext') return sanitizeRichText(value, { headings: !!field.headings });
  if ((field.type === 'string' || field.type === 'text') && typeof value === 'string') {
    return field.type === 'string' ? value.trim() : value.replace(/\s+$/, '');
  }
  if (field.type === 'link' && isPlainObject(value)) {
    const link = {};
    for (const [k, v] of Object.entries(value)) if (!isEmpty(typeof v === 'string' ? v.trim() : v)) link[k] = typeof v === 'string' ? v.trim() : v;
    return link;
  }
  return value;
}

function saveNode(node, parentType, registry, problems) {
  const def = registry.get(node.type);
  if (!def) {
    problems.push({ id: node.id, type: node.type, message: `Unknown block type "${node.type}" was kept unchanged.` });
    return cloneTree(node);
  }
  if (parentType && !def.allowedParents.includes(parentType)) {
    problems.push({ id: node.id, type: node.type, message: `A ${def.title} block can't go inside ${parentType === ROOT_TYPE ? 'the page directly' : `a ${registry.get(parentType)?.title || parentType} block`}.` });
  }

  const props = {};
  for (const name of Object.keys(node.props || {}).sort()) {
    const field = def.fields[name];
    const value = cleanValue(node.props[name], field);
    if (isEmpty(value)) continue;
    // An unset boolean means false, so false is only worth storing when it
    // overrides a default of true.
    if (value === false && def.defaults[name] !== true) continue;
    if (field && def.defaults[name] !== undefined && deepEqual(value, def.defaults[name])) continue;
    if (field) {
      const allowed = allowedValues(field);
      if (allowed && !allowed.includes(value)) {
        problems.push({ id: node.id, type: node.type, field: name, message: `"${field.label}" has an unsupported value (${JSON.stringify(value)}); the default is used instead.` });
      }
      if (field.pattern && typeof value === 'string' && !new RegExp(field.pattern).test(value)) {
        problems.push({ id: node.id, type: node.type, field: name, message: `"${field.label}" isn't in the expected format.` });
      }
    }
    props[name] = value;
  }
  for (const [name, field] of Object.entries(def.fields)) {
    if (field.required && props[name] === undefined && def.defaults[name] === undefined) {
      problems.push({ id: node.id, type: node.type, field: name, message: `"${field.label}" is required.` });
    }
  }

  const out = { type: node.type, id: node.id };
  if (Object.keys(props).length) out.props = props;
  if (Array.isArray(node.children) && node.children.length) {
    out.children = node.children.map(child => saveNode(child, def.container ? node.type : null, registry, problems));
  }
  return out;
}

/**
 * Normalises a layout for storage. Returns the layout to write plus a list
 * of problems ({ id, type, field?, message }) for the editor to show.
 * Problems never block saving; the editor decides what blocks Publish.
 */
export function saveLayout(input, registry) {
  const root = loadLayout(input, registry);
  const problems = [];
  const children = root.children.map(node => saveNode(node, ROOT_TYPE, registry, problems));
  return { layout: { schema: registry.schema, children }, problems };
}
