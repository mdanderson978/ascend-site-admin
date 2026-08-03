import type { HistoryVersion } from '../../api/types';
import { CloseIcon, HistoryIcon } from '../../components/Icons';

function friendlyDate(timestamp: number) {
  const value = new Date(timestamp);
  const today = new Date();
  const time = value.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (value.toDateString() === today.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (value.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${value.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: value.getFullYear() === today.getFullYear() ? undefined : 'numeric' })}, ${time}`;
}

export function HistoryPanel({ open, versions, loading, onClose, onRestore }: { open: boolean; versions: HistoryVersion[]; loading: boolean; onClose: () => void; onRestore: (version: HistoryVersion) => void }) {
  return <aside className={`history-panel ${open ? 'is-open' : ''}`} aria-label="Version history" aria-hidden={!open}>
    <header><div><HistoryIcon /><h2>Version history</h2></div><button className="icon-button" onClick={onClose} aria-label="Close version history"><CloseIcon /></button></header>
    <p>Restore a previous saved version. It will remain a draft until you publish it.</p>
    <div className="history-list">{loading ? <div className="loading-line">Loading history…</div> : versions.length ? versions.map((version, index) => <article key={version.sha}><div><strong>{friendlyDate(version.date)}</strong><span>{version.message || 'Content update'}</span></div>{index === 0 ? <small>Current</small> : <button className="button button--secondary" onClick={() => onRestore(version)}>Restore</button>}</article>) : <div className="empty-small">No published versions yet.</div>}</div>
  </aside>;
}
