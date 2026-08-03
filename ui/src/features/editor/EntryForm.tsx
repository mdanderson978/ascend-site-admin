import { useMemo } from 'react';
import type { AdminConfig, ContentData, ContentValue, EntryResponse, FieldConfig } from '../../api/types';
import { ImageField, ImagesField, ListField, PdfField, PdfsField } from './MediaFields';
import { MarkdownEditor } from './MarkdownEditor';

interface EntryFormProps {
  entry: EntryResponse;
  config: AdminConfig;
  errors: Record<string, string>;
  pageName?: string;
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
    if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) errors[field.name] = `${field.label} is ${value.length - field.maxLength} characters too long.`;
    if (field.type === 'image' && value && typeof value === 'object' && !Array.isArray(value) && 'src' in value) {
      if (field.required && !value.src) errors[field.name] = `${field.label} needs a photo.`;
      else if (value.src && !String(value.alt || '').trim()) errors[field.name] = `${field.label} needs an image description.`;
    }
    if (field.type === 'image' && typeof value === 'string' && value) errors[field.name] = `${field.label} needs an image description.`;
    if (field.type === 'images' && Array.isArray(value) && value.some(item => typeof item === 'string' ? Boolean(item) : typeof item === 'object' && item && 'src' in item && item.src && !String(item.alt || '').trim())) errors[field.name] = `Every photo in ${field.label} needs an image description.`;
  }
  return errors;
}

function Field({ field, value, body, preview, config, entryKey, allData, error, onChange, onBodyChange, onNotice }: { field: FieldConfig; value: ContentValue | undefined; body: string; preview?: string | Array<string | null>; config: AdminConfig; entryKey: string; allData: ContentData; error?: string; onChange: (value: ContentValue) => void; onBodyChange: (value: string) => void; onNotice: EntryFormProps['onNotice'] }) {
  const id = `field-${field.name.replace(/[^a-z0-9_-]/gi, '-')}`;
  const type = field.type || 'string';
  let control;
  if (type === 'boolean') control = <label className="toggle"><input id={id} type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{value ? 'On' : 'Off'}</strong></label>;
  else if (type === 'number') control = <input id={id} type="text" inputMode="decimal" value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />;
  else if (type === 'text' || type === 'textarea') control = <textarea id={id} rows={4} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />;
  else if (type === 'markdown') control = <MarkdownEditor value={body} onChange={onBodyChange} config={config} pageKey={entryKey} data={allData} onNotice={onNotice} />;
  else if (type === 'image') control = <ImageField field={field} value={value} onChange={onChange} onNotice={onNotice} preview={typeof preview === 'string' ? preview : undefined} preset={config.imageSizes[field.size || field.imageType || 'hero']} />;
  else if (type === 'images') control = <ImagesField field={field} value={value} onChange={onChange} onNotice={onNotice} previews={Array.isArray(preview) ? preview : []} preset={config.imageSizes[field.size || field.imageType || 'gallery']} />;
  else if (type === 'list') control = <ListField value={value} onChange={onChange} />;
  else if (type === 'pdf') control = <PdfField field={field} value={value} onChange={onChange} onNotice={onNotice} />;
  else if (type === 'pdfs') control = <PdfsField field={field} value={value} onChange={onChange} onNotice={onNotice} />;
  else control = <input id={id} type="text" value={value == null ? '' : String(value)} maxLength={field.maxLength} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} />;

  const length = typeof value === 'string' ? value.length : 0;
  return <div className={`form-field ${error ? 'has-error' : ''}`} data-field={field.name}>
    <div className="form-field__label"><label htmlFor={type === 'boolean' ? id : id}>{field.label}{field.required && <em>Required</em>}</label>{field.maxLength && <span className={length > field.maxLength ? 'over' : ''}>{length} / {field.maxLength}</span>}</div>
    {field.hint && <p className="field-hint">{field.hint}</p>}
    {control}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}

export function EntryForm({ entry, config, errors, pageName, onDataChange, onBodyChange, onNotice }: EntryFormProps) {
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
  return <form className="entry-form" onSubmit={event => event.preventDefault()}>{sections.map(section => <section className="form-card" key={section.id}>{section.title && <header className="form-card__header"><h2>{section.title}</h2>{section.hint && <p>{section.hint}</p>}</header>}<div className="form-card__fields">{section.fields.map(field => <Field key={`${entry.key || assetPageName}-${field.name}`} field={field} value={entry.data[field.name]} body={entry.body} preview={entry.previews[field.name]} config={config} entryKey={entry.key || 'unknown'} allData={entry.data} error={errors[field.name]} onChange={value => change(field, value)} onBodyChange={onBodyChange} onNotice={onNotice} />)}</div></section>)}</form>;
}
