import type { ContentValue, DynamicCollection, ImageValue, NavigationSection } from '../api/types';

export function humanize(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function imageValue(value: ContentValue | undefined): ImageValue {
  if (typeof value === 'string') return { src: value, alt: '' };
  if (value && !Array.isArray(value) && typeof value === 'object' && 'src' in value) return value as ImageValue;
  return { src: '', alt: '' };
}

export function previewForPath(src: string): string {
  if (!src) return '';
  if (src.startsWith('/api/preview')) return src;
  const clean = src.replace(/\\/g, '/');
  const assetIndex = clean.indexOf('assets/');
  const path = assetIndex >= 0 ? `src/${clean.slice(assetIndex)}` : `src/assets/uploads/${clean.split('/').pop()}`;
  return `/api/preview?p=${encodeURIComponent(path)}`;
}

// Splits a FIELDS/dynamic-collection key on its FIRST "/" only, preserving
// the full remainder as the slug. A nested static page key's slug can
// itself contain "/" (e.g. "pages/about/index", or two directories deep
// like "pages/awards/hall-of-fame/criteria") - a naive `key.split('/')`
// destructured straight into [collection, slug] silently truncates to just
// the first segment after the collection, dropping the rest. Same bug/fix
// as index.mjs's /api/content and /api/search (2.11.1) - this is the
// frontend's own copy of the same mistake, found while wiring up the "View
// live page" button for the Australian Masters Athletics site (2026-09-02).
export function splitKey(key: string): { collection: string; slug: string } {
  const i = key.indexOf('/');
  return i < 0 ? { collection: key, slug: '' } : { collection: key.slice(0, i), slug: key.slice(i + 1) };
}

// The live site URL for an entry, given its (untruncated) slug, the site's
// base URL, and that collection's urlPatterns template (see the config
// contract in index.mjs). Returns '' when any input needed to build a real
// link is missing - callers should hide the "View live page" button in
// that case, not show a broken link.
export function liveUrlFor(slug: string, siteUrl: string, pattern: string | null | undefined): string {
  if (!siteUrl || !pattern) return '';
  if (slug === 'home') return `${siteUrl.replace(/\/$/, '')}/`;
  // A nested static page's slug can itself end in "/index" (or just be
  // "index") - src/pages/[...slug].astro on the site side strips that same
  // trailing "/index" from an entry's id to get its real route (Astro's
  // glob content loader adds it for a directory's index.md automatically),
  // so the live URL needs the same stripping or it 404s one level too deep
  // (e.g. "/about/index/" instead of "/about/").
  // Encode each path segment individually, not the slug as one unit -
  // encodeURIComponent also escapes "/" (into "%2F"), which would mangle a
  // multi-segment slug's own internal separators into one bogus path
  // segment instead of real nested path structure. This was a latent bug
  // in the original single-segment encodeURIComponent(slug) call too - it
  // just never surfaced, because the truncation bug above meant `slug` was
  // never actually multi-segment by the time it got here.
  const liveSlug = slug.replace(/(^|\/)index$/, '').split('/').map(encodeURIComponent).join('/');
  return `${siteUrl.replace(/\/$/, '')}/${pattern.replace('{slug}', liveSlug)}`;
}

export function breadcrumb(key: string, nav: NavigationSection[], labels: Record<string, string>): string {
  for (const section of nav) {
    if (section.items.some(item => item.key === key || (item.dynamic && key.startsWith(item.dynamic + '/')))) {
      return section.breadcrumb === false ? '' : section.label;
    }
  }
  return '';
}

export function sortedSlugs(collection: string, slugs: string[], dynamic: Record<string, DynamicCollection>, order: Record<string, number>): string[] {
  if (!dynamic[collection]?.orderField) return slugs;
  return [...slugs].sort((a, b) => (order[`${collection}/${a}`] ?? Infinity) - (order[`${collection}/${b}`] ?? Infinity) || a.localeCompare(b));
}

export type StartNotePart = { text?: string; strong?: boolean; break?: boolean };

export function startNoteParts(value: string): StartNotePart[] {
  const parts: StartNotePart[] = [];
  let strong = false;
  for (const token of value.split(/(<br\s*\/?\s*>|<strong>|<\/strong>)/gi)) {
    if (!token) continue;
    if (/^<br\s*\/?\s*>$/i.test(token)) parts.push({ break: true });
    else if (/^<strong>$/i.test(token)) strong = true;
    else if (/^<\/strong>$/i.test(token)) strong = false;
    else parts.push({ text: token, strong });
  }
  return parts;
}
