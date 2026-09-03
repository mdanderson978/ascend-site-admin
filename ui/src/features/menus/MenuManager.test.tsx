import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MenuManager } from './MenuManager';
import { api } from '../../api/client';
import type { AdminConfig, MenusResponse } from '../../api/types';

vi.mock('../../api/client', () => ({
  api: { menus: vi.fn() },
}));

afterEach(cleanup);

const baseConfig: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: 'https://example.com', urlPatterns: {}, renamable: [], externalLinkSurfaces: [],
  crossListable: {}, menuSlots: {}, imageSizes: {}, startScreenIntro: '', startScreenNote: '', altPlaceholder: '',
};

// One menu per declared slot, auto-provisioned server-side - never a
// free-form create/delete/reassign pool. See index.mjs's ensureSlotMenus()
// and MENUS.md.
describe('MenuManager', () => {
  it('lists one card per declared slot, using the server-provisioned menu already assigned to it', async () => {
    const response: MenusResponse = {
      menus: [{ id: 'menu-1', name: 'Header', items: [{ id: 'i1', type: 'link', url: '/contact', label: 'Contact' }] }],
      slotAssignments: { header_primary: 'menu-1' },
    };
    (api.menus as ReturnType<typeof vi.fn>).mockResolvedValue(response);
    const config = { ...baseConfig, menuSlots: { header_primary: { label: 'Header — Primary Nav' } } };

    render(<MenuManager config={config} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    expect(await screen.findByText('Header')).toBeInTheDocument();
    expect(screen.getByText(/Header — Primary Nav/)).toBeInTheDocument();
    expect(screen.getByText(/1 item/)).toBeInTheDocument();
  });

  it('offers no way to create, delete, or reassign a menu', async () => {
    const response: MenusResponse = {
      menus: [{ id: 'menu-1', name: 'Header', items: [] }],
      slotAssignments: { header_primary: 'menu-1' },
    };
    (api.menus as ReturnType<typeof vi.fn>).mockResolvedValue(response);
    const config = { ...baseConfig, menuSlots: { header_primary: { label: 'Header' } } };

    render(<MenuManager config={config} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Header')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/New menu name/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New menu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a friendly message when the site has declared no menu slots at all', async () => {
    (api.menus as ReturnType<typeof vi.fn>).mockResolvedValue({ menus: [], slotAssignments: {} });

    render(<MenuManager config={baseConfig} onOpenEntry={vi.fn()} onEntryCreated={vi.fn()} onNotice={vi.fn()} />);

    expect(await screen.findByText(/no editable menus/i)).toBeInTheDocument();
  });
});
