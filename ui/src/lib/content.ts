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

// Accepts flexible human date input for a `date` field — any of -, /, . or
// space as the delimiter, in either ISO (YYYY-MM-DD) or Australian
// (DD-MM-YYYY) order, determined by which group is 4 digits (the year). A
// 2-digit year, or input with no 4-digit group at either end, is genuinely
// ambiguous and rejected rather than guessed at. This copy exists purely for
// immediate client-side validation feedback — index.mjs's parseFuzzyDate is
// the authoritative server-side twin and the source of truth for what's
// actually written to disk; keep the two in sync if either changes.
export function parseFuzzyDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,4})$/);
  if (!m) return null;
  const [, a, b, c] = m;
  let year: string, month: string, day: string;
  if (a.length === 4) { year = a; month = b; day = c; }
  else if (c.length === 4) { year = c; month = b; day = a; }
  else return null;
  const y = Number(year), mo = Number(month), d = Number(day);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d > daysInMonth[mo - 1]) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Renders a canonical YYYY-MM-DD (the output of parseFuzzyDate, above) as an
// unambiguous, immediate confirmation for the editor - e.g. "Sunday, 30
// August 2026" - so a fuzzy date's day/month order is never left to guess
// at until after Publish. `new Date(y, m-1, d)` is a LOCAL constructor (no
// timezone/UTC-string parsing involved, unlike `new Date('2026-08-30')`),
// and only its local getDay() accessor is read back - so this can't shift
// the calendar date by a day the way toISOString() can (see index.mjs's
// toDateAwareString comment for that specific trap).
export function formatFriendlyDate(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return `${WEEKDAYS[date.getDay()]}, ${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
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
