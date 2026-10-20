// Element definitions and the registry that holds them.
//
// An element is one plain object (see defineElement) that is the single
// source of truth for its editor form, its defaults, its migrations and its
// HTML. The admin builds forms from `fields`/`tabs`; the renderer calls
// `render`; the ChatGPT prompt is generated from `ai` and `fields`.
// Definitions are validated when they are defined, so a mistake fails at
// boot instead of at a client's first save.

import { LAYOUT_SCHEMA, ROOT_TYPE } from './tree.mjs';

export const FIELD_TYPES = new Set([
  'string', // single line of plain text
  'text', // multi-line plain text
  'richtext', // schema-bound rich text (see sanitize.mjs); { headings: true } allows H2/H3
  'image', // an upload path; rendered through the core picture() helper
  'link', // a link reference: { page } | { url } | { tel } | { email } | { anchor } | { document }
  'select', // one of `options`
  'token', // one of a design-token scale (see TOKEN_SCALES)
  'align', // start | center
  'heading-level', // h2 | h3 | h4 (h1 belongs to the page template)
  'boolean',
]);

// Design-token scales. Editors only ever choose from these names; the CSS
// maps each name to a clamp() token (sizes, spacing) or a brand colour role.
export const TOKEN_SCALES = {
  tone: [
    { value: 'default', label: 'Plain' },
    { value: 'muted', label: 'Soft' },
    { value: 'brand', label: 'Brand colour' },
    { value: 'dark', label: 'Dark' },
  ],
  type: [
    { value: 's', label: 'Small' },
    { value: 'm', label: 'Medium' },
    { value: 'l', label: 'Large' },
    { value: 'xl', label: 'Extra large' },
    { value: 'display', label: 'Hero' },
  ],
  space: [
    { value: 's', label: 'Small' },
    { value: 'm', label: 'Medium' },
    { value: 'l', label: 'Large' },
    { value: 'xl', label: 'Extra large' },
  ],
  width: [
    { value: 'narrow', label: 'Narrow (reading width)' },
    { value: 'default', label: 'Standard' },
    { value: 'wide', label: 'Wide' },
    { value: 'full', label: 'Full width' },
  ],
};

export const HEADING_LEVELS = ['h2', 'h3', 'h4'];
export const ALIGNMENTS = ['start', 'center'];

/** Fields every element gets. Spread into `fields` and list in the Advanced tab. */
export const general = {
  anchor: {
    type: 'string',
    label: 'Anchor name',
    hint: 'Lets a link jump straight to this block, e.g. "pricing" for #pricing. Lower-case letters, numbers and dashes.',
    pattern: '^[a-z][a-z0-9-]*$',
    advanced: true,
  },
  hidden: {
    type: 'boolean',
    label: 'Hide on the website',
    hint: 'Keeps this block in the editor but leaves it off the published page.',
  },
  label: {
    type: 'string',
    label: 'Name in the page outline',
    hint: 'Only shown in the editor, to tell similar blocks apart.',
    advanced: true,
  },
};

export const GENERAL_FIELDS = Object.keys(general);

function fail(name, message) {
  throw new Error(`site-admin elements: element "${name}" ${message}`);
}

/** Values a select/token/align/heading-level field accepts, or null for free-form fields. */
export function allowedValues(field) {
  switch (field.type) {
    case 'select':
      return field.options.map(o => o.value);
    case 'token':
      return TOKEN_SCALES[field.scale].map(o => o.value);
    case 'align':
      return ALIGNMENTS;
    case 'heading-level':
      return HEADING_LEVELS;
    case 'boolean':
      return [true, false];
    default:
      return null;
  }
}

export function defineElement(def) {
  const name = def?.name;
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`site-admin elements: invalid element name ${JSON.stringify(name)}`);
  }
  if (name === ROOT_TYPE) fail(name, 'uses the reserved name "layout"');
  for (const key of ['title', 'group']) {
    if (typeof def[key] !== 'string' || !def[key]) fail(name, `needs a "${key}" string`);
  }
  if (typeof def.render !== 'function') fail(name, 'needs a render() function');
  if (!def.internal && (typeof def.ai !== 'string' || !def.ai.trim())) {
    fail(name, 'needs an "ai" description (used to generate the ChatGPT prompt)');
  }
  if (!Array.isArray(def.allowedParents) || !def.allowedParents.length) {
    fail(name, 'needs an "allowedParents" array (use "layout" for the page root)');
  }

  // The shared fields are reserved names: an element that declares its own
  // "label" (say, for button text) would be silently overwritten by
  // ...general, or would overwrite it, depending on spread order.
  for (const reserved of GENERAL_FIELDS) {
    if (def.fields?.[reserved] && def.fields[reserved] !== general[reserved]) {
      fail(name, `defines its own "${reserved}" field; that name is reserved for the shared field every element has`);
    }
  }
  const fields = { ...(def.fields || {}), ...general };
  for (const [fieldName, field] of Object.entries(fields)) {
    if (!FIELD_TYPES.has(field?.type)) fail(name, `field "${fieldName}" has unknown type ${JSON.stringify(field?.type)}`);
    if (field.type === 'select' && (!Array.isArray(field.options) || !field.options.length)) {
      fail(name, `select field "${fieldName}" needs options`);
    }
    if (field.type === 'token' && !TOKEN_SCALES[field.scale]) {
      fail(name, `token field "${fieldName}" has unknown scale ${JSON.stringify(field.scale)}`);
    }
  }

  const defaults = def.defaults || {};
  for (const [fieldName, value] of Object.entries(defaults)) {
    const field = fields[fieldName];
    if (!field) fail(name, `has a default for unknown field "${fieldName}"`);
    const allowed = allowedValues(field);
    if (allowed && !allowed.includes(value)) fail(name, `default for "${fieldName}" (${JSON.stringify(value)}) is not an allowed value`);
  }

  // Every field must appear in exactly one tab, so no field silently goes
  // missing from the editor form.
  const tabs = Object.fromEntries(Object.entries(def.tabs || { Content: Object.keys(def.fields || {}) }).map(([t, n]) => [t, [...n]]));
  const listed = new Set(Object.values(tabs).flat());
  const missingGeneral = GENERAL_FIELDS.filter(n => !listed.has(n));
  if (missingGeneral.length) tabs.Advanced = [...(tabs.Advanced || []), ...missingGeneral];
  const seen = new Map();
  for (const [tab, names] of Object.entries(tabs)) {
    for (const fieldName of names) {
      if (!fields[fieldName]) fail(name, `tab "${tab}" lists unknown field "${fieldName}"`);
      if (seen.has(fieldName)) fail(name, `field "${fieldName}" is in both "${seen.get(fieldName)}" and "${tab}" tabs`);
      seen.set(fieldName, tab);
    }
  }
  for (const fieldName of Object.keys(fields)) {
    if (!seen.has(fieldName)) fail(name, `field "${fieldName}" is not in any tab`);
  }

  // Keys are the schema number a migration upgrades TO (2 = from schema 1 to 2).
  // createRegistry() checks they don't exceed the registry's schema.
  const migrations = def.migrations || {};
  for (const key of Object.keys(migrations)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 2) fail(name, `has migration "${key}"; keys must be schema numbers from 2 up`);
    if (typeof migrations[key] !== 'function') fail(name, `migration "${key}" is not a function`);
  }

  return Object.freeze({
    icon: '',
    css: name,
    container: false,
    ...def,
    fields,
    defaults,
    tabs,
    migrations,
  });
}

/**
 * Builds a registry from element definitions. `migrations` are registry-wide
 * (applied to every node before its own), for changes such as renaming a type.
 * `schema` is the layout schema this registry writes; it defaults to
 * LAYOUT_SCHEMA and is only overridden in tests.
 */
export function createRegistry(definitions, { migrations = {}, schema = LAYOUT_SCHEMA } = {}) {
  const byName = new Map();
  for (const def of definitions) {
    if (byName.has(def.name)) throw new Error(`site-admin elements: element "${def.name}" is registered twice`);
    byName.set(def.name, def);
  }
  const children = new Map([[ROOT_TYPE, []]]);
  for (const def of byName.values()) {
    for (const parent of def.allowedParents) {
      if (parent !== ROOT_TYPE && !byName.has(parent)) {
        throw new Error(`site-admin elements: element "${def.name}" names unknown parent "${parent}"`);
      }
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(def.name);
    }
  }
  for (const [parent] of children) {
    if (parent !== ROOT_TYPE && !byName.get(parent).container) {
      throw new Error(`site-admin elements: "${parent}" accepts children but is not marked container: true`);
    }
  }
  const checkKeys = (keys, where) => {
    for (const key of keys) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 2 || n > schema) {
        throw new Error(`site-admin elements: ${where} migration "${key}" must be a schema number from 2 to ${schema}`);
      }
    }
  };
  checkKeys(Object.keys(migrations), 'registry');
  for (const def of byName.values()) checkKeys(Object.keys(def.migrations), `element "${def.name}"`);

  return Object.freeze({
    schema,
    migrations,
    get: type => byName.get(type),
    has: type => byName.has(type),
    all: () => [...byName.values()],
    /** Element types allowed directly inside `parentType` ('layout' for the root). */
    childrenOf: parentType => [...(children.get(parentType) || [])],
  });
}
