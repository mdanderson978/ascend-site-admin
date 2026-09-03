import { useMemo, useState } from 'react';
import type { AdminConfig, ContentTree, SearchIndex } from '../api/types';
import { humanize, sortedSlugs } from '../lib/content';
import { CloseIcon, GripIcon, SearchIcon } from './Icons';

interface SidebarProps {
  config: AdminConfig;
  tree: ContentTree;
  searchIndex: SearchIndex;
  activeKey: string | null;
  open: boolean;
  onClose: () => void;
  onOpenEntry: (key: string, field?: string) => void;
  onReorder: (collection: string, slugs: string[]) => void;
  onOpenMenus: () => void;
}

interface NavEntry { key: string; label: string; sub?: boolean; isNew?: boolean; collection?: string }
interface NavGroup { label: string; entries: NavEntry[] }

export function buildNavigation(config: AdminConfig, tree: ContentTree, searchIndex: SearchIndex): NavGroup[] {
  const mounted = new Set<string>();
  const known = new Set(config.navStructure.flatMap(section => section.items.map(item => item.key).filter(Boolean) as string[]));
  const order: Record<string, number> = {};
  for (const [collection, dynamic] of Object.entries(config.dynamicCollections)) {
    if (!dynamic.orderField) continue;
    for (const slug of tree[collection] || []) {
      const field = searchIndex[`${collection}/${slug}`]?.find(item => item.name === dynamic.orderField);
      const value = Number(field?.value);
      if (Number.isFinite(value)) order[`${collection}/${slug}`] = value;
    }
  }
  const dynamicEntries = (collection: string, sub = false, exclude: string[] = []): NavEntry[] => {
    mounted.add(collection);
    const dynamic = config.dynamicCollections[collection];
    return [
      // "+ New X" goes FIRST, not last — a collection meant to be added to
      // regularly (a weekly sermon, say) grows the entry list underneath it
      // indefinitely, and an editor doing that routine task should never
      // have to scroll past however many hundred existing entries exist to
      // find the one control they need most often.
      { key: `${collection}/new`, label: `New ${dynamic.label}`, sub, isNew: true },
      ...sortedSlugs(collection, tree[collection] || [], config.dynamicCollections, order).filter(slug => !exclude.includes(slug)).map(slug => {
        const key = `${collection}/${slug}`;
        const title = searchIndex[key]?.find(item => item.name === dynamic.titleField)?.value;
        return { key, label: config.pageLabels[key] || title || humanize(slug), sub, collection };
      }),
    ];
  };
  const groups: NavGroup[] = config.navStructure.map(section => ({
    label: section.label,
    entries: section.items.flatMap(item => item.dynamic && config.dynamicCollections[item.dynamic]
      ? dynamicEntries(item.dynamic, item.sub, item.exclude)
      : item.key ? [{ key: item.key, label: config.pageLabels[item.key] || humanize(item.key.split('/').pop() || item.key), sub: item.sub }] : []),
  }));
  const orphans = Object.entries(tree).flatMap(([collection, slugs]) => config.dynamicCollections[collection] ? [] : slugs.map(slug => `${collection}/${slug}`)).filter(key => !known.has(key));
  if (orphans.length) groups.push({ label: 'Other', entries: orphans.map(key => ({ key, label: config.pageLabels[key] || humanize(key.split('/').pop() || key) })) });
  for (const [collection, dynamic] of Object.entries(config.dynamicCollections)) {
    if (!mounted.has(collection)) groups.push({ label: `${dynamic.label}s`, entries: dynamicEntries(collection) });
  }
  return groups;
}

export function Sidebar({ config, tree, searchIndex, activeKey, open, onClose, onOpenEntry, onReorder, onOpenMenus }: SidebarProps) {
  const [query, setQuery] = useState('');
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [reorderMenuKey, setReorderMenuKey] = useState<string | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState('');
  const groups = useMemo(() => buildNavigation(config, tree, searchIndex), [config, tree, searchIndex]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const matches: Array<{ key: string; field?: string; label: string; detail: string; tier: number }> = [];
    for (const [key, fields] of Object.entries(searchIndex)) {
      const page = config.pageLabels[key] || humanize(key.split('/').pop() || key);
      if (page.toLowerCase().includes(q)) matches.push({ key, label: page, detail: 'Open page', tier: 0 });
      for (const field of fields) {
        if (`${field.label} ${field.hint}`.toLowerCase().includes(q)) matches.push({ key, field: field.name, label: field.label, detail: page, tier: 1 });
        else if (field.value.toLowerCase().includes(q)) matches.push({ key, field: field.name, label: field.label, detail: `${page} · ${field.value.replace(/\s+/g, ' ').slice(0, 75)}`, tier: 2 });
      }
    }
    return matches.sort((a, b) => a.tier - b.tier).slice(0, 40);
  }, [query, config.pageLabels, searchIndex]);
  const choose = (key: string, field?: string) => { onOpenEntry(key, field); setQuery(''); onClose(); };
  const completeCollectionOrder = (collection: string, entries: NavEntry[]) => {
    const orderField = config.dynamicCollections[collection]?.orderField;
    const savedOrder: Record<string, number> = {};
    for (const slug of tree[collection] || []) {
      const value = Number(searchIndex[`${collection}/${slug}`]?.find(field => field.name === orderField)?.value);
      if (Number.isFinite(value)) savedOrder[`${collection}/${slug}`] = value;
    }
    const fullOrder = sortedSlugs(collection, tree[collection] || [], config.dynamicCollections, savedOrder);
    const visible = new Set(entries.map(entry => entry.key.split('/')[1]));
    const reorderedVisible = entries.map(entry => entry.key.split('/')[1]);
    let index = 0;
    return fullOrder.map(slug => visible.has(slug) ? reorderedVisible[index++] : slug);
  };
  const reorder = (collection: string, key: string, direction: -1 | 1, siblings: NavEntry[]) => {
    const entries = [...siblings];
    const index = entries.findIndex(item => item.key === key); const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return;
    const [entry] = entries.splice(index, 1); entries.splice(target, 0, entry);
    onReorder(collection, completeCollectionOrder(collection, entries));
    setReorderAnnouncement(`${entry.label} moved ${direction < 0 ? 'earlier' : 'later'}.`);
  };
  const drop = (target: NavEntry, siblings: NavEntry[]) => {
    if (!draggedKey || !target.collection || draggedKey === target.key) return;
    const entries = [...siblings];
    const from = entries.findIndex(item => item.key === draggedKey); const to = entries.findIndex(item => item.key === target.key);
    if (from < 0 || to < 0) return;
    const [entry] = entries.splice(from, 1); entries.splice(to, 0, entry);
    onReorder(target.collection, completeCollectionOrder(target.collection, entries));
    setReorderAnnouncement(`${entry.label} moved to position ${to + 1}.`);
    setDraggedKey(null); setDropTargetKey(null);
  };

  return <>
    <div className={`sidebar-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
    <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Content navigation">
      <div className="brand">
        <div className="brand__mark" aria-hidden="true">A</div>
        <div><strong>{config.siteTitle}</strong><span>Site administration</span></div>
        <button className="icon-button sidebar__close" onClick={onClose} aria-label="Close navigation"><CloseIcon /></button>
      </div>
      <label className="search-box"><SearchIcon /><span className="sr-only">Search content</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find anything…" /></label>
      <nav className="navigation">
        {query.trim().length >= 2 ? <div className="search-results" aria-label="Search results">
          {results.length ? results.map((result, index) => <button key={`${result.key}-${result.field}-${index}`} onClick={() => choose(result.key, result.field)}><strong>{result.label}</strong><span>{result.detail}</span></button>) : <p>No matches. Try “photo”, “price” or a page name.</p>}
        </div> : groups.map(group => <section className="nav-group" key={group.label}><h2>{group.label}</h2>{group.entries.map((entry, entryIndex) => {
          const orderable = entry.collection && config.dynamicCollections[entry.collection]?.orderField && !entry.isNew;
          const siblings = orderable ? group.entries.filter(item => item.collection === entry.collection && !item.isNew) : [];
          const position = siblings.findIndex(item => item.key === entry.key);
          return <div className="nav-entry-wrap" key={`${entry.key}-${entryIndex}`}>
            <div className={`nav-row ${orderable ? 'orderable' : ''} ${draggedKey === entry.key ? 'dragging' : ''} ${dropTargetKey === entry.key ? 'drop-target' : ''}`} onDragOver={event => { if (orderable && draggedKey !== entry.key) { event.preventDefault(); setDropTargetKey(entry.key); } }} onDragLeave={() => dropTargetKey === entry.key && setDropTargetKey(null)} onDrop={() => drop(entry, siblings)}>
              {orderable && <button className="nav-drag-handle" draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; setDraggedKey(entry.key); setReorderMenuKey(null); }} onDragEnd={() => { setDraggedKey(null); setDropTargetKey(null); }} onClick={() => setReorderMenuKey(current => current === entry.key ? null : entry.key)} onKeyDown={event => { if (event.key === 'ArrowUp' && position > 0) { event.preventDefault(); reorder(entry.collection!, entry.key, -1, siblings); } if (event.key === 'ArrowDown' && position < siblings.length - 1) { event.preventDefault(); reorder(entry.collection!, entry.key, 1, siblings); } }} aria-expanded={reorderMenuKey === entry.key} aria-label={`Reorder ${entry.label}`} title="Drag to reorder, or click for move controls"><GripIcon /></button>}
              <button className={`nav-entry-button ${entry.key === activeKey ? 'active' : ''} ${entry.sub ? 'sub' : ''} ${entry.isNew ? 'new' : ''}`} onClick={() => choose(entry.key)}><span>{entry.isNew ? '+ ' : ''}{entry.label}</span></button>
            </div>
            {orderable && reorderMenuKey === entry.key && <div className="nav-reorder-menu"><button onClick={() => reorder(entry.collection!, entry.key, -1, siblings)} disabled={position === 0} aria-label={`Move ${entry.label} earlier`}>Move earlier</button><button onClick={() => reorder(entry.collection!, entry.key, 1, siblings)} disabled={position === siblings.length - 1} aria-label={`Move ${entry.label} later`}>Move later</button></div>}
          </div>;
        })}</section>)}
      </nav>
      <div className="sr-only" aria-live="polite">{reorderAnnouncement}</div>
      {Object.keys(config.menuSlots || {}).length > 0 && <button className="menus-link" onClick={() => { onOpenMenus(); onClose(); }}>Manage menus</button>}
    </aside>
  </>;
}
