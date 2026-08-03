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

export function safeStartNote(value: string): string {
  return value
    .replace(/<br\b[^>]*>/gi, '<br>')
    .replace(/<strong\b[^>]*>/gi, '<strong>')
    .replace(/<\/strong\b[^>]*>/gi, '</strong>')
    .replace(/<(?!br>|\/?strong>)[^>]*>/gi, '');
}
