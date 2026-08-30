import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RenameDialog } from './RenameDialog';
import { api } from '../../api/client';
import type { RenamePreview, RenameResult } from '../../api/types';

vi.mock('../../api/client', () => ({ api: { renamePreview: vi.fn(), rename: vi.fn() } }));

afterEach(cleanup);
beforeEach(() => { vi.mocked(api.renamePreview).mockReset(); vi.mocked(api.rename).mockReset(); });

const basePreview: RenamePreview = {
  ok: true,
  oldPath: '/old-page',
  newPath: '/new-page',
  newSlug: 'new-page',
  collision: null,
  linksToFix: [{ file: 'pages/other.md', count: 2 }],
  cascade: [],
  externalLinkSurfaces: ['Main navigation menu'],
};

describe('RenameDialog', () => {
  it('previews the sanitized slug, then commits and reports the new slug', async () => {
    vi.mocked(api.renamePreview).mockResolvedValue(basePreview);
    vi.mocked(api.rename).mockResolvedValue({ ok: true, slug: 'new-page', redirect: { from: '/old-page', to: '/new-page' }, linksFixed: 2, cascaded: 0 } satisfies RenameResult);
    const onRenamed = vi.fn();

    const user = userEvent.setup();
    render(<RenameDialog open entryKey="pages/old-page" currentSlug="old-page" currentUrl="/old-page" onClose={vi.fn()} onRenamed={onRenamed} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'New Page!!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Whitespace/punctuation is sanitized the same way the server does, before the preview call is made.
    expect(api.renamePreview).toHaveBeenCalledWith('pages/old-page', 'new-page');
    await waitFor(() => expect(screen.getByText('Main navigation menu')).toBeInTheDocument());
    expect(screen.getByText(/2 links? on 1 other page/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm rename' }));
    expect(api.rename).toHaveBeenCalledWith('pages/old-page', 'new-page');
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith('new-page'));
  });

  it('blocks confirming when the preview reports a collision', async () => {
    vi.mocked(api.renamePreview).mockResolvedValue({ ...basePreview, collision: 'filename' });

    const user = userEvent.setup();
    render(<RenameDialog open entryKey="pages/old-page" currentSlug="old-page" currentUrl="/old-page" onClose={vi.fn()} onRenamed={vi.fn()} />);

    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'taken-slug');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText(/already exists at that URL/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Confirm rename' })).toBeDisabled();
    expect(api.rename).not.toHaveBeenCalled();
  });

  it('rejects an empty slug client-side without calling the server', async () => {
    const user = userEvent.setup();
    render(<RenameDialog open entryKey="pages/old-page" currentSlug="old-page" currentUrl="/old-page" onClose={vi.fn()} onRenamed={vi.fn()} />);

    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '!!!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Enter a valid URL slug.')).toBeInTheDocument();
    expect(api.renamePreview).not.toHaveBeenCalled();
  });
});
