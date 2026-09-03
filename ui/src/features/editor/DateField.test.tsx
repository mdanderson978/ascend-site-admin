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

describe('date field live preview', () => {
  const field: FieldConfig = { name: 'date', label: 'Date', type: 'date' };

  it('shows an unambiguous weekday + long date confirmation for valid fuzzy input, in any accepted order', () => {
    renderField(field, '30/08/2026');
    expect(screen.getByText('Sunday, 30 August 2026')).toBeInTheDocument();
  });

  it('updates the preview for canonical ISO input too', () => {
    renderField(field, '2026-08-30');
    expect(screen.getByText('Sunday, 30 August 2026')).toBeInTheDocument();
  });

  it('shows no preview while input is empty', () => {
    renderField(field, '');
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });

  it('shows no preview for unparseable/ambiguous input', () => {
    renderField(field, '08-30-2026');
    expect(screen.queryByText(/August/)).not.toBeInTheDocument();
  });
});
