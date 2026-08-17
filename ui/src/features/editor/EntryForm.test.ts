import { describe, expect, it } from 'vitest';
import { validateEntry } from './EntryForm';

describe('validateEntry', () => {
  it('reports required, numeric and maximum-length errors by field', () => {
    const errors = validateEntry([
      { name: 'title', label: 'Page title', type: 'string', required: true },
      { name: 'price', label: 'Price', type: 'number' },
      { name: 'summary', label: 'Summary', type: 'string', maxLength: 5 },
    ], { title: '', price: 'not money', summary: 'too long' });
    expect(errors).toEqual({
      title: 'Page title cannot be empty.',
      price: 'Price must be a number.',
      summary: 'Summary is 3 characters too long.',
    });
  });

  it('accepts currency-formatted numbers supported by the engine', () => {
    expect(validateEntry([{ name: 'price', label: 'Price', type: 'number' }], { price: '$14,300' })).toEqual({});
  });

  it('requires a choice for required select fields, same as any other required field', () => {
    const errors = validateEntry([
      { name: 'category', label: 'Category', type: 'select', required: true, options: [{ value: 'tiling', label: 'Tiling' }] },
    ], { category: '' });
    expect(errors).toEqual({ category: 'Category cannot be empty.' });
    expect(validateEntry([
      { name: 'category', label: 'Category', type: 'select', required: true, options: [{ value: 'tiling', label: 'Tiling' }] },
    ], { category: 'tiling' })).toEqual({});
  });

  it('requires accessible descriptions for single images and galleries', () => {
    const errors = validateEntry([
      { name: 'hero', label: 'Hero image', type: 'image' },
      { name: 'gallery', label: 'Gallery', type: 'images' },
    ], {
      hero: { src: '../../assets/uploads/hero.webp', alt: '' },
      gallery: [{ src: '../../assets/uploads/one.webp', alt: 'Pool' }, { src: '../../assets/uploads/two.webp', alt: '' }],
    });
    expect(errors.hero).toMatch(/image description/);
    expect(errors.gallery).toMatch(/Every photo/);
  });
});
