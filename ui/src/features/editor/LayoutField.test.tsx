import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutField } from './LayoutField';
import type { AdminConfig, LayoutRoot } from '../../api/types';

afterEach(cleanup);

const config: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: '', urlPatterns: {}, renamable: [], externalLinkSurfaces: [], crossListable: {}, menuSlots: {}, githubRepo: null, deployWorkflowFile: 'publish-deploy.yml', imageSizes: {},
  startScreenIntro: '', startScreenNote: '', altPlaceholder: '',
  elementLibrary: {
    schema: 1,
    choices: {
      tokens: { tone: [{ value: 'default', label: 'Plain' }, { value: 'dark', label: 'Dark' }] },
      alignments: ['start', 'center'],
      headingLevels: ['h2', 'h3'],
    },
    children: { layout: ['section', 'article'], section: ['heading', 'prose', 'callout'], article: ['heading', 'prose', 'callout'] },
    elements: [
      {
        name: 'section', title: 'Section', group: 'Layout', container: true, allowedParents: ['layout'],
        defaults: { tone: 'default' },
        fields: { tone: { type: 'token', scale: 'tone', label: 'Background colour' } },
        tabs: { Style: ['tone'] },
      },
      {
        name: 'article', title: 'Article', group: 'Layout', container: true, allowedParents: ['layout'],
        defaults: {}, fields: {}, tabs: { Advanced: [] },
      },
      {
        name: 'heading', title: 'Heading', group: 'Text', container: false, allowedParents: ['section', 'article'],
        defaults: { level: 'h2' },
        fields: {
          text: { type: 'string', label: 'Heading', required: true },
          level: { type: 'heading-level', label: 'Heading level' },
        },
        tabs: { Content: ['text'], Advanced: ['level'] },
      },
      {
        name: 'prose', title: 'Text', group: 'Text', container: false, allowedParents: ['section', 'article'],
        defaults: {}, fields: { html: { type: 'richtext', label: 'Text', headings: true } }, tabs: { Content: ['html'] },
      },
      {
        name: 'callout', title: 'Callout', group: 'Text', container: false, allowedParents: ['section', 'article'],
        defaults: { variant: 'note' }, fields: { text: { type: 'text', label: 'Message' }, reviewed: { type: 'date', label: 'Reviewed date' } }, tabs: { Content: ['text', 'reviewed'] },
      },
    ],
  },
};

describe('LayoutField', () => {
  it('builds a nested layout from the engine catalogue and edits its generated form', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onNotice = vi.fn();
    const { rerender } = render(<LayoutField value={undefined} config={config} onChange={onChange} onNotice={onNotice} />);

    expect(screen.getByText('This page has no builder content yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Section/ }));
    const withSection = onChange.mock.calls[0][0] as LayoutRoot;
    expect(withSection.children[0]).toEqual(expect.objectContaining({ type: 'section', props: { tone: 'default' }, children: [] }));

    rerender(<LayoutField value={withSection} config={config} onChange={onChange} onNotice={onNotice} />);
    expect(screen.getByLabelText('Background colour')).toHaveValue('default');
    await user.click(screen.getByRole('button', { name: /Heading/ }));
    const withHeading = onChange.mock.calls[1][0] as LayoutRoot;
    expect(withHeading.children[0].children?.[0]).toEqual(expect.objectContaining({ type: 'heading', props: { level: 'h2' } }));

    rerender(<LayoutField value={withHeading} config={config} onChange={onChange} onNotice={onNotice} />);
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'A useful guide' } });
    const edited = onChange.mock.calls[2][0] as LayoutRoot;
    expect(edited.children[0].children?.[0].props?.text).toBe('A useful guide');
  });

  it('moves and removes top-level blocks without drag and drop', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const layout: LayoutRoot = {
      schema: 1,
      children: [
        { type: 'section', id: 'first1', props: { tone: 'default' }, children: [] },
        { type: 'article', id: 'second', props: {}, children: [] },
      ],
    };
    const { rerender } = render(<LayoutField value={layout} config={config} onChange={onChange} onNotice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Move Section down' }));
    expect((onChange.mock.calls[0][0] as LayoutRoot).children.map(node => node.id)).toEqual(['second', 'first1']);
    await user.click(screen.getByRole('button', { name: 'Remove Article' }));
    const removed = onChange.mock.calls[1][0] as LayoutRoot;
    expect(removed.children.map(node => node.id)).toEqual(['first1']);
    rerender(<LayoutField value={removed} config={config} onChange={onChange} onNotice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Undo page change' }));
    expect((onChange.mock.calls[2][0] as LayoutRoot).children.map(node => node.id)).toEqual(['first1', 'second']);
    rerender(<LayoutField value={onChange.mock.calls[2][0]} config={config} onChange={onChange} onNotice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Redo page change' }));
    expect((onChange.mock.calls[3][0] as LayoutRoot).children.map(node => node.id)).toEqual(['first1']);
  });

  it('keeps an unknown element visible and removable instead of crashing', () => {
    render(<LayoutField value={{ schema: 1, children: [{ type: 'site_widget', id: 'custom' }] }} config={config} onChange={vi.fn()} onNotice={vi.fn()} />);
    expect(screen.getByText(/newer or site-specific element library/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove site_widget' })).toBeInTheDocument();
  });

  it('inserts a slash-menu component directly after the active prose node', async () => {
    const onChange = vi.fn();
    const layout: LayoutRoot = {
      schema: 1,
      children: [{ type: 'article', id: 'article', props: {}, children: [{ type: 'prose', id: 'prose1', props: { html: '' } }] }],
    };
    render(<LayoutField value={layout} config={config} onChange={onChange} onNotice={vi.fn()} />);
    fireEvent.click(within(screen.getByLabelText('Page outline')).getByRole('button', { name: /^Text/ }));
    const surface = await screen.findByLabelText('Text');
    fireEvent.keyDown(surface, { key: '/' });
    fireEvent.keyDown(surface, { key: 'Enter' });
    const changed = onChange.mock.calls[0][0] as LayoutRoot;
    expect(changed.children[0].children?.map(node => node.type)).toEqual(['prose', 'callout']);
    expect(changed.children[0].children?.[1].props).toEqual({ variant: 'note' });
  });

  it('uses the browser calendar control for registry date fields', () => {
    const onChange = vi.fn();
    const layout: LayoutRoot = {
      schema: 1,
      children: [{ type: 'article', id: 'article', props: {}, children: [{ type: 'callout', id: 'callout', props: { variant: 'note', reviewed: '2026-11-07' } }] }],
    };
    render(<LayoutField value={layout} config={config} onChange={onChange} onNotice={vi.fn()} />);
    fireEvent.click(within(screen.getByLabelText('Page outline')).getByRole('button', { name: /^Callout/ }));
    const input = screen.getByLabelText('Reviewed date');
    expect(input).toHaveAttribute('type', 'date');
    fireEvent.change(input, { target: { value: '2026-12-01' } });
    expect((onChange.mock.calls[0][0] as LayoutRoot).children[0].children?.[0].props?.reviewed).toBe('2026-12-01');
  });
});
