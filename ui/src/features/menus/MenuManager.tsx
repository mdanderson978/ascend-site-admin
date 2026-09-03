import { useEffect, useState } from 'react';
import type { AdminConfig, MenusResponse } from '../../api/types';
import { api } from '../../api/client';
import { MenuEditor } from './MenuEditor';

interface MenuManagerProps {
  config: AdminConfig;
  onOpenEntry: (key: string) => void;
  onEntryCreated: () => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

// Exactly one menu per declared config.menuSlots entry, never a
// freely-creatable/deletable pool — see index.mjs's ensureSlotMenus() and
// MENUS.md. This screen only ever renders for a site that declared at
// least one slot (Sidebar hides "Manage menus" otherwise), and the server
// auto-provisions each slot's menu on first load, so every slot key here
// is guaranteed a real menu to edit.
export function MenuManager({ config, onOpenEntry, onEntryCreated, onNotice }: MenuManagerProps) {
  const [data, setData] = useState<MenusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => { setLoading(true); api.menus().then(setData).catch(error => onNotice(error.message, 'error')).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  return <section className="form-card">
    <header className="form-card__header">
      <h2>Menus</h2>
      <p>One menu for each place your website template renders one. Rename it or edit its items any time — where it appears on the site is fixed by your developer.</p>
    </header>
    <div className="form-card__fields">
      <div className="menu-card-grid">
        {slotEntries.map(([slotKey, slot]) => {
          const menuId = data.slotAssignments[slotKey];
          const menu = menuId ? data.menus.find(m => m.id === menuId) : null;
          if (!menu) return null; // server just hasn't provisioned it yet on this load - reload will pick it up
          return <article className="menu-card" key={slotKey}>
            <div>
              <strong>{menu.name}</strong>
              <span className="field-hint">{slot.label} — {menu.items.length} item{menu.items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="menu-card__actions">
              <button className="button button--quiet" onClick={() => setEditingId(menu.id)}>Edit</button>
            </div>
          </article>;
        })}
        {slotEntries.length === 0 && <p>This site has no editable menus set up.</p>}
      </div>
    </div>
  </section>;
}
