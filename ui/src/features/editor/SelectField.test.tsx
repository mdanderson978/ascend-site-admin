import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Field } from './EntryForm';
import type { AdminConfig, FieldConfig } from '../../api/types';

afterEach(cleanup);

const config: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: '', urlPatterns: {}, renamable: [], externalLinkSurfaces: [], crossListable: {}, menuSlots: {}, imageSizes: {},
  startScreenIntro: '', startScreenNote: '', altPlaceholder: 'Describe the photo',
};

function renderField(field: FieldConfig, value: unknown) {
  render(
    <Field
      field={field}
      value={value as never}
      body=""
      config={config}
      entryKey="test-entry"
      allData={{}}
      onChange={vi.fn()}
      onBodyChange={vi.fn()}
      onNotice={vi.fn()}
    />,
  );
}

describe('select field placeholder option', () => {
  it('shows the generic "— Choose —" placeholder when the field defines no empty-value option of its own', () => {
    const field: FieldConfig = { name: 'category', label: 'Category', type: 'select', options: [{ value: 'tiling', label: 'Tiling' }] };
    renderField(field, '');

    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual(['— Choose —', 'Tiling']);
  });

  it('does not duplicate the placeholder when the field supplies its own empty-value option (e.g. "Regular Image")', () => {
    // hero_style: an unset value is a real, meaningful choice ("Regular
    // Image" - the plain, uncropped rendering), not an unanswered question,
    // so it shouldn't also get the generic "— Choose —" sitting above it.
    const field: FieldConfig = {
      name: 'hero_style', label: 'Hero Style', type: 'select',
      options: [
        { value: '', label: 'Regular Image' },
        { value: 'short', label: 'Short' },
        { value: 'tall', label: 'Tall' },
      ],
    };
    renderField(field, '');

    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual(['Regular Image', 'Short', 'Tall']);
  });
});
