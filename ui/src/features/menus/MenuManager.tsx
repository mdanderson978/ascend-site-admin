import { useEffect, useState } from 'react';
import type { AdminConfig, Menu, MenusResponse } from '../../api/types';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../components/Dialog';
import { MenuEditor } from './MenuEditor';

interface MenuManagerProps {
  config: AdminConfig;
  onOpenEntry: (key: string) => void;
  onEntryCreated: () => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

export function MenuManager({ config, onOpenEntry, onEntryCreated, onNotice }: MenuManagerProps) {
  const [data, setData] = useState<MenusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Menu | null>(null);

  const load = () => { setLoading(true); api.menus().then(setData).catch(error => onNotice(error.message, 'error')).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createMenu = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const result = await api.createMenu(newName.trim());
      if (!result.ok) { onNotice(result.error || 'Could not create this menu.', 'error'); return; }
      setNewName('');
      load();
      setEditingId(result.menu.id);
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setCreating(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await api.deleteMenu(deleteTarget.id);
      if (!result.ok) { onNotice(result.error || 'Could not delete this menu.', 'error'); return; }
      onNotice('Menu deleted.', 'success');
      load();
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setDeleteTarget(null); }
  };

  const assignSlot = async (slotKey: string, menuId: string) => {
    try {
      const result = await api.assignMenuSlot(slotKey, menuId || null);
      if (!result.ok) { onNotice(result.error || 'Could not update this menu slot.', 'error'); return; }
      load();
    } catch (error) { onNotice((error as Error).message, 'error'); }
  };

  if (loading || !data) return <div className="loading-page"><div className="skeleton" /><div className="skeleton" /></div>;

  const editing = editingId ? data.menus.find(m => m.id === editingId) : null;
  if (editing) {
    return <MenuEditor
      menu={editing}
      config={config}
      onBack={() => { setEditingId(null); load(); }}
      onSaved={() => load()}
      onOpenEntry={onOpenEntry}
      onEntryCreated={onEntryCreated}
      onNotice={onNotice}
    />;
  }

  const slotEntries = Object.entries(config.menuSlots || {});

  return <>
    {slotEntries.length > 0 && (
      <section className="form-card">
        <header className="form-card__header">
          <h2>Menu slots</h2>
          <p>Which menu appears in each place the website template renders one.</p>
        </header>
        <div className="form-card__fields">
          {slotEntries.map(([slotKey, slot]) => (
            <label key={slotKey}>
              <span>{slot.label}</span>
              <select value={data.slotAssignments[slotKey] || ''} onChange={event => assignSlot(slotKey, event.target.value)}>
                <option value="">— None —</option>
                {data.menus.map(menu => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>
    )}

    <section className="form-card">
      <header className="form-card__header">
        <h2>Menus</h2>
        <p>Menus you create here can be edited, renamed or deleted at any time.</p>
      </header>
      <div className="form-card__fields">
        <div className="menu-card-grid">
          {data.menus.map(menu => (
            <article className="menu-card" key={menu.id}>
              <div>
                <strong>{menu.name}</strong>
                <span className="field-hint">{menu.items.length} item{menu.items.length === 1 ? '' : 's'}</span>
              </div>
              <div className="menu-card__actions">
                <button className="button button--quiet" onClick={() => setEditingId(menu.id)}>Edit</button>
                <button className="icon-button danger" aria-label={`Delete ${menu.name}`} onClick={() => setDeleteTarget(menu)}>✕</button>
              </div>
            </article>
          ))}
          {data.menus.length === 0 && <p>No menus yet — create one below.</p>}
        </div>
        <div className="menu-item-list__add">
          <input value={newName} onChange={event => setNewName(event.target.value)} placeholder="New menu name, e.g. Footer Menu" onKeyDown={event => event.key === 'Enter' && createMenu()} />
          <button className="button button--primary" disabled={creating || !newName.trim()} onClick={createMenu}>{creating ? 'Creating…' : '＋ New menu'}</button>
        </div>
      </div>
    </section>

    {deleteTarget && (
      <ConfirmDialog
        open
        title={`Delete "${deleteTarget.name}"?`}
        description="This cannot be undone. Any template currently rendering this menu will show nothing in its place until reassigned."
        confirmLabel="Delete menu"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    )}
  </>;
}
