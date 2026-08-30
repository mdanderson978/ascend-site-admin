import { useEffect, useMemo, useState } from 'react';
import type { MenuPageOption } from '../../api/types';
import { api } from '../../api/client';
import { Dialog } from '../../components/Dialog';

interface PageLinkPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (page: MenuPageOption) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

// Same shape as MediaFields.tsx's MediaPicker (Dialog + fetch-on-open +
// loading state + clickable rows + onPick + close). stable_id isn't
// exposed anywhere else client-side (GET /api/search only ever includes
// FIELDS-declared fields), so this is backed by the small dedicated
// GET /api/menu-pages endpoint rather than reusing ContentTree/SearchIndex.
export function PageLinkPicker({ open, onClose, onPick, onNotice }: PageLinkPickerProps) {
  const [pages, setPages] = useState<MenuPageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.menuPages().then(result => setPages(result.pages)).catch(error => onNotice(error.message, 'error')).finally(() => setLoading(false));
  }, [open, onNotice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? pages.filter(p => p.title.toLowerCase().includes(q)) : pages;
  }, [pages, query]);

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
    </Dialog>
  );
}
