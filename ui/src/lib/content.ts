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
