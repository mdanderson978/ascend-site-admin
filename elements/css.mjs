// Node-only: reads element stylesheets so a page can inline exactly the CSS
// for the elements it uses (renderLayout() returns their names in `css`).
// The browser preview loads all of them through Vite instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();

function read(file) {
  if (!cache.has(file)) cache.set(file, fs.readFileSync(file, 'utf8'));
  return cache.get(file);
}

/** Path of an element's stylesheet, by css name (usually the element name). */
export function elementCssPath(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Invalid element css name "${name}"`);
  return path.join(here, 'library', name, 'style.css');
}

export const TOKENS_CSS_PATH = path.join(here, 'tokens.css');

/**
 * Tokens plus the stylesheets for `names`, in a stable order, ready to
 * inline in a <style> tag. Every file is wrapped in @layer ascend-elements,
 * so a site's own (unlayered) CSS always wins.
 */
export function elementCss(names = []) {
  const files = [TOKENS_CSS_PATH, ...[...new Set(names)].sort().map(elementCssPath)];
  return files.map(read).join('\n');
}
