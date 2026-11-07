import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RichTextEditor } from './RichTextEditor';

afterEach(cleanup);

describe('RichTextEditor', () => {
  it('shows formatted content instead of exposing HTML to the editor', () => {
    render(<RichTextEditor label="Text" headings value="<h2>A guide</h2><p>Hello <strong>world</strong>.</p>" onChange={vi.fn()} />);
    const surface = screen.getByLabelText('Text');
    expect(surface).toHaveAttribute('contenteditable', 'true');
    expect(screen.getByRole('heading', { name: 'A guide', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('world').tagName).toBe('STRONG');
    expect(screen.queryByDisplayValue(/<h2>/)).not.toBeInTheDocument();
  });

  it('keeps only the article schema when HTML is loaded', () => {
    render(<RichTextEditor
      label="Text"
      headings
      value={'<h1 style="color:red">Wrong level</h1><p class="foreign">Safe <strong onclick="bad()">text</strong></p><img src="x"><script>alert(1)</script>'}
      onChange={vi.fn()}
    />);
    const html = screen.getByLabelText('Text').innerHTML;
    expect(html).toContain('Wrong level');
    expect(html).toContain('Safe');
    expect(html).not.toMatch(/<(?:h1|img|script)\b/i);
    expect(html).not.toMatch(/(?:style|class|onclick)=/i);
  });

  it('emits clean HTML as the editor types and offers undo/redo controls', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichTextEditor label="Text" value="" onChange={onChange} />);
    const surface = screen.getByLabelText('Text');
    await user.click(surface);
    await user.type(surface, 'Plain words');
    expect(onChange).toHaveBeenLastCalledWith('<p>Plain words</p>');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });

  it('normalises pasted office-style HTML through the strict editor schema', () => {
    const onChange = vi.fn();
    render(<RichTextEditor label="Text" headings value="" onChange={onChange} />);
    const surface = screen.getByLabelText('Text');
    fireEvent.paste(surface, {
      clipboardData: {
        types: ['text/html', 'text/plain'],
        getData: (type: string) => type === 'text/html'
          ? '<p class="MsoNormal" style="font-family:Arial;color:red">Useful <b>words</b></p><iframe src="bad"></iframe>'
          : 'Useful words',
      },
    });
    const html = onChange.mock.calls.at(-1)?.[0] || '';
    expect(html).toContain('<p>Useful <strong>words</strong></p>');
    expect(html).not.toMatch(/class=|style=|iframe/i);
  });

  it('opens the component menu with slash in a final empty paragraph and supports the keyboard', () => {
    const onInsertBlock = vi.fn();
    render(<RichTextEditor
      label="Text"
      value=""
      slashItems={[
        { type: 'callout', title: 'Callout', icon: '!' },
        { type: 'faq', title: 'FAQ', icon: '?' },
      ]}
      onInsertBlock={onInsertBlock}
      onChange={vi.fn()}
    />);
    const surface = screen.getByLabelText('Text');
    fireEvent.keyDown(surface, { key: '/' });
    expect(screen.getByRole('listbox', { name: 'Insert a component' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Callout/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(surface, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /FAQ/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(surface, { key: 'Enter' });
    expect(onInsertBlock).toHaveBeenCalledWith('faq');
    expect(screen.queryByRole('listbox', { name: 'Insert a component' })).not.toBeInTheDocument();
  });

  it('does not open the component menu in the middle of existing prose', () => {
    render(<RichTextEditor label="Text" value="<p>Existing words</p>" slashItems={[{ type: 'callout', title: 'Callout' }]} onInsertBlock={vi.fn()} onChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText('Text'), { key: '/' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
