import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

function ToolbarButton({ active = false, disabled = false, label, onClick, children }: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return <button
    type="button"
    className={active ? 'is-active' : ''}
    disabled={disabled}
    aria-label={label}
    aria-pressed={active}
    onMouseDown={event => { event.preventDefault(); onClick(); }}
  >{children}</button>;
}

export interface SlashItem { type: string; title: string; icon?: string }

export function RichTextEditor({ value, headings, label, onChange, slashItems = [], onInsertBlock }: {
  value: string;
  headings?: boolean;
  label: string;
  onChange: (html: string) => void;
  slashItems?: SlashItem[];
  onInsertBlock?: (type: string) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const insertRef = useRef(onInsertBlock);
  insertRef.current = onInsertBlock;
  const itemsRef = useRef(slashItems);
  itemsRef.current = slashItems;
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashOpenRef = useRef(false);
  const slashIndexRef = useRef(0);
  const setMenu = (open: boolean, index = 0) => {
    slashOpenRef.current = open;
    slashIndexRef.current = index;
    setSlashOpen(open);
    setSlashIndex(index);
  };
  const chooseSlashItem = (index: number) => {
    const item = itemsRef.current[index];
    if (!item) return;
    setMenu(false);
    insertRef.current?.(item.type);
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: headings ? { levels: [2, 3] } : false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { target: null, rel: null },
        },
      }),
      Placeholder.configure({ placeholder: 'Start writing, or paste from Word or Google Docs…' }),
    ],
    content: value || '',
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'rich-text-editor__surface', 'aria-label': label },
      handleKeyDown: (view, event) => {
        if (slashOpenRef.current) {
          const count = itemsRef.current.length;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setMenu(true, (slashIndexRef.current + step + count) % count);
            return true;
          }
          if (event.key === 'Enter') { event.preventDefault(); chooseSlashItem(slashIndexRef.current); return true; }
          if (event.key === 'Escape') { event.preventDefault(); setMenu(false); return true; }
          setMenu(false);
        }
        if (event.key !== '/' || !itemsRef.current.length || !insertRef.current) return false;
        const { $from, empty } = view.state.selection;
        // Components are siblings in the layout tree, not hidden inside rich
        // text. Open the menu only from a new empty paragraph at the end, so
        // the component's position is unambiguous and no prose is split/lost.
        const finalEmptyParagraph = empty
          && $from.parent.type.name === 'paragraph'
          && $from.parent.textContent === ''
          && $from.parentOffset === 0
          && $from.pos === view.state.doc.content.size - 1;
        if (!finalEmptyParagraph) return false;
        event.preventDefault();
        setMenu(true, 0);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.isEmpty ? '' : current.getHTML()),
  }, [Boolean(headings)]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== value) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="rich-text-editor is-loading">Preparing the editor…</div>;
  const setLink = () => {
    const previous = String(editor.getAttributes('link').href || '');
    const href = window.prompt('Link address', previous);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };

  return <div className="rich-text-editor">
    <div className="rich-text-editor__toolbar" role="toolbar" aria-label={`${label} formatting`}>
      <ToolbarButton label="Paragraph" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}>P</ToolbarButton>
      {headings && <>
        <ToolbarButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
        <ToolbarButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
      </>}
      <span className="rich-text-editor__divider" aria-hidden="true" />
      <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
      <ToolbarButton label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}>Link</ToolbarButton>
      <span className="rich-text-editor__divider" aria-hidden="true" />
      <ToolbarButton label="Undo" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>↶</ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>↷</ToolbarButton>
    </div>
    <EditorContent editor={editor} />
    {slashOpen && <div className="rich-text-editor__slash" role="listbox" aria-label="Insert a component">
      <p><strong>Add a component</strong><span>after this text</span></p>
      {slashItems.map((item, index) => <button
        type="button"
        role="option"
        aria-selected={index === slashIndex}
        className={index === slashIndex ? 'is-selected' : ''}
        key={item.type}
        onMouseEnter={() => setMenu(true, index)}
        onMouseDown={event => { event.preventDefault(); chooseSlashItem(index); }}
      ><span aria-hidden="true">{item.icon || '□'}</span>{item.title}</button>)}
    </div>}
    <p className="rich-text-editor__paste-hint">Paste normally — fonts, colours and unsafe markup are removed automatically.</p>
  </div>;
}
