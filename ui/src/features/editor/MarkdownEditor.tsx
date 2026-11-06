import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AdminConfig, ContentData, ShortcodeEntry, ShortcodeField, UploadImage } from '../../api/types';
import { Dialog } from '../../components/Dialog';
import { MediaPicker, useImageUpload } from './MediaFields';
import { previewForPath } from '../../lib/content';
import { ChatGptHtmlImport } from './ChatGptAssets';

const DEFAULT_SHORTCODES = ['insert-photo', 'thumbnail-link', 'youtube-video', 'subscribe-button', 'call-to-action', 'customer-testimonial'];

const BUILTINS: Record<string, ShortcodeEntry> = {
  'insert-photo': { id: 'insert-photo', icon: '📷', label: 'Photo' },
  'thumbnail-link': { id: 'thumbnail-link', icon: '🔗', label: 'Linked photo' },
  'youtube-video': { id: 'youtube-video', icon: '▶', label: 'YouTube', panel: { fields: [{ label: 'YouTube video link', required: true, placeholder: 'https://www.youtube.com/watch?v=…' }, { label: 'Video title', placeholder: 'Video title' }] } },
  'subscribe-button': { id: 'subscribe-button', icon: '●', label: 'Subscribe', panel: { fields: [{ label: 'YouTube channel link', required: true }, { label: 'Button text', value: 'Subscribe on YouTube' }] } },
  'sms-button': { id: 'sms-button', icon: '▣', label: 'SMS button', panel: { fields: [{ label: 'Mobile number', required: true }, { label: 'Pre-filled message', type: 'textarea' }, { label: 'Button text', value: 'Text Message' }] } },
  'call-to-action': { id: 'call-to-action', icon: '☎', label: 'Call-to-action', panel: { fields: [{ label: 'Lines', type: 'group', required: true, min: 1, max: 4, addLabel: 'Add another line', itemFields: [{ label: 'Text before the link', placeholder: 'Call us on' }, { label: 'Clickable text' }, { label: 'Link destination', placeholder: 'tel:+61… or /contact' }, { label: 'Text after the link', type: 'textarea' }, { label: 'Style', type: 'select', value: 'brand', options: [{ value: 'brand', label: 'Bold brand colour' }, { value: 'accent', label: 'Accent highlight' }, { value: 'muted', label: 'Quiet grey' }] }] }] } },
  'customer-testimonial': { id: 'customer-testimonial', icon: '❝', label: 'Testimonial', panel: { fields: [{ label: 'What the customer said', type: 'textarea', required: true }, { label: 'Customer name', required: true }, { label: 'Suburb' }, { label: 'Star rating', value: '5' }, { label: 'Full review link' }] } },
};

type FieldValue = string | string[][];

function buildDirective(entry: ShortcodeEntry, values: FieldValue[]) {
  const directive = entry.directive!;
  const attrs = Object.entries(directive.attrs || {}).flatMap(([key, source]) => {
    const value = typeof source === 'number' ? values[source] : source;
    return typeof value === 'string' && value ? [`${key}="${value.replace(/"/g, "'")}"`] : [];
  }).join(' ');
  const attrText = attrs ? `{${attrs}}` : '';
  if (directive.kind === 'leaf') return `::${directive.name}${attrText}`;
  const content = typeof directive.contentField === 'number' ? values[directive.contentField] : '';
  return `:::${directive.name}${attrText}\n${typeof content === 'string' ? content : ''}\n:::`;
}

function buildShortcode(entry: ShortcodeEntry, values: FieldValue[]): string {
  if (entry.directive) return buildDirective(entry, values);
  const stringValues = values.map(value => typeof value === 'string' ? value : '');
  switch (entry.id) {
    case 'youtube-video': return `[${stringValues[1] || 'YouTube video'}](${stringValues[0]})`;
    case 'subscribe-button': {
      const channel = stringValues[0]; const separator = channel.includes('?') ? '&' : '?';
      return `**[${stringValues[1] || 'Subscribe on YouTube'}](${channel}${channel.includes('sub_confirmation=1') ? '' : separator + 'sub_confirmation=1'})**`;
    }
    case 'sms-button': {
      const number = stringValues[0].replace(/^sms:/i, '').replace(/[^+\d]/g, '');
      return `**[${stringValues[2] || 'Text Message'}](sms:${number}${stringValues[1] ? `?body=${encodeURIComponent(stringValues[1])}` : ''})**`;
    }
    case 'call-to-action': {
      const rows = Array.isArray(values[0]) ? values[0] : [];
      const lines = rows.filter(row => row.some(Boolean)).map(([lead, label, href, trail, style]) => {
        const attributes = [lead && `lead="${lead}"`, label && href && `label="${label}"`, label && href && `href="${href}"`, trail && `trail="${trail}"`, `style="${style || 'brand'}"`].filter(Boolean).join(' ');
        return `::line{${attributes}}`;
      });
      return `:::cta\n${lines.join('\n')}\n:::`;
    }
    case 'customer-testimonial': {
      const [quote, name, suburb, rawRating, link] = stringValues;
      const rating = Math.min(5, Math.max(1, Number.parseInt(rawRating, 10) || 5));
      const paragraphs = quote.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean);
      const quoted = paragraphs.map((paragraph, index) => `${index === 0 ? '> "' : '> '}${paragraph}${index === paragraphs.length - 1 ? '"' : ''}`).join('\n>\n');
      return `${quoted}\n>\n> — **${name}${suburb ? `, ${suburb}` : ''}** ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}${link ? ` — [Read the full review](${link})` : ''}`;
    }
    default: return '';
  }
}

function ShortcodeDialog({ entry, open, onClose, onInsert }: { entry: ShortcodeEntry | null; open: boolean; onClose: () => void; onInsert: (text: string) => void }) {
  const fields = entry?.panel?.fields || [];
  const [values, setValues] = useState<FieldValue[]>([]);
  const defaultValue = (field: ShortcodeField): FieldValue => field.type === 'group' ? Array.from({ length: field.min || 1 }, () => (field.itemFields || []).map(item => item.value || '')) : field.value || '';
  useEffect(() => { if (open) setValues(fields.map(defaultValue)); }, [entry?.id, open]);
  const current = fields.map((field, index) => values[index] ?? defaultValue(field));
  const update = (index: number, value: FieldValue) => setValues(existing => fields.map((field, i) => i === index ? value : existing[i] ?? defaultValue(field)));
  const valid = fields.every((field, index) => {
    if (!field.required) return true;
    if (!Array.isArray(current[index])) return Boolean(current[index]);
    const rows = current[index] as string[][];
    return rows.some(row => row.some(Boolean)) && rows.every(row => (field.itemFields || []).every((item, itemIndex) => !item.required || Boolean(row[itemIndex])));
  });
  return <Dialog open={open} title={entry?.panel?.ariaLabel || `Add ${entry?.label || 'content'}`} onClose={onClose} actions={<><button className="button button--quiet" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={!valid} onClick={() => { if (entry) onInsert(buildShortcode(entry, current)); onClose(); }}>{entry?.panel?.submitLabel || `Add ${entry?.label || 'content'}`}</button></>}>
    <div className="dialog-form">{fields.map((field, index) => <ShortcodeInput key={`${field.label}-${index}`} field={field} value={current[index]} onChange={value => update(index, value)} />)}</div>
  </Dialog>;
}

function ShortcodeInput({ field, value, onChange }: { field: ShortcodeField; value: FieldValue; onChange: (value: FieldValue) => void }) {
  if (field.type === 'group') {
    const rows = Array.isArray(value) ? value : [];
    const itemFields = field.itemFields || [];
    return <fieldset className="group-input"><legend>{field.label}</legend>{rows.map((row, rowIndex) => <div className="group-input__row" key={rowIndex}>{itemFields.map((item, itemIndex) => <ShortcodeInput key={item.label} field={item} value={row[itemIndex] || ''} onChange={next => onChange(rows.map((current, i) => i === rowIndex ? current.map((cell, j) => j === itemIndex ? String(next) : cell) : current))} />)}<button disabled={rows.length <= (field.min || 1)} onClick={() => onChange(rows.filter((_, i) => i !== rowIndex))}>Remove</button></div>)}<button className="button button--secondary" disabled={rows.length >= (field.max || 8)} onClick={() => onChange([...rows, itemFields.map(item => item.value || '')])}>＋ {field.addLabel || 'Add row'}</button></fieldset>;
  }
  return <label><span>{field.label}{field.required && <em> required</em>}</span>{field.hint && <small>{field.hint}</small>}{field.type === 'textarea' ? <textarea rows={4} value={String(value)} placeholder={field.placeholder} onChange={event => onChange(event.target.value)} /> : field.type === 'select' ? <select value={String(value)} onChange={event => onChange(event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input value={String(value)} placeholder={field.placeholder} onChange={event => onChange(event.target.value)} />}</label>;
}

export function MarkdownEditor({ value, onChange, config, pageKey, data, onNotice }: { value: string; onChange: (value: string) => void; config: AdminConfig; pageKey: string; data: ContentData; onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [dialogEntry, setDialogEntry] = useState<ShortcodeEntry | null>(null);
  const [chatGptImportOpen, setChatGptImportOpen] = useState(false);
  const [photoMode, setPhotoMode] = useState<'plain' | 'linked' | null>(null);
  const [pickedPhoto, setPickedPhoto] = useState<UploadImage | null>(null);
  const [photoAlt, setPhotoAlt] = useState(''); const [photoTitle, setPhotoTitle] = useState(''); const [photoLink, setPhotoLink] = useState('');
  const [dragging, setDragging] = useState(false);
  // Dropping a photo straight onto the text box uploads it and opens the
  // same "describe this photo" panel the toolbar's Photo button uses —
  // dropping never skips the required alt text, it just skips picking from
  // the toolbar first.
  const { upload: uploadDropped } = useImageUpload('gallery', config.imageSizes.gallery, onNotice, file => { setPickedPhoto(file); setPhotoMode('plain'); });
  const ids = config.shortcodes?.include || DEFAULT_SHORTCODES;
  const shortcodes = [...ids.flatMap(id => BUILTINS[id] ? [BUILTINS[id]] : []), ...(config.shortcodes?.custom || [])];
  const replaceSelection = (before: string, after = '', placeholder = 'text') => {
    const input = textarea.current; if (!input) return;
    const start = input.selectionStart; const end = input.selectionEnd; const selected = value.slice(start, end) || placeholder;
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + before.length + selected.length); });
  };
  const insertBlock = (snippet: string) => {
    const input = textarea.current; const at = input?.selectionStart ?? value.length;
    const before = value.slice(0, at); const padding = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    onChange(before + padding + snippet + '\n' + value.slice(at));
  };
  const openShortcode = (entry: ShortcodeEntry) => {
    if (entry.id === 'insert-photo' || entry.id === 'thumbnail-link') { setPhotoMode(entry.id === 'insert-photo' ? 'plain' : 'linked'); return; }
    setDialogEntry(entry);
  };
  const insertPhoto = () => {
    if (!pickedPhoto || !photoAlt.trim()) return;
    const image = `![${photoAlt.trim()}](${pickedPhoto.path}${photoTitle.trim() ? ` "${photoTitle.trim()}"` : ''})`;
    insertBlock(photoMode === 'linked' ? `[${image}](${photoLink.trim()})` : image);
    setPickedPhoto(null); setPhotoMode(null); setPhotoAlt(''); setPhotoTitle(''); setPhotoLink(''); onNotice('Photo added to the page.', 'success');
  };
  return <div className="markdown-editor">
    <div className="markdown-toolbar" role="toolbar" aria-label="Markdown formatting">
      <button onClick={() => replaceSelection('**', '**', 'bold text')} title="Bold"><strong>B</strong></button>
      <button onClick={() => replaceSelection('*', '*', 'italic text')} title="Italic"><em>I</em></button>
      <button onClick={() => replaceSelection('## ', '', 'Heading')} title="Heading">H2</button>
      <button onClick={() => replaceSelection('[', '](https://)', 'link text')} title="Link">Link</button>
      <button onClick={() => replaceSelection('- ', '', 'List item')} title="List">List</button>
      <span className="toolbar-separator" />
      {shortcodes.map(entry => <button key={entry.id} onClick={() => openShortcode(entry)} title={entry.tooltip || entry.label}><span aria-hidden="true">{entry.icon}</span> {entry.label}</button>)}
      {config.richHtmlImport && <button className="chatgpt-assets-button" onClick={() => setChatGptImportOpen(true)} title="Paste a complete ChatGPT page and sort its assets automatically">Paste ChatGPT HTML</button>}
      <button className={`preview-toggle ${preview ? 'active' : ''}`} onClick={() => setPreview(current => !current)}>{preview ? 'Edit' : 'Preview'}</button>
    </div>
    {preview ? <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ src, ...props }) => <img {...props} src={previewForPath(src || '')} /> }}>{value}</ReactMarkdown></div> : <textarea
      ref={textarea}
      className={`markdown-textarea ${dragging ? 'is-dragging' : ''}`}
      rows={18}
      value={value}
      onChange={event => onChange(event.target.value)}
      onDragEnter={event => { event.preventDefault(); setDragging(true); }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        const file = event.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) { setDragging(false); return; }
        event.preventDefault(); setDragging(false); void uploadDropped(file);
      }}
    />}
    <ShortcodeDialog entry={dialogEntry} open={Boolean(dialogEntry)} onClose={() => setDialogEntry(null)} onInsert={text => { insertBlock(text); onNotice('Advanced content added.', 'success'); }} />
    <ChatGptHtmlImport open={chatGptImportOpen} pageKey={pageKey} data={data} onClose={() => setChatGptImportOpen(false)} onApply={result => onChange(result.body)} onNotice={onNotice} />
    <MediaPicker open={Boolean(photoMode) && !pickedPhoto} imageType="gallery" preset={config.imageSizes.gallery} onClose={() => setPhotoMode(null)} onPick={setPickedPhoto} onNotice={onNotice} />
    <Dialog open={Boolean(pickedPhoto)} title={photoMode === 'linked' ? 'Describe and link this photo' : 'Describe this photo'} onClose={() => { setPickedPhoto(null); setPhotoMode(null); }} actions={<><button className="button button--quiet" onClick={() => { setPickedPhoto(null); setPhotoMode(null); }}>Cancel</button><button className="button button--primary" disabled={!photoAlt.trim() || (photoMode === 'linked' && !photoLink.trim())} onClick={insertPhoto}>Add to page</button></>}>
      {pickedPhoto && <div className="photo-details"><img src={pickedPhoto.preview} alt="" /><label><span>Description <em>required</em></span><input autoFocus value={photoAlt} onChange={event => setPhotoAlt(event.target.value)} placeholder={config.altPlaceholder} /></label><label><span>Tooltip <small>optional</small></span><input value={photoTitle} onChange={event => setPhotoTitle(event.target.value)} /></label>{photoMode === 'linked' && <label><span>Link destination <em>required</em></span><input value={photoLink} onChange={event => setPhotoLink(event.target.value)} placeholder="/page or https://…" /></label>}</div>}
    </Dialog>
  </div>;
}
