import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildNavigation, Sidebar } from './Sidebar';
import type { AdminConfig } from '../api/types';

afterEach(cleanup);

const config: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: { 'pages/home': 'Home page' },
  navStructure: [{ label: 'Website', breadcrumb: false, items: [{ key: 'pages/home' }, { dynamic: 'projects', sub: true }] }],
  dynamicCollections: { projects: { label: 'Project', titleField: 'title', orderField: 'order' } },
  tasks: [], shortcodes: {}, siteUrl: '', urlPatterns: {}, renamable: [], externalLinkSurfaces: [], crossListable: {}, menuSlots: {}, imageSizes: {}, startScreenIntro: '', startScreenNote: '', altPlaceholder: '',
};

describe('buildNavigation', () => {
  it('mounts configured pages, a create action first, then sorted dynamic entries', () => {
    const groups = buildNavigation(config, { pages: ['home'], projects: ['second', 'first'] }, {
      'projects/first': [{ name: 'order', label: 'Order', hint: '', value: '1' }],
      'projects/second': [{ name: 'order', label: 'Order', hint: '', value: '2' }],
    });
    // "New" comes before the entries, not after - a collection an editor
    // adds to routinely (a weekly sermon, say) grows underneath it
    // indefinitely, and the one control used every time shouldn't require
    // scrolling past however many hundred existing entries exist.
    expect(groups[0].entries.map(entry => entry.key)).toEqual(['pages/home', 'projects/new', 'projects/first', 'projects/second']);
    expect(groups[0].entries[2]).toMatchObject({ sub: true, collection: 'projects' });
  });

  it('keeps unconfigured static content visible under Other', () => {
    const groups = buildNavigation(config, { pages: ['home', 'privacy'], projects: [] }, {});
    expect(groups.find(group => group.label === 'Other')?.entries[0].key).toBe('pages/privacy');
  });

  it('supports excluding entries from one dynamic hub mount', () => {
    const filtered = { ...config, navStructure: [{ label: 'Website', items: [{ dynamic: 'projects', exclude: ['second'] }] }] };
    const groups = buildNavigation(filtered, { projects: ['first', 'second'] }, {});
    expect(groups[0].entries.map(entry => entry.key)).toEqual(['projects/new', 'projects/first']);
  });

  it('uses one visible drag handle and reveals fallback move controls on demand', async () => {
    const user = userEvent.setup();
    render(<Sidebar config={config} tree={{ pages: ['home'], projects: ['first', 'second'] }} searchIndex={{
      'projects/first': [{ name: 'order', label: 'Order', hint: '', value: '1' }],
      'projects/second': [{ name: 'order', label: 'Order', hint: '', value: '2' }],
    }} activeKey={null} open onClose={() => {}} onOpenEntry={() => {}} onReorder={() => {}} onOpenMenus={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reorder First' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Move First earlier' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reorder First' }));
    expect(screen.getByRole('button', { name: 'Move First earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move First later' })).toBeEnabled();
  });

  it('preserves excluded hub entries when reordering the visible subset', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const filtered = { ...config, navStructure: [{ label: 'Website', items: [{ dynamic: 'projects', exclude: ['hidden'] }] }] };
    render(<Sidebar config={filtered} tree={{ projects: ['first', 'second', 'hidden'] }} searchIndex={{
      'projects/first': [{ name: 'order', label: 'Order', hint: '', value: '1' }],
      'projects/second': [{ name: 'order', label: 'Order', hint: '', value: '2' }],
      'projects/hidden': [{ name: 'order', label: 'Order', hint: '', value: '3' }],
    }} activeKey={null} open onClose={() => {}} onOpenEntry={() => {}} onReorder={onReorder} onOpenMenus={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Reorder Second' }));
    await user.click(screen.getByRole('button', { name: 'Move Second earlier' }));
    expect(onReorder).toHaveBeenCalledWith('projects', ['second', 'first', 'hidden']);
  });
});

describe('Manage menus visibility', () => {
  // A site whose templates were never wired up to render a menu from
  // Menu Manager (config.menuSlots undeclared/empty - true of every site
  // in the fleet today) must never surface a link that leads to a
  // fully-functional-looking screen with nowhere for a created menu to go.
  it('hides "Manage menus" when the site has declared no menu slots', () => {
    render(<Sidebar config={config} tree={{ pages: ['home'] }} searchIndex={{}} activeKey={null} open onClose={() => {}} onOpenEntry={() => {}} onReorder={() => {}} onOpenMenus={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Manage menus' })).not.toBeInTheDocument();
  });

  it('shows "Manage menus" once the site declares at least one menu slot', () => {
    const withSlots = { ...config, menuSlots: { header_primary: { label: 'Header' } } };
    render(<Sidebar config={withSlots} tree={{ pages: ['home'] }} searchIndex={{}} activeKey={null} open onClose={() => {}} onOpenEntry={() => {}} onReorder={() => {}} onOpenMenus={() => {}} />);
    expect(screen.getByRole('button', { name: 'Manage menus' })).toBeInTheDocument();
  });
});
