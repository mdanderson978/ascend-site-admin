import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuEditor } from './MenuEditor';
import { api } from '../../api/client';
import type { AdminConfig, Menu } from '../../api/types';

vi.mock('../../api/client', () => ({
  api: { saveMenu: vi.fn(), menuPages: vi.fn().mockResolvedValue({ pages: [] }), save: vi.fn(), entry: vi.fn() },
}));

afterEach(cleanup);

const config: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: 'https://example.com', urlPatterns: {}, renamable: [], externalLinkSurfaces: [],
  crossListable: {}, menuSlots: {}, imageSizes: {}, startScreenIntro: '', startScreenNote: '', altPlaceholder: '',
};

const baseMenu: Menu = { id: 'menu-1', name: 'Main Menu', items: [{ id: 'i1', type: 'link', url: '/contact', label: 'Contact' }] };

describe('MenuEditor', () => {
  it('blocks Save when an item has an empty label', async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    render(<MenuEditor menu={{ ...baseMenu, items: [{ id: 'i1', type: 'link', url: '/contact', label: '' }] }} config={config} onBack={vi.fn()} onSaved={vi.fn()} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={onNotice} />);

    await user.click(screen.getByRole('button', { name: 'Save menu' }));
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('needs a label'), 'error');
    expect(api.saveMenu).not.toHaveBeenCalled();
  });

  it('blocks Save when a link item has an empty URL', async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    render(<MenuEditor menu={{ ...baseMenu, items: [{ id: 'i1', type: 'link', url: '', label: 'Facebook' }] }} config={config} onBack={vi.fn()} onSaved={vi.fn()} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={onNotice} />);

    await user.click(screen.getByRole('button', { name: 'Save menu' }));
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('needs a URL'), 'error');
    expect(api.saveMenu).not.toHaveBeenCalled();
  });

  it('saves successfully when the menu is valid', async () => {
    vi.mocked(api.saveMenu).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<MenuEditor menu={baseMenu} config={config} onBack={vi.fn()} onSaved={onSaved} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save menu' }));
    await waitFor(() => expect(api.saveMenu).toHaveBeenCalledWith('menu-1', { name: 'Main Menu', items: baseMenu.items }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('confirms before discarding unsaved changes on Back', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<MenuEditor menu={baseMenu} config={config} onBack={onBack} onSaved={vi.fn()} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    await user.type(screen.getByLabelText('Menu name'), '!');
    await user.click(screen.getByRole('button', { name: '← Back to menus' }));
    expect(screen.getByText(/Discard unsaved changes/)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('goes straight back with no confirm when nothing changed', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<MenuEditor menu={baseMenu} config={config} onBack={onBack} onSaved={vi.fn()} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '← Back to menus' }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByText(/Discard unsaved changes/)).not.toBeInTheDocument();
  });

  it('confirms before removing a heading that has children, not a plain item', async () => {
    const user = userEvent.setup();
    const menu: Menu = {
      id: 'menu-1', name: 'Main Menu',
      items: [
        { id: 'plain', type: 'link', url: '/contact', label: 'Contact' },
        { id: 'grouped', type: 'heading', label: 'More', children: [{ id: 'child', type: 'link', url: '/x', label: 'X' }] },
      ],
    };
    render(<MenuEditor menu={menu} config={config} onBack={vi.fn()} onSaved={vi.fn()} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Remove Contact' }));
    expect(screen.queryByText(/Remove this heading/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Contact')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove More' }));
    expect(screen.getByText(/Remove this heading/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('More')).toBeInTheDocument();
  });

  it('offers View and Edit only for a resolved, non-missing page item', () => {
    const menu: Menu = {
      id: 'menu-1', name: 'Main Menu',
      items: [
        { id: 'p1', type: 'page', stableId: 'a', label: 'Resolved', key: 'pages/resolved', livePath: '/resolved', missing: false },
        { id: 'p2', type: 'page', stableId: 'b', label: 'Missing', missing: true },
        { id: 'p3', type: 'page', stableId: 'c', label: 'Unsaved' },
      ],
    };
    render(<MenuEditor menu={menu} config={config} onBack={vi.fn()} onSaved={vi.fn()} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    expect(screen.getByRole('link', { name: /View Resolved live/ })).toHaveAttribute('href', 'https://example.com/resolved');
    expect(screen.getByRole('button', { name: /Edit Resolved/ })).toBeInTheDocument();
    expect(screen.getByText(/no longer exists/)).toBeInTheDocument();
    expect(screen.getByText(/Save this menu to confirm/)).toBeInTheDocument();
  });
});
