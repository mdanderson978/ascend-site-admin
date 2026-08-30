/**
 * Rewrites hand-authored internal links inside THIS content repo's own
 * markdown bodies when a page's slug changes. Body content here is either
 * raw HTML anchors (href="/old-path") or standard Markdown links
 * (](/old-path)) — confirmed both forms exist in real content across sites
 * this engine serves — so a plain string replace on each wrapper is
 * sufficient; no Markdown-AST parsing needed.
 *
 * Deliberately scoped to src/content only. Uploaded images/PDFs can't
 * reference a page's URL in this content model, so there's nowhere else in
 * the content repo a page-to-page link could live. Links hardcoded in a
 * separate SOURCE repo (nav, footer, breadcrumb components) are outside
 * this module's reach by design — see config.externalLinkSurfaces.
 */
import fs from 'fs';
import path from 'path';

const WRAPPERS = [
  ['href="', '"'], // HTML anchors
  ['](', ')'],      // Markdown links
];

function pathVariants(p) {
  const trimmed = p.replace(/\/$/, '') || '/';
  return new Set([trimmed, trimmed === '/' ? '/' : trimmed + '/']);
}

function walkMarkdownFiles(contentDir, onFile) {
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.site-admin') continue;
        walk(p);
        continue;
      }
      if (entry.name.endsWith('.md')) onFile(p);
    }
  })(contentDir);
}

function countMatches(text, variants) {
  let count = 0;
  for (const variant of variants) {
    for (const [pre, post] of WRAPPERS) {
      const needle = pre + variant + post;
      if (text.includes(needle)) count += text.split(needle).length - 1;
    }
  }
  return count;
}

function replaceMatches(text, variants, newPath) {
  let out = text;
  for (const variant of variants) {
    for (const [pre, post] of WRAPPERS) {
      const needle = pre + variant + post;
      if (!out.includes(needle)) continue;
      out = out.split(needle).join(pre + newPath + post);
    }
  }
  return out;
}

// Read-only — for the rename preview step. Returns [{ file, count }].
export function findInternalLinks(contentDir, oldPath) {
  const variants = pathVariants(oldPath);
  const results = [];
  walkMarkdownFiles(contentDir, (fp) => {
    const count = countMatches(fs.readFileSync(fp, 'utf-8'), variants);
    if (count > 0) results.push({ file: path.relative(contentDir, fp).replace(/\\/g, '/'), count });
  });
  return results;
}

// Writes — for the rename commit step. Returns [{ file, count }].
export function fixInternalLinks(contentDir, oldPath, newPath) {
  const variants = pathVariants(oldPath);
  const results = [];
  walkMarkdownFiles(contentDir, (fp) => {
    const text = fs.readFileSync(fp, 'utf-8');
    const count = countMatches(text, variants);
    if (count === 0) return;
    fs.writeFileSync(fp, replaceMatches(text, variants, newPath), 'utf-8');
    results.push({ file: path.relative(contentDir, fp).replace(/\\/g, '/'), count });
  });
  return results;
}
