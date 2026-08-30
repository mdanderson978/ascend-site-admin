import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IdentityCard } from './IdentityCard';
import type { AdminConfig, EntryResponse } from '../../api/types';

vi.mock('../../api/client', () => ({ api: { renamePreview: vi.fn(), rename: vi.fn() } }));

afterEach(cleanup);

const baseConfig: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: 'https://example.com', urlPatterns: { pages: '{slug}', services: 'pool-renovation-services/{slug}' },
  renamable: [], externalLinkSurfaces: [], crossListable: {}, menuSlots: {}, imageSizes: {},
  startScreenIntro: '', startScreenNote: '', altPlaceholder: '',
};

function makeEntry(key: string, data: EntryResponse['data'] = {}): EntryResponse {
  return { key, slug: key.split('/')[1], data, body: '', fields: [], previews: {} };
}

describe('IdentityCard', () => {
  it('shows a top-level sentence for a flat urlPattern', () => {
    render(<IdentityCard entry={makeEntry('pages/contact')} config={baseConfig} canRename={false} liveUrl="https://example.com/contact" onRenamed={vi.fn()} />);
    expect(screen.getByText('Top-level page')).toBeInTheDocument();
  });

  it('shows a nested-under sentence for a hub-prefixed urlPattern', () => {
    render(<IdentityCard entry={makeEntry('services/led-pool-lights')} config={baseConfig} canRename={false} liveUrl="https://example.com/pool-renovation-services/led-pool-lights" onRenamed={vi.fn()} />);
    expect(screen.getByText('pool-renovation-services')).toBeInTheDocument();
  });

  it('shows the cross-list badge only when configured and the entry flag is true', () => {
    const config: AdminConfig = { ...baseConfig, crossListable: { pages: { field: 'also_in_services', targetCollection: 'services', label: 'Services hub grid' } } };
    const flagged = makeEntry('pages/pool-tiling-melbourne', { also_in_services: true });
    render(<IdentityCard entry={flagged} config={config} canRename={false} liveUrl="https://example.com/pool-tiling-melbourne" onRenamed={vi.fn()} />);
    expect(screen.getByText(/Services hub grid/)).toBeInTheDocument();
  });

  it('omits the cross-list badge when the entry flag is false', () => {
    const config: AdminConfig = { ...baseConfig, crossListable: { pages: { field: 'also_in_services', targetCollection: 'services', label: 'Services hub grid' } } };
    const unflagged = makeEntry('pages/contact', { also_in_services: false });
    render(<IdentityCard entry={unflagged} config={config} canRename={false} liveUrl="https://example.com/contact" onRenamed={vi.fn()} />);
    expect(screen.queryByText(/Services hub grid/)).not.toBeInTheDocument();
  });

  it('only shows the Change URL control when canRename is true', () => {
    const { rerender } = render(<IdentityCard entry={makeEntry('pages/contact')} config={baseConfig} canRename={false} liveUrl="https://example.com/contact" onRenamed={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Change URL/ })).not.toBeInTheDocument();

    rerender(<IdentityCard entry={makeEntry('pages/contact')} config={baseConfig} canRename liveUrl="https://example.com/contact" onRenamed={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Change URL/ })).toBeInTheDocument();
  });

  it('renders nothing when there is no entry key or no live URL', () => {
    const { container } = render(<IdentityCard entry={makeEntry('')} config={baseConfig} canRename={false} liveUrl="" onRenamed={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
