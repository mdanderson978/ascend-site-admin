import { useEffect, useMemo, useState } from 'react';
import type { AdminConfig, MenuPageOption } from '../../api/types';
import { api } from '../../api/client';
import { Dialog } from '../../components/Dialog';

interface PageLinkPickerProps {
  open: boolean;
  config: AdminConfig;
  onClose: () => void;
  onPick: (page: MenuPageOption) => void;
  onEntryCreated: () => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

// Same shape as MediaFields.tsx's MediaPicker (Dialog + fetch-on-open +
// loading state + clickable rows + onPick + close). stable_id isn't
// exposed anywhere else client-side (GET /api/search only ever includes
// FIELDS-declared fields), so this is backed by the small dedicated
// GET /api/menu-pages endpoint rather than reusing ContentTree/SearchIndex.
export function PageLinkPicker({ open, config, onClose, onPick, onEntryCreated, onNotice }: PageLinkPickerProps) {
  const [pages, setPages] = useState<MenuPageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const dynamicCollections = Object.entries(config.dynamicCollections);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.menuPages().then(result => setPages(result.pages)).catch(error => onNotice(error.message, 'error')).finally(() => setLoading(false));
  }, [open, onNotice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? pages.filter(p => p.title.toLowerCase().includes(q)) : pages;
  }, [pages, query]);

  // Reuses the exact same two calls the sidebar's own "+ New X" flow ends
  // up making (api.save on a '.../new' key creates the file and assigns a
  // stable_id via ensureStableId; api.entry reads it straight back) — no
  // new backend route needed just for this.
  const createAndPick = async () => {
    if (!newCollection || !newTitle.trim()) return;
    const dynamic = config.dynamicCollections[newCollection];
    setCreating(true);
    try {
      const created = await api.save(`${newCollection}/new`, { [dynamic.titleField]: newTitle.trim() }, '');
      if (!created.ok || !created.slug) { onNotice(created.error || 'Could not create this page.', 'error'); return; }
      const entry = await api.entry(`${newCollection}/${created.slug}`);
      const stableId = typeof entry.data.stable_id === 'string' ? entry.data.stable_id : '';
      if (!stableId) { onNotice('The new page was created but has no stable ID yet — try picking it from the list instead.', 'error'); return; }
      onPick({ key: `${newCollection}/${created.slug}`, title: newTitle.trim(), stableId });
      onEntryCreated();
      setNewTitle('');
      onClose();
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setCreating(false); }
  };

  return (
    <Dialog open={open} title="Link to a page" onClose={onClose} actions={<button className="button button--quiet" onClick={onClose}>Cancel</button>}>
      <label className="search-box"><span className="sr-only">Search pages</span>
        <input type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a page…" />
      </label>
      <div className="media-library media-library--list">
        {loading ? <div className="loading-line">Loading pages…</div>
          : filtered.length ? filtered.map(page => (
            <button key={page.key} onClick={() => { onPick(page); onClose(); }}>
              <span>{page.title}</span>
              <span className="field-hint">{page.key}</span>
            </button>
          )) : <div className="empty-small">No pages match.</div>}
      </div>
      {dynamicCollections.length > 0 && (
        <div className="picker-create">
          <p className="field-hint">Can't find it? Create a new page:</p>
          <div className="picker-create__row">
            <select value={newCollection} onChange={event => setNewCollection(event.target.value)}>
              <option value="">Choose a type…</option>
              {dynamicCollections.map(([key, dynamic]) => <option key={key} value={key}>{dynamic.label}</option>)}
            </select>
            <input value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="Title" />
            <button className="button button--secondary" disabled={creating || !newCollection || !newTitle.trim()} onClick={createAndPick}>
              {creating ? 'Creating…' : 'Create and link'}
            </button>
          </div>
          <p className="field-hint">You can fill in its photos and other details anytime — look for it in the sidebar, or use the Edit button once it's added to this menu.</p>
        </div>
      )}
    </Dialog>
  );
}
