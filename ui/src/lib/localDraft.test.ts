import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalDraft, entryFingerprint, recoverLocalDraft, saveLocalDraft } from './localDraft';

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('local drafts', () => {
  it('recovers unsaved data only while the saved page still matches its baseline', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const saved = { data: { title: 'Saved' }, body: 'Body' };
    const baseline = entryFingerprint(saved);
    saveLocalDraft('pages/home', baseline, { data: { title: 'Unsaved' }, body: 'Changed' });
    expect(recoverLocalDraft('pages/home', baseline)).toEqual({ data: { title: 'Unsaved' }, body: 'Changed', savedAt: 1234 });
  });

  it('drops a stale draft instead of overwriting a page changed elsewhere', () => {
    const baseline = entryFingerprint({ data: { title: 'Old' }, body: '' });
    saveLocalDraft('pages/home', baseline, { data: { title: 'Unsaved' }, body: '' });
    expect(recoverLocalDraft('pages/home', entryFingerprint({ data: { title: 'New server version' }, body: '' }))).toBeNull();
    expect(recoverLocalDraft('pages/home', baseline)).toBeNull();
  });

  it('clears a saved draft and safely ignores corrupt storage', () => {
    const baseline = entryFingerprint({ data: {}, body: '' });
    saveLocalDraft('pages/home', baseline, { data: { title: 'X' }, body: '' });
    clearLocalDraft('pages/home');
    expect(recoverLocalDraft('pages/home', baseline)).toBeNull();
    window.localStorage.setItem('ascend-site-admin:draft:pages/home', '{broken');
    expect(recoverLocalDraft('pages/home', baseline)).toBeNull();
  });
});
