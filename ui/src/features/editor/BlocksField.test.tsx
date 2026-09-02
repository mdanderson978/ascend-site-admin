import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlocksField } from './BlocksField';
import type { AdminConfig, BlockTypeDef, BlockValue, FieldConfig } from '../../api/types';

afterEach(cleanup);

const config: AdminConfig = {
  siteTitle: 'Test', browserTitle: 'Test', pageLabels: {}, navStructure: [], dynamicCollections: {},
  tasks: [], shortcodes: {}, siteUrl: '', urlPatterns: {}, renamable: [], externalLinkSurfaces: [], crossListable: {}, menuSlots: {}, imageSizes: {},
  startScreenIntro: '', startScreenNote: '', altPlaceholder: 'Describe the photo',
};

const blockTypes: BlockTypeDef[] = [
  { id: 'stat', label: 'Stat', icon: '#️⃣', fields: [
    { name: 'number', label: 'Number', type: 'number' },
    { name: 'caption', label: 'Caption', type: 'string' },
  ] },
  { id: 'text', label: 'Text', icon: '📝', fields: [
    { name: 'heading', label: 'Heading', type: 'string' },
  ] },
];

const field: FieldConfig = { name: 'sections', label: 'Page Sections', type: 'blocks', blockTypes };

function renderBlocks(value: BlockValue[], onChange = vi.fn()) {
  render(
    <BlocksField
      field={field}
      value={value}
      config={config}
      entryKey="test-entry"
      allData={{}}
      errors={{}}
      onChange={onChange}
      onNotice={vi.fn()}
    />,
  );
  return onChange;
}

describe('BlocksField', () => {
  it('shows the palette with one card per configured block type', () => {
    renderBlocks([]);
    expect(screen.getByRole('button', { name: /Stat/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Text/ })).toBeInTheDocument();
  });

  it('clicking a palette card appends a block of that type with a unique id', async () => {
    const user = userEvent.setup();
    const onChange = renderBlocks([]);
    await user.click(screen.getByRole('button', { name: /Stat/ }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ type: 'stat', id: expect.any(String) })]);
  });

  it('clicking a palette card twice produces two blocks with different ids', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<BlocksField field={field} value={[]} config={config} entryKey="k" allData={{}} errors={{}} onChange={onChange} onNotice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Stat/ }));
    const first = onChange.mock.calls[0][0] as BlockValue[];
    rerender(<BlocksField field={field} value={first} config={config} entryKey="k" allData={{}} errors={{}} onChange={onChange} onNotice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Text/ }));
    const second = onChange.mock.calls[1][0] as BlockValue[];
    expect(second).toHaveLength(2);
    expect(second[0].id).not.toEqual(second[1].id);
  });

  it('moves a block down and up via the reorder buttons', async () => {
    const user = userEvent.setup();
    const blocks: BlockValue[] = [{ id: 'a', type: 'stat', caption: 'First' }, { id: 'b', type: 'text', heading: 'Second' }];
    const onChange = renderBlocks(blocks);
    await user.click(screen.getByRole('button', { name: /Move Stat down/ }));
    expect(onChange).toHaveBeenCalledWith([blocks[1], blocks[0]]);
  });

  it('removes exactly the targeted block with no confirmation dialog', async () => {
    const user = userEvent.setup();
    const blocks: BlockValue[] = [{ id: 'a', type: 'stat', caption: 'First' }, { id: 'b', type: 'text', heading: 'Second' }];
    const onChange = renderBlocks(blocks);
    await user.click(screen.getByRole('button', { name: /Remove Stat/ }));
    expect(onChange).toHaveBeenCalledWith([blocks[1]]);
    expect(screen.queryByText(/discard/i)).not.toBeInTheDocument();
  });

  it('editing a sub-field inside an expanded block updates only that block, at the right index', async () => {
    const user = userEvent.setup();
    const blocks: BlockValue[] = [{ id: 'a', type: 'stat', caption: 'First' }, { id: 'b', type: 'text', heading: '' }];
    const onChange = renderBlocks(blocks);
    const headingInput = screen.getByLabelText('Heading');
    await user.type(headingInput, 'X');
    const [updated] = onChange.mock.calls.at(-1) as [BlockValue[]];
    expect(updated[0]).toEqual(blocks[0]);
    expect(updated[1].heading).toBe('X');
  });

  it('shows an unrecognized block type as a removable error row instead of crashing', () => {
    renderBlocks([{ id: 'a', type: 'not-a-real-type' }]);
    expect(screen.getByText(/Unrecognized block type/)).toBeInTheDocument();
  });

  it('collapsing a block hides its fields and shows a text-field summary in the header', async () => {
    const user = userEvent.setup();
    renderBlocks([{ id: 'a', type: 'text', heading: 'My Heading' }]);
    expect(screen.getByLabelText('Heading')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse Text block' }));
    expect(screen.queryByLabelText('Heading')).not.toBeInTheDocument();
    expect(screen.getByText('My Heading')).toBeInTheDocument();
  });
});
