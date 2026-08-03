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
  tasks: [], shortcodes: {}, siteUrl: '', urlPatterns: {}, imageSizes: {}, startScreenIntro: '', startScreenNote: '', altPlaceholder: '',
};

describe('buildNavigation', () => {
  it('mounts configured pages, sorted dynamic entries and a create action', () => {
    const groups = buildNavigation(config, { pages: ['home'], projects: ['second', 'first'] }, {
      'projects/first': [{ name: 'order', label: 'Order', hint: '', value: '1' }],
      'projects/second': [{ name: 'order', label: 'Order', hint: '', value: '2' }],
    });
    expect(groups[0].entries.map(entry => entry.key)).toEqual(['pages/home', 'projects/first', 'projects/second', 'projects/new']);
    expect(groups[0].entries[1]).toMatchObject({ sub: true, collection: 'projects' });
  });

  it('keeps unconfigured static content visible under Other', () => {
    const groups = buildNavigation(config, { pages: ['home', 'privacy'], projects: [] }, {});
    expect(groups.find(group => group.label === 'Other')?.entries[0].key).toBe('pages/privacy');
  });

  it('supports excluding entries from one dynamic hub mount', () => {
    const filtered = { ...config, navStructure: [{ label: 'Website', items: [{ dynamic: 'projects', exclude: ['second'] }] }] };
    const groups = buildNavigation(filtered, { projects: ['first', 'second'] }, {});
    expect(groups[0].entries.map(entry => entry.key)).toEqual(['projects/first', 'projects/new']);
  });

  it('uses one visible drag handle and reveals fallback move controls on demand', async () => {
    const user = userEvent.setup();
    render(<Sidebar config={config} tree={{ pages: ['home'], projects: ['first', 'second'] }} searchIndex={{
      'projects/first': [{ name: 'order', label: 'Order', hint: '', value: '1' }],
      'projects/second': [{ name: 'order', label: 'Order', hint: '', value: '2' }],
    }} activeKey={null} open onClose={() => {}} onOpenEntry={() => {}} onReorder={() => {}} />);
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
    }} activeKey={null} open onClose={() => {}} onOpenEntry={() => {}} onReorder={onReorder} />);
    await user.click(screen.getByRole('button', { name: 'Reorder Second' }));
    await user.click(screen.getByRole('button', { name: 'Move Second earlier' }));
    expect(onReorder).toHaveBeenCalledWith('projects', ['second', 'first', 'hidden']);
  });
});
