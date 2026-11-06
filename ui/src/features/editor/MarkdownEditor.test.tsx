import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkdownEditor } from './MarkdownEditor';
import { api } from '../../api/client';
import type { AdminConfig } from '../../api/types';

vi.mock('../../api/client', () => ({ api: {
  uploads: vi.fn().mockResolvedValue({ files: [] }),
  uploadImage: vi.fn(),
  chatGptRecovery: vi.fn().mockResolvedValue({ recovery: null }),
  undoChatGptImport: vi.fn(),
  originalChatGptPaste: vi.fn(),
} }));

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(api.uploadImage).mockReset();
  vi.mocked(api.chatGptRecovery).mockResolvedValue({ recovery: null });
  vi.mocked(api.undoChatGptImport).mockReset();
  vi.mocked(api.originalChatGptPaste).mockReset();
});

const config: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: '', urlPatterns: {}, renamable: [], externalLinkSurfaces: [], crossListable: {}, menuSlots: {}, githubRepo: null, deployWorkflowFile: 'publish-deploy.yml', imageSizes: { gallery: { label: 'at least 800 x 400 px' } },
  startScreenIntro: '', startScreenNote: '', altPlaceholder: 'Describe the photo',
};

describe('MarkdownEditor', () => {
  it('dropping an image onto the text box uploads it and opens the same required-alt-text panel the toolbar Photo button uses', async () => {
    // Mirrors legacy admin.html's uploadAndInsertPhoto(): dropping never
    // skips straight to inserting an undescribed image, it uploads then
    // hands off to the normal photo-details panel.
    vi.mocked(api.uploadImage).mockResolvedValue({ path: '../../assets/uploads/dropped.webp', name: 'dropped.webp', preview: '/api/preview?p=dropped.webp' });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} config={config} pageKey="pages/home" data={{}} onNotice={vi.fn()} />);

    const textarea = screen.getByRole('textbox', { name: '' }) as HTMLTextAreaElement;
    const file = new File(['x'], 'dropped.webp', { type: 'image/webp' });
    fireEvent.drop(textarea, { dataTransfer: { files: [file] } });

    // The dialog markup is always present; only its native `open` attribute
    // (toggled via showModal()/close()) reflects whether it's actually up.
    await waitFor(() => expect(screen.getByText('Describe this photo').closest('dialog')).toHaveAttribute('open'));
    await user.type(screen.getByPlaceholderText('Describe the photo'), 'A tiled pool');
    await user.click(screen.getByRole('button', { name: 'Add to page' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('![A tiled pool](../../assets/uploads/dropped.webp)')));
  });

  it('ignores a dropped file that is not an image', () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} config={config} pageKey="pages/home" data={{}} onNotice={vi.fn()} />);

    const textarea = screen.getByRole('textbox', { name: '' });
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.drop(textarea, { dataTransfer: { files: [file] } });

    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(screen.getByText('Describe this photo').closest('dialog')).not.toHaveAttribute('open');
  });

  it('offers persistent copy and one-click undo controls for the last ChatGPT import', async () => {
    const recovery = { id: '1700000000000-aaaaaaaaaaaa', targetKey: 'pages/home', createdAt: 1700000000000, state: 'active' as const, canUndo: true, hasOriginalPaste: true };
    vi.mocked(api.chatGptRecovery).mockResolvedValue({ recovery });
    vi.mocked(api.originalChatGptPaste).mockResolvedValue({ source: '<p>Exact original</p>' });
    vi.mocked(api.undoChatGptImport).mockResolvedValue({ body: 'Body before import', recovery: { ...recovery, state: 'undone', canUndo: false } });
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onNotice = vi.fn();
    render(<MarkdownEditor value="Imported body" onChange={onChange} config={{ ...config, richHtmlImport: true }} pageKey="pages/home" data={{}} onNotice={onNotice} />);

    await user.click(await screen.findByRole('button', { name: 'Copy original paste' }));
    expect(api.originalChatGptPaste).toHaveBeenCalledWith('pages/home', recovery.id);
    expect(onNotice).toHaveBeenCalledWith('Original ChatGPT paste copied exactly.', 'success');

    await user.click(screen.getByRole('button', { name: 'Undo ChatGPT import' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Body before import'));
    expect(api.undoChatGptImport).toHaveBeenCalledWith('pages/home', recovery.id);
    expect(screen.queryByRole('button', { name: 'Undo ChatGPT import' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy original paste' })).toBeInTheDocument();
  });
});
