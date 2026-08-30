import { useState } from 'react';
import type { AdminConfig, Menu, MenuHeadingItem, MenuItem, MenuLinkItem, MenuPageOption } from '../../api/types';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../components/Dialog';
import { ChevronIcon, EditIcon, ExternalIcon, GripIcon, TrashIcon } from '../../components/Icons';
import { PageLinkPicker } from './PageLinkPicker';

interface MenuEditorProps {
  menu: Menu;
  config: AdminConfig;
  onBack: () => void;
  onSaved: (menu: Menu) => void;
  onOpenEntry: (key: string) => void;
  onEntryCreated: () => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TYPE_META: Record<MenuItem['type'], string> = { page: 'Page', link: 'Link', heading: 'Heading' };

function validateItems(items: MenuItem[]): string | null {
  for (const item of items) {
    if (!item.label.trim()) return 'Every menu item needs a label.';
    if (item.type === 'link' && !item.url.trim()) return `"${item.label}" needs a URL.`;
    if (item.type === 'heading') {
      const childError = validateItems(item.children);
      if (childError) return childError;
    }
  }
  return null;
}

// Shared by the top-level item list and a heading's one-level nested
// children list — same native drag pattern as Sidebar.tsx and
// MediaFields.tsx's ImagesField/ListField, no drag-and-drop library.
// `onPickPage` opens the one PageLinkPicker instance MenuEditor owns,
// handing it the onPick callback for THIS list — that's what lets the
// same component work unmodified at depth 0 (top-level, headings allowed)
// and depth 1 (a heading's children, headings not allowed). `onOpenEntry`
// arrives already wrapped in MenuEditor's unsaved-changes guard, so this
// component never needs to know about dirty state at all.
function ItemList({ items, onChange, onPickPage, onOpenEntry, siteUrl, collapsedIds, onToggleCollapse, depth }: {
  items: MenuItem[];
  onChange: (items: MenuItem[]) => void;
  onPickPage: (onPick: (page: MenuPageOption) => void) => void;
  onOpenEntry: (key: string) => void;
  siteUrl: string;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  depth: 0 | 1;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
    onChange(next);
  };
  const update = (index: number, patch: Partial<MenuItem>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } as MenuItem : item));
  const addPage = () => onPickPage(page => onChange([...items, { id: newId(), type: 'page', stableId: page.stableId, label: page.title }]));
  const addLink = () => onChange([...items, { id: newId(), type: 'link', url: '', label: 'New link' }]);
  const addHeading = () => onChange([...items, { id: newId(), type: 'heading', label: 'New heading', children: [] }]);

  // A single page/link item disappears with one click, matching every
  // other reorderable list in this codebase (ImagesField/ListField have
  // no delete-confirm either). A heading with populated children is a
  // different class of action — it can silently discard several items at
  // once, which is exactly the surprising bulk action "idiot proof"
  // should guard against without adding confirm-fatigue everywhere else.
  const requestRemove = (index: number) => {
    const item = items[index];
    if (item.type === 'heading' && item.children.length > 0) setConfirmDeleteIndex(index);
    else onChange(items.filter((_, i) => i !== index));
  };
  const confirmRemove = () => {
    if (confirmDeleteIndex !== null) onChange(items.filter((_, i) => i !== confirmDeleteIndex));
    setConfirmDeleteIndex(null);
  };

  return <div className="menu-item-list">
    {items.map((item, index) => (
      <article
        key={item.id}
        className={`menu-item-row menu-item-row--depth${depth} ${dragged === index ? 'is-dragging' : ''} ${dropTarget === index && dragged !== index ? 'is-drop-target' : ''}`}
        draggable
        onDragStart={() => setDragged(index)}
        onDragOver={event => { event.preventDefault(); setDropTarget(index); }}
        onDragLeave={() => setDropTarget(current => current === index ? null : current)}
        onDrop={() => { if (dragged !== null) move(dragged, index); setDragged(null); setDropTarget(null); }}
        onDragEnd={() => { setDragged(null); setDropTarget(null); }}
      >
        <div className="menu-item-row__handle" title="Drag to reorder"><GripIcon /></div>
        <div className="menu-item-row__fields">
          <div className="menu-item-row__top">
            <span className={`menu-item-badge menu-item-badge--${item.type}`}>{TYPE_META[item.type]}</span>
            <label className="menu-item-row__label"><span className="sr-only">Label</span><input value={item.label} onChange={event => update(index, { label: event.target.value })} placeholder="Label" /></label>
          </div>
          {item.type === 'page' && (
            item.missing === true
              ? <p className="field-hint field-hint--error">This page no longer exists — remove or replace this item.</p>
              : item.livePath
                ? <p className="field-hint">
                    Links to <code>{item.livePath}</code>
                    <span className="menu-item-row__linkActions">
                      <a className="icon-button" href={`${siteUrl.replace(/\/$/, '')}${item.livePath}`} target="_blank" rel="noreferrer" aria-label={`View ${item.label || 'page'} live`} title="View live"><ExternalIcon /></a>
                      {item.key && <button type="button" className="icon-button" onClick={() => onOpenEntry(item.key!)} aria-label={`Edit ${item.label || 'page'}`} title="Edit this page"><EditIcon /></button>}
                    </span>
                  </p>
                : <p className="field-hint">Save this menu to confirm the live link.</p>
          )}
          {item.type === 'link' && <>
            <label><span>URL</span><input value={item.url} onChange={event => update(index, { url: event.target.value } as Partial<MenuLinkItem>)} placeholder="https://... or /contact#quote" /></label>
            <label className="toggle-inline"><input type="checkbox" checked={Boolean(item.newTab)} onChange={event => update(index, { newTab: event.target.checked } as Partial<MenuLinkItem>)} /> Open in a new tab</label>
            <label className="toggle-inline"><input type="checkbox" checked={Boolean(item.nofollow)} onChange={event => update(index, { nofollow: event.target.checked } as Partial<MenuLinkItem>)} /> nofollow</label>
            <label className="toggle-inline"><input type="checkbox" checked={Boolean(item.sponsored)} onChange={event => update(index, { sponsored: event.target.checked } as Partial<MenuLinkItem>)} /> Sponsored / paid link</label>
          </>}
          {item.type === 'heading' && (
            <div className="menu-item-row__children">
              <button type="button" className="menu-item-row__collapse" onClick={() => onToggleCollapse(item.id)}>
                <span className={`menu-item-row__chevron ${collapsedIds.has(item.id) ? '' : 'is-open'}`}><ChevronIcon /></span>
                {collapsedIds.has(item.id)
                  ? `${item.children.length} item${item.children.length === 1 ? '' : 's'} — collapsed`
                  : 'Dropdown items under this heading:'}
              </button>
              {!collapsedIds.has(item.id) && (
                <ItemList
                  items={item.children}
                  onChange={children => update(index, { children } as Partial<MenuHeadingItem>)}
                  onPickPage={onPickPage}
                  onOpenEntry={onOpenEntry}
                  siteUrl={siteUrl}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                  depth={1}
                />
              )}
            </div>
          )}
        </div>
        <div className="menu-item-row__actions">
          <button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move ${item.label || 'item'} up`}>↑</button>
          <button onClick={() => move(index, index + 1)} disabled={index === items.length - 1} aria-label={`Move ${item.label || 'item'} down`}>↓</button>
          <button className="danger" onClick={() => requestRemove(index)} aria-label={`Remove ${item.label || 'item'}`}><TrashIcon /></button>
        </div>
      </article>
    ))}
    <div className="menu-item-list__add">
      <button className="button button--secondary" onClick={addPage}>＋ Link to a page</button>
      <button className="button button--secondary" onClick={addLink}>＋ Custom link</button>
      {depth === 0 && <button className="button button--secondary" onClick={addHeading}>＋ Heading (dropdown group)</button>}
    </div>
    {confirmDeleteIndex !== null && (
      <ConfirmDialog
        open
        title="Remove this heading?"
        description={`"${items[confirmDeleteIndex].label}" has ${(items[confirmDeleteIndex] as MenuHeadingItem).children.length} item(s) inside it — removing the heading removes all of them too.`}
        confirmLabel="Remove heading and its items"
        danger
        onCancel={() => setConfirmDeleteIndex(null)}
        onConfirm={confirmRemove}
      />
    )}
  </div>;
}

export function MenuEditor({ menu, config, onBack, onSaved, onOpenEntry, onEntryCreated, onNotice }: MenuEditorProps) {
  const [name, setName] = useState(menu.name);
  const [items, setItems] = useState<MenuItem[]>(menu.items);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{ onPick: (page: MenuPageOption) => void } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);

  const updateName = (value: string) => { setName(value); setDirty(true); };
  const updateItems = (value: MenuItem[]) => { setItems(value); setDirty(true); };
  const toggleCollapse = (id: string) => setCollapsedIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Unsaved menu edits used to be silently discarded by "Back" or the new
  // "Edit page" shortcut — this is the guard. Wrapping onOpenEntry here
  // (rather than in ItemList) means ItemList never needs to know dirty
  // state exists at all.
  const guardedLeave = (action: () => void) => { if (dirty) setLeaveAction(() => action); else action(); };

  const save = async () => {
    if (!name.trim()) { onNotice('Enter a menu name.', 'error'); return; }
    const validationError = validateItems(items);
    if (validationError) { onNotice(validationError, 'error'); return; }
    setSaving(true);
    try {
      const result = await api.saveMenu(menu.id, { name: name.trim(), items });
      if (!result.ok) { onNotice(result.error || 'Could not save this menu.', 'error'); return; }
      setDirty(false);
      onNotice('Menu saved.', 'success');
      onSaved({ ...menu, name: name.trim(), items });
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  return <section className="form-card">
    <header className="form-card__header">
      <button className="button button--quiet" onClick={() => guardedLeave(onBack)}>← Back to menus</button>
      <h2>Edit menu</h2>
    </header>
    <div className="form-card__fields">
      <label><span>Menu name</span><input value={name} onChange={event => updateName(event.target.value)} /></label>
      <ItemList
        items={items}
        onChange={updateItems}
        onPickPage={onPick => setPicker({ onPick })}
        onOpenEntry={key => guardedLeave(() => onOpenEntry(key))}
        siteUrl={config.siteUrl}
        collapsedIds={collapsedIds}
        onToggleCollapse={toggleCollapse}
        depth={0}
      />
      <div className="menu-editor__save">
        <button className="button button--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save menu'}</button>
      </div>
    </div>
    <PageLinkPicker open={Boolean(picker)} config={config} onClose={() => setPicker(null)} onNotice={onNotice} onEntryCreated={onEntryCreated} onPick={page => picker?.onPick(page)} />
    {leaveAction && (
      <ConfirmDialog
        open
        title="Discard unsaved changes?"
        description="This menu has changes that haven't been saved yet. Leaving now will discard them."
        confirmLabel="Discard changes"
        danger
        onCancel={() => setLeaveAction(null)}
        onConfirm={() => { const action = leaveAction; setLeaveAction(null); action(); }}
      />
    )}
  </section>;
}
