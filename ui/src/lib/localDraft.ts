import type { ContentData, EntryResponse } from '../api/types';

const PREFIX = 'ascend-site-admin:draft:';

interface StoredDraft {
  version: 1;
  baseline: string;
  savedAt: number;
  data: ContentData;
  body: string;
}

export function entryFingerprint(entry: Pick<EntryResponse, 'data' | 'body'>): string {
  return JSON.stringify({ data: entry.data, body: entry.body });
}

export function saveLocalDraft(key: string, baseline: string, entry: Pick<EntryResponse, 'data' | 'body'>): void {
  try {
    const draft: StoredDraft = { version: 1, baseline, savedAt: Date.now(), data: entry.data, body: entry.body };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(draft));
  } catch { /* Private mode or a full storage quota must never block editing. */ }
}

export function recoverLocalDraft(key: string, baseline: string): Pick<StoredDraft, 'data' | 'body' | 'savedAt'> | null {
  const storageKey = PREFIX + key;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (parsed.version !== 1 || parsed.baseline !== baseline || !parsed.data || typeof parsed.data !== 'object' || typeof parsed.body !== 'string') {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return { data: parsed.data, body: parsed.body, savedAt: Number(parsed.savedAt) || Date.now() };
  } catch {
    try { window.localStorage.removeItem(storageKey); } catch { /* ignored */ }
    return null;
  }
}

export function clearLocalDraft(key: string): void {
  try { window.localStorage.removeItem(PREFIX + key); } catch { /* ignored */ }
}
