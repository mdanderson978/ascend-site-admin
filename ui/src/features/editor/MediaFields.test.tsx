import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageField } from './MediaFields';
import type { FieldConfig } from '../../api/types';

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
});
