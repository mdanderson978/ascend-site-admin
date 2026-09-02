import { useState } from 'react';
import type { AdminConfig, BlockPreviews, BlockValue, ContentData, ContentValue, FieldConfig } from '../../api/types';
import { ChevronIcon, GripIcon, TrashIcon } from '../../components/Icons';
import { Field } from './EntryForm';

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A short, human-scannable label for a collapsed block's header — the
// first non-empty string/text/textarea value among that block's own
// fields, since that's usually the thing an editor would recognize the
// block by (a heading, a caption, a name). Falls back to nothing rather
// than guessing from an image or number field.
function summarize(block: BlockValue, fields: FieldConfig[]): string {
  for (const f of fields) {
    if (f.type !== 'string' && f.type !== 'text' && f.type !== 'textarea') continue;
    const v = block[f.name];
    if (typeof v === 'string' && v.trim()) return v.trim().length > 60 ? v.trim().slice(0, 60) + '…' : v.trim();
  }
  return '';
}

interface BlocksFieldProps {
  field: FieldConfig;
  value: ContentValue | undefined;
  preview?: BlockPreviews;
  config: AdminConfig;
  entryKey: string;
  allData: ContentData;
  errors: Record<string, string>;
  onChange: (value: ContentValue) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

export function BlocksField({ field, value, preview, config, entryKey, allData, errors, onChange, onNotice }: BlocksFieldProps) {
  const blocks = Array.isArray(value) ? (value as BlockValue[]) : [];
  const blockTypes = field.blockTypes || [];
  const byType = Object.fromEntries(blockTypes.map(bt => [bt.id, bt]));
  const [dragged, setDragged] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
    onChange(next);
  };
  const addBlock = (typeId: string) => onChange([...blocks, { id: newId(), type: typeId }]);
  const removeBlock = (index: number) => onChange(blocks.filter((_, i) => i !== index));
  const updateBlockField = (index: number, name: string, fieldValue: ContentValue) =>
    onChange(blocks.map((block, i) => i === index ? { ...block, [name]: fieldValue } : block));
  const toggleCollapse = (id: string) => setCollapsedIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="blocks-field">
    <div className="blocks-list">
      {blocks.map((block, index) => {
        const def = byType[block.type];
        const collapsed = collapsedIds.has(block.id);
        const blockPreviews = preview?.[index] || {};
        return <article
          key={block.id}
          className={`block-row ${dragged === index ? 'is-dragging' : ''} ${dropTarget === index && dragged !== index ? 'is-drop-target' : ''}`}
          draggable
          onDragStart={() => setDragged(index)}
          onDragOver={event => { event.preventDefault(); setDropTarget(index); }}
          onDragLeave={() => setDropTarget(current => current === index ? null : current)}
          onDrop={() => { if (dragged !== null) move(dragged, index); setDragged(null); setDropTarget(null); }}
          onDragEnd={() => { setDragged(null); setDropTarget(null); }}
        >
          <div className="block-row__header">
            <div className="block-row__handle" title="Drag to reorder"><GripIcon /></div>
            <button type="button" className="block-row__toggle" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${def?.label || block.type} block`} onClick={() => toggleCollapse(block.id)}>
              <span className={`block-row__chevron ${collapsed ? '' : 'is-open'}`}><ChevronIcon /></span>
              <span className="block-row__icon" aria-hidden="true">{def?.icon || '▢'}</span>
              <strong>{def?.label || block.type}</strong>
              {collapsed && summarize(block, def?.fields || []) && <span className="block-row__summary">{summarize(block, def?.fields || [])}</span>}
            </button>
            <div className="block-row__actions">
              <button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move ${def?.label || 'block'} up`}>↑</button>
              <button onClick={() => move(index, index + 1)} disabled={index === blocks.length - 1} aria-label={`Move ${def?.label || 'block'} down`}>↓</button>
              <button className="danger" onClick={() => removeBlock(index)} aria-label={`Remove ${def?.label || 'block'}`}><TrashIcon /></button>
            </div>
          </div>
          {!collapsed && (def
            ? <div className="block-row__fields">{def.fields.map(subField => <Field
                key={subField.name}
                field={subField}
                value={block[subField.name] as ContentValue | undefined}
                body=""
                preview={blockPreviews[subField.name]}
                config={config}
                entryKey={entryKey}
                allData={allData}
                error={errors[`${field.name}[${index}].${subField.name}`]}
                idPrefix={`${field.name}-${index}-`}
                onChange={v => updateBlockField(index, subField.name, v)}
                onBodyChange={() => {}}
                onNotice={onNotice}
              />)}</div>
            : <p className="field-hint field-hint--error">Unrecognized block type "{block.type}" — remove this block.</p>)}
        </article>;
      })}
    </div>
    <div className="blocks-field__palette">
      {blockTypes.map(bt => <button key={bt.id} type="button" className="block-palette-card" onClick={() => addBlock(bt.id)}>
        <span className="block-palette-card__icon" aria-hidden="true">{bt.icon || '▢'}</span>
        <span>{bt.label}</span>
      </button>)}
    </div>
  </div>;
}
