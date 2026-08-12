import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageField, ImagesField } from './MediaFields';
import { api } from '../../api/client';
import type { FieldConfig } from '../../api/types';

vi.mock('../../api/client', () => ({ api: { uploads: vi.fn().mockResolvedValue({ files: [] }), uploadImage: vi.fn() } }));

afterEach(cleanup);

const field: FieldConfig = { name: 'card_image', label: 'Hub Card Image', type: 'image' };

describe('ImageField', () => {
  it('clears to null (not an empty {src,alt} object) when Remove is clicked', async () => {
    // A present-but-empty { src: '', alt: '' } round-trips through save as a
    // real value, defeating the server's null/undefined/'' "field cleared"
    // filter and the content schema's z.optional() — the saved page then
    // fails the Astro build wherever it's rendered. null clears the field
    // for real.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ImageField field={field} value={{ src: '/assets/uploads/pool.webp', alt: 'A pool' }} onChange={onChange} onNotice={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: `Remove ${field.label}` }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a preview derived from the current value, not a stale server-computed preview', () => {
    // `preview` is computed once by the server when the entry loads and
    // never refreshes for the rest of the editing session. Once this field's
    // value moves on (a fresh pick, an upload, a drop), showing `preview`
    // over the current value re-displays whatever photo the field held at
    // page-load time — the field looks like it reverted even though the
    // underlying value is correct.
    render(<ImageField
      field={field}
      value={{ src: '../../assets/uploads/new-photo.webp', alt: 'New photo' }}
      preview="/api/preview?p=src%2Fassets%2Fuploads%2Fold-photo.webp"
      onChange={vi.fn()}
      onNotice={vi.fn()}
    />);

    const img = screen.getByAltText('New photo') as HTMLImageElement;
    expect(img.src).toContain('new-photo.webp');
    expect(img.src).not.toContain('old-photo.webp');
  });

  it('uploads a dropped file and applies it to the field', async () => {
    vi.mocked(api.uploadImage).mockResolvedValue({ path: '../../assets/uploads/dropped.webp', name: 'dropped.webp', preview: '/api/preview?p=src%2Fassets%2Fuploads%2Fdropped.webp' });
    const onChange = vi.fn();
    render(<ImageField field={field} value={undefined} onChange={onChange} onNotice={vi.fn()} />);

    const dropzone = screen.getByText('Add a photo').closest('.image-field') as HTMLElement;
    const file = new File(['x'], 'dropped.webp', { type: 'image/webp' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ src: '../../assets/uploads/dropped.webp', alt: '' }));
  });
});

const arrayField: FieldConfig = { name: 'gallery_photos', label: 'Photos', type: 'images' };

describe('ImagesField', () => {
  it('uploads multiple dropped files and appends all of them, not just the last one', async () => {
    // Each onChange call only sees the `value` prop as of the last render,
    // which does not update mid-loop between awaited uploads — appending by
    // reading that stale prop on each iteration would silently drop earlier
    // files instead of accumulating them.
    vi.mocked(api.uploadImage)
      .mockResolvedValueOnce({ path: '../../assets/uploads/one.webp', name: 'one.webp', preview: '' })
      .mockResolvedValueOnce({ path: '../../assets/uploads/two.webp', name: 'two.webp', preview: '' });
    const onChange = vi.fn();
    render(<ImagesField field={arrayField} value={[]} onChange={onChange} onNotice={vi.fn()} />);

    const dropzone = screen.getByText(/Add photo/);
    const files = [new File(['a'], 'one.webp', { type: 'image/webp' }), new File(['b'], 'two.webp', { type: 'image/webp' })];
    fireEvent.drop(dropzone, { dataTransfer: { files } });

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
      { src: '../../assets/uploads/one.webp', alt: '' },
      { src: '../../assets/uploads/two.webp', alt: '' },
    ]));
  });
});
