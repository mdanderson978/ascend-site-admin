import { useMemo } from 'react';
import type { AdminConfig, BlockPreviews, BlockValue, ContentData, ContentValue, EntryResponse, FieldConfig } from '../../api/types';
import { ImageField, ImagesField, ListField, PdfField, PdfsField } from './MediaFields';
import { MarkdownEditor } from './MarkdownEditor';
import { IdentityCard } from './IdentityCard';
import { BlocksField } from './BlocksField';
import { formatFriendlyDate, parseFuzzyDate } from '../../lib/content';

interface EntryFormProps {
  entry: EntryResponse;
  config: AdminConfig;
  errors: Record<string, string>;
  pageName?: string;
  canRename: boolean;
  liveUrl: string;
  onRenamed: (newSlug: string) => void;
  onDataChange: (data: ContentData) => void;
  onBodyChange: (body: string) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

export function validateEntry(fields: FieldConfig[], data: ContentData): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === 'heading' || field.type === 'markdown') continue;
    const value = data[field.name];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (field.required && empty) errors[field.name] = `${field.label} cannot be empty.`;
    if (field.type === 'number' && !empty && !Number.isFinite(Number(String(value).replace(/[$,\s]/g, '')))) errors[field.name] = `${field.label} must be a number.`;
    if (field.type === 'date' && !empty && !parseFuzzyDate(String(value))) errors[field.name] = `${field.label} isn't a valid date. Use YYYY-MM-DD or DD/MM/YYYY, e.g. 2026-08-30 or 30/08/2026.`;
    if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) errors[field.name] = `${field.label} is ${value.length - field.maxLength} characters too long.`;
    if (field.type === 'image' && value && typeof value === 'object' && !Array.isArray(value) && 'src' in value) {
      if (field.required && !value.src) errors[field.name] = `${field.label} needs a photo.`;
      else if (value.src && !String(value.alt || '').trim()) errors[field.name] = `${field.label} needs an image description.`;
    }
    if (field.type === 'image' && typeof value === 'string' && value) errors[field.name] = `${field.label} needs an image description.`;
    if (field.type === 'images' && Array.isArray(value) && value.some(item => typeof item === 'string' ? Boolean(item) : typeof item === 'object' && item && 'src' in item && item.src && !String(item.alt || '').trim())) errors[field.name] = `Every photo in ${field.label} needs an image description.`;
    if (field.type === 'blocks' && Array.isArray(value)) {
      if (typeof field.min === 'number' && value.length < field.min) errors[field.name] = `${field.label} needs at least ${field.min} block${field.min === 1 ? '' : 's'}.`;
      if (typeof field.max === 'number' && value.length > field.max) errors[field.name] = `${field.label} allows at most ${field.max} block${field.max === 1 ? '' : 's'}.`;
      const byType = Object.fromEntries((field.blockTypes || []).map(bt => [bt.id, bt]));
      for (const [index, block] of (value as BlockValue[]).entries()) {
        const def = block && typeof block === 'object' ? byType[block.type] : undefined;
        if (!def) continue; // an unrecognized type is a server-side/data-integrity concern, not a client UX validation
        for (const [key, message] of Object.entries(validateEntry(def.fields, block))) errors[`${field.name}[${index}].${key}`] = message;
      }
    }
  }
  return errors;
}

export function Field({ field, value, body, preview, config, entryKey, allData, error, errors, idPrefix = '', onChange, onBodyChange, onNotice }: { field: FieldConfig; value: ContentValue | undefined; body: string; preview?: string | Array<string | null> | BlockPreviews; config: AdminConfig; entryKey: string; allData: ContentData; error?: string; errors?: Record<string, string>; idPrefix?: string; onChange: (value: ContentValue) => void; onBodyChange: (value: string) => void; onNotice: EntryFormProps['onNotice'] }) {
  // idPrefix disambiguates a sub-field's DOM id when Field() is invoked
  // recursively for a block's own fields (BlocksField) — two blocks of the
  // same type both expanded would otherwise both render id="field-heading",
  // an invalid duplicate id that breaks label association for whichever
  // one isn't first in the DOM.
  const id = `field-${idPrefix}${field.name.replace(/[^a-z0-9_-]/gi, '-')}`;
  const type = field.type || 'string';
  let control;
  // Set only for type === 'date' below — an immediate, unambiguous "this is
  // what got understood" confirmation (e.g. "Sunday, 30 August 2026"),
  // since the input accepts several delimiters/orders and a silent
  // misreading (day/month swapped) would otherwise only surface after
  // Publish, if at all.
  let datePreview: string | null = null;
  if (type === 'boolean') control = <label className="toggle"><input id={id} type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{value ? 'On' : 'Off'}</strong></label>;
  else if (type === 'number') control = <input id={id} type="text" inputMode="decimal" value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />;
  else if (type === 'date') {
    const parsed = typeof value === 'string' && value ? parseFuzzyDate(value) : null;
    datePreview = parsed ? formatFriendlyDate(parsed) : null;
    control = <input id={id} type="text" placeholder="YYYY-MM-DD" value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />;
  }
  else if (type === 'text' || type === 'textarea') control = <textarea id={id} rows={4} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />;
  else if (type === 'markdown') control = <MarkdownEditor value={body} onChange={onBodyChange} config={config} pageKey={entryKey} data={allData} onNotice={onNotice} />;
  else if (type === 'image') control = <ImageField field={field} value={value} onChange={onChange} onNotice={onNotice} preview={typeof preview === 'string' ? preview : undefined} preset={config.imageSizes[field.size || field.imageType || 'hero']} />;
  else if (type === 'images') control = <ImagesField field={field} value={value} onChange={onChange} onNotice={onNotice} previews={Array.isArray(preview) ? (preview as Array<string | null>) : []} preset={config.imageSizes[field.size || field.imageType || 'gallery']} />;
  else if (type === 'list') control = <ListField value={value} onChange={onChange} />;
  else if (type === 'pdf') control = <PdfField field={field} value={value} onChange={onChange} onNotice={onNotice} />;
  else if (type === 'pdfs') control = <PdfsField field={field} value={value} onChange={onChange} onNotice={onNotice} />;
  else if (type === 'blocks') control = <BlocksField field={field} value={value} preview={preview as BlockPreviews | undefined} config={config} entryKey={entryKey} allData={allData} errors={errors || {}} onChange={onChange} onNotice={onNotice} />;
  else if (type === 'select' && field.allowCustom) control = <>
    <input id={id} type="text" list={`${id}-options`} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />
    <datalist id={`${id}-options`}>{(field.options || []).map(opt => <option key={opt.value} value={opt.value} />)}</datalist>
  </>;
  else if (type === 'select') {
    const options = field.options || [];
    const hasOwnEmptyOption = options.some(opt => opt.value === '');
    control = <select id={id} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)}>{!hasOwnEmptyOption && <option value="">— Choose —</option>}{options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>;
  }
  else control = <input id={id} type="text" value={value == null ? '' : String(value)} maxLength={field.maxLength} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />;

  const length = typeof value === 'string' ? value.length : 0;
  return <div className={`form-field ${error ? 'has-error' : ''}`} data-field={field.name}>
    <div className="form-field__label"><label htmlFor={type === 'boolean' ? id : id}>{field.label}{field.required && <em>Required</em>}</label>{field.maxLength && <span className={length > field.maxLength ? 'over' : ''}>{length} / {field.maxLength}</span>}</div>
    {field.hint && <p className="field-hint">{field.hint}</p>}
    {control}
    {datePreview && <p className="field-date-preview">{datePreview}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}

export function EntryForm({ entry, config, errors, pageName, canRename, liveUrl, onRenamed, onDataChange, onBodyChange, onNotice }: EntryFormProps) {
  const assetPageName = pageName || (typeof entry.data.title === 'string' && entry.data.title.trim()) || 'this page';
  const sections = useMemo(() => {
    const output: Array<{ id: string; title?: string; hint?: string; fields: FieldConfig[] }> = [{ id: 'main', fields: [] }];
    for (const field of entry.fields) {
      if (field.type === 'heading') output.push({ id: field.name, title: field.label, hint: field.hint, fields: [] });
      else output[output.length - 1].fields.push(field);
    }
    return output.filter(section => section.fields.length > 0);
  }, [entry.fields]);
  const change = (field: FieldConfig, value: ContentValue) => onDataChange({ ...entry.data, [field.name]: value });
  return <form className="entry-form" onSubmit={event => event.preventDefault()}>
    <IdentityCard entry={entry} config={config} canRename={canRename} liveUrl={liveUrl} onRenamed={onRenamed} />
    {sections.map(section => <section className="form-card" key={section.id}>{section.title && <header className="form-card__header"><h2>{section.title}</h2>{section.hint && <p>{section.hint}</p>}</header>}<div className="form-card__fields">{section.fields.map(field => <Field key={`${entry.key || assetPageName}-${field.name}`} field={field} value={entry.data[field.name]} body={entry.body} preview={entry.previews[field.name]} config={config} entryKey={entry.key || 'unknown'} allData={entry.data} error={errors[field.name]} errors={errors} onChange={value => change(field, value)} onBodyChange={onBodyChange} onNotice={onNotice} />)}</div></section>)}
  </form>;
}
