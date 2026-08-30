import { useState } from 'react';
import type { Menu, MenuHeadingItem, MenuItem, MenuLinkItem, MenuPageOption } from '../../api/types';
import { api } from '../../api/client';
import { GripIcon, TrashIcon } from '../../components/Icons';
import { PageLinkPicker } from './PageLinkPicker';

interface MenuEditorProps {
  menu: Menu;
  onBack: () => void;
  onSaved: (menu: Menu) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Shared by the top-level item list and a heading's one-level nested
// children list — same native drag pattern as Sidebar.tsx and
// MediaFields.tsx's ImagesField/ListField, no drag-and-drop library.
// `onPickPage` opens the one PageLinkPicker instance MenuEditor owns,
// handing it the onPick callback for THIS list — that's what lets the
// same component work unmodified at depth 0 (top-level, headings allowed)
// and depth 1 (a heading's children, headings not allowed).
function ItemList({ items, onChange, onPickPage, depth }: {
  items: MenuItem[];
  onChange: (items: MenuItem[]) => void;
  onPickPage: (onPick: (page: MenuPageOption) => void) => void;
  depth: 0 | 1;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
    onChange(next);
  };
  const update = (index: number, patch: Partial<MenuItem>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } as MenuItem : item));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const addPage = () => onPickPage(page => onChange([...items, { id: newId(), type: 'page', stableId: page.stableId, label: page.title }]));
  const addLink = () => onChange([...items, { id: newId(), type: 'link', url: '', label: 'New link' }]);
  const addHeading = () => onChange([...items, { id: newId(), type: 'heading', label: 'New heading', children: [] }]);

  return <div className="menu-item-list">
    {items.map((item, index) => (
      <article
        key={item.id}
        className={`menu-item-row menu-item-row--depth${depth}`}
        draggable
        onDragStart={() => setDragged(index)}
        onDragOver={event => event.preventDefault()}
        onDrop={() => { if (dragged !== null) move(dragged, index); setDragged(null); }}
      >
        <div className="menu-item-row__handle" title="Drag to reorder"><GripIcon /></div>
        <div className="menu-item-row__fields">
          <label><span>Label</span><input value={item.label} onChange={event => update(index, { label: event.target.value })} /></label>
          {item.type === 'page' && (
            item.missing === true
              ? <p className="field-hint field-hint--error">This page no longer exists — remove or replace this item.</p>
              : item.livePath
                ? <p className="field-hint">Links to <code>{item.livePath}</code></p>
                : <p className="field-hint">Save this menu to confirm the live link.</p>
          )}
          {item.type === 'link' && <>
            <label><span>URL</span><input value={item.url} onChange={event => update(index, { url: event.target.value } as Partial<MenuLinkItem>)} placeholder="https://... or /contact#quote" /></label>
            <label className="toggle-inline"><input type="checkbox" checked={Boolean(item.newTab)} onChange={event => update(index, { newTab: event.target.checked } as Partial<MenuLinkItem>)} /> Open in a new tab</label>
          </>}
          {item.type === 'heading' && (
            <div className="menu-item-row__children">
              <p className="field-hint">Dropdown items under this heading:</p>
              <ItemList items={item.children} onChange={children => update(index, { children } as Partial<MenuHeadingItem>)} onPickPage={onPickPage} depth={1} />
            </div>
          )}
        </div>
        <div className="menu-item-row__actions">
          <button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move ${item.label || 'item'} up`}>↑</button>
          <button onClick={() => move(index, index + 1)} disabled={index === items.length - 1} aria-label={`Move ${item.label || 'item'} down`}>↓</button>
          <button className="danger" onClick={() => remove(index)} aria-label={`Remove ${item.label || 'item'}`}><TrashIcon /></button>
        </div>
      </article>
    ))}
    <div className="menu-item-list__add">
      <button className="button button--secondary" onClick={addPage}>＋ Link to a page</button>
      <button className="button button--secondary" onClick={addLink}>＋ Custom link</button>
      {depth === 0 && <button className="button button--secondary" onClick={addHeading}>＋ Heading (dropdown group)</button>}
    </div>
  </div>;
}

export function MenuEditor({ menu, onBack, onSaved, onNotice }: MenuEditorProps) {
  const [name, setName] = useState(menu.name);
  const [items, setItems] = useState<MenuItem[]>(menu.items);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{ onPick: (page: MenuPageOption) => void } | null>(null);

  const save = async () => {
    if (!name.trim()) { onNotice('Enter a menu name.', 'error'); return; }
    setSaving(true);
    try {
      const result = await api.saveMenu(menu.id, { name: name.trim(), items });
      if (!result.ok) { onNotice(result.error || 'Could not save this menu.', 'error'); return; }
      onNotice('Menu saved.', 'success');
      onSaved({ ...menu, name: name.trim(), items });
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  return <section className="form-card">
    <header className="form-card__header">
      <button className="button button--quiet" onClick={onBack}>← Back to menus</button>
      <h2>Edit menu</h2>
    </header>
    <div className="form-card__fields">
      <label><span>Menu name</span><input value={name} onChange={event => setName(event.target.value)} /></label>
      <ItemList items={items} onChange={setItems} onPickPage={onPick => setPicker({ onPick })} depth={0} />
      <div className="menu-editor__save">
        <button className="button button--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save menu'}</button>
      </div>
    </div>
    <PageLinkPicker open={Boolean(picker)} onClose={() => setPicker(null)} onNotice={onNotice} onPick={page => picker?.onPick(page)} />
  </section>;
}
