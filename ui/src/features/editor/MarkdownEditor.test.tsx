import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkdownEditor } from './MarkdownEditor';
import { api } from '../../api/client';
import type { AdminConfig } from '../../api/types';

vi.mock('../../api/client', () => ({ api: { uploads: vi.fn().mockResolvedValue({ files: [] }), uploadImage: vi.fn() } }));

afterEach(cleanup);
beforeEach(() => { vi.mocked(api.uploadImage).mockReset(); });

const config: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: '', urlPatterns: {}, imageSizes: { gallery: { label: 'at least 800 x 400 px' } },
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
});
