import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentValue, DocumentValue, FieldConfig, ImagePreset, ImageValue, UploadImage } from '../../api/types';
import { api } from '../../api/client';
import { imageValue, previewForPath } from '../../lib/content';
import { Dialog } from '../../components/Dialog';
import { GripIcon, TrashIcon } from '../../components/Icons';

interface SharedProps {
  field: FieldConfig;
  value: ContentValue | undefined;
  onChange: (value: ContentValue) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

// Shared by MediaPicker's "Upload new photo" button and ImageField's drop
// zone so both paths get identical size-limit / minimum-dimension checks
// and identical error copy instead of drifting apart.
function useImageUpload(imageType: string, preset: ImagePreset | undefined, onNotice: SharedProps['onNotice'], onUploaded: (file: UploadImage) => void) {
  const [progress, setProgress] = useState<number | null>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('That image is over 25 MB. Please use a smaller photo.');
      if (preset?.w || preset?.h) {
        const dimensions = await imageDimensions(file);
        if ((preset.w && dimensions.width < preset.w) || (preset.h && dimensions.height < preset.h)) throw new Error(`That photo is too small. Please choose one ${preset.label || `at least ${preset.w || 0} × ${preset.h || 0} px`}.`);
      }
      setProgress(0);
      const uploaded = await api.uploadImage(file, imageType, setProgress);
      onUploaded(uploaded); onNotice('Photo uploaded and ready to save.', 'success');
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setProgress(null); }
  };
  return { upload, progress };
}

export function MediaPicker({ open, imageType, preset, onClose, onPick, onNotice }: { open: boolean; imageType: string; preset?: ImagePreset; onClose: () => void; onPick: (file: UploadImage) => void; onNotice: SharedProps['onNotice'] }) {
  const [files, setFiles] = useState<UploadImage[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.uploads().then(result => setFiles(result.files)).catch(error => onNotice(error.message, 'error')).finally(() => setLoading(false));
  }, [open, onNotice]);
  const { upload, progress } = useImageUpload(imageType, preset, onNotice, file => { onPick(file); onClose(); });
  return <Dialog open={open} title="Choose a photo" onClose={onClose} actions={<><input ref={input} hidden type="file" accept="image/*" onChange={event => upload(event.target.files?.[0])} /><button className="button button--primary" onClick={() => input.current?.click()}>{progress === null ? 'Upload new photo' : `Uploading ${progress}%`}</button><button className="button button--quiet" onClick={onClose}>Cancel</button></>}>
    <p className="dialog-copy">Reuse a recent photo, or upload a JPG, PNG or WebP image.</p>
    <div className="media-library">{loading ? <div className="loading-line">Loading photos…</div> : files.length ? files.map(file => <button key={file.path} onClick={() => { onPick(file); onClose(); }}><img src={file.preview} alt="" /><span>{file.name}</span></button>) : <div className="empty-small">No uploaded photos yet.</div>}</div>
  </Dialog>;
}

export function ImageField({ field, value, onChange, onNotice, preview, preset }: SharedProps & { preview?: string; preset?: ImagePreset }) {
  const [picker, setPicker] = useState(false);
  const [dragging, setDragging] = useState(false);
  const image = imageValue(value);
  // Prefer a preview derived from the field's CURRENT value over the
  // `preview` prop, which is a snapshot computed server-side once when the
  // entry loaded and never refreshed for the rest of the editing session.
  // Falling back to `preview` first meant that after picking or dropping a
  // new photo, the old photo kept displaying (and previewForPath() can
  // resolve any src this field ever holds, so the fallback is effectively
  // only for a not-yet-normalised value). Matches the order ImagesField
  // already uses below for the same reason.
  const src = previewForPath(image.src) || preview;
  const imageType = field.size || field.imageType || 'hero';
  const { upload, progress } = useImageUpload(imageType, preset, onNotice, file => onChange({ src: file.path, alt: image.alt || '' }));
  return <div
    className={`image-field ${dragging ? 'is-dragging' : ''}`}
    onDragEnter={event => { event.preventDefault(); setDragging(true); }}
    onDragOver={event => event.preventDefault()}
    onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files[0]); }}
  >
    {image.src ? <div className="image-preview"><img src={src} alt={image.alt || ''} /><div className="image-preview__actions"><button className="button button--quiet" onClick={() => setPicker(true)}>Replace photo</button><button className="icon-button danger" onClick={() => onChange(null)} aria-label={`Remove ${field.label}`}><TrashIcon /></button></div></div> : <button className="media-empty" onClick={() => setPicker(true)}><span className="media-empty__icon">＋</span><strong>{progress !== null ? `Uploading ${progress}%` : 'Add a photo'}</strong><span>Drop an image here, or click to upload or choose an existing one</span></button>}
    {image.src && <label className="subfield"><span>Image description {field.required && <em>required</em>}</span><input value={image.alt || ''} placeholder="Describe what is visible in the photo" onChange={event => onChange({ ...image, alt: event.target.value })} /></label>}
    <MediaPicker open={picker} imageType={imageType} preset={preset} onClose={() => setPicker(false)} onPick={picked => onChange({ src: picked.path, alt: image.alt || '' })} onNotice={onNotice} />
  </div>;
}

export function ImagesField({ field, value, onChange, onNotice, previews = [], preset }: SharedProps & { previews?: Array<string | null>; preset?: ImagePreset }) {
  const [picker, setPicker] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const images = useMemo(() => Array.isArray(value) ? value.map(item => imageValue(item as ContentValue)) : [], [value]);
  const update = (index: number, patch: Partial<ImageValue>) => onChange(images.map((item, i) => i === index ? { ...item, ...patch } : item));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next);
  };
  return <div className="gallery-field">
    <div className="gallery-list">{images.map((image, index) => <article key={`${image.src}-${index}`} className="gallery-card" draggable onDragStart={() => setDragged(index)} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragged !== null) move(dragged, index); setDragged(null); }}>
      <div className="drag-handle" title="Drag to reorder"><GripIcon /><span className="sr-only">Drag photo {index + 1}</span></div>
      <img src={previewForPath(image.src) || previews[index] || ''} alt="" />
      <label><span>Photo {index + 1} description</span><input value={image.alt || ''} onChange={event => update(index, { alt: event.target.value })} placeholder="Describe this photo" /></label>
      <div className="reorder-actions"><button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move photo ${index + 1} up`}>↑</button><button onClick={() => move(index, index + 1)} disabled={index === images.length - 1} aria-label={`Move photo ${index + 1} down`}>↓</button><button className="danger" onClick={() => onChange(images.filter((_, i) => i !== index))} aria-label={`Remove photo ${index + 1}`}><TrashIcon /></button></div>
    </article>)}</div>
    <button className="button button--secondary add-row" onClick={() => setPicker(true)}>＋ Add photo</button>
    <MediaPicker open={picker} imageType={field.size || field.imageType || 'gallery'} preset={preset} onClose={() => setPicker(false)} onPick={picked => onChange([...images, { src: picked.path, alt: '' }])} onNotice={onNotice} />
  </div>;
}

export function ListField({ value, onChange }: Pick<SharedProps, 'value' | 'onChange'>) {
  const items = Array.isArray(value) ? value.map(String) : [];
  const move = (from: number, to: number) => { if (to < 0 || to >= items.length) return; const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next); };
  return <div className="list-field">{items.map((item, index) => <div className="list-row" key={index}><GripIcon /><input aria-label={`List item ${index + 1}`} value={item} onChange={event => onChange(items.map((current, i) => i === index ? event.target.value : current))} /><button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move item ${index + 1} up`}>↑</button><button onClick={() => move(index, index + 1)} disabled={index === items.length - 1} aria-label={`Move item ${index + 1} down`}>↓</button><button className="danger" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove item ${index + 1}`}><TrashIcon /></button></div>)}<button className="button button--secondary add-row" onClick={() => onChange([...items, ''])}>＋ Add item</button></div>;
}

function PdfUploader({ onUploaded, onNotice, label }: { onUploaded: (path: string) => void; onNotice: SharedProps['onNotice']; label: string }) {
  const ref = useRef<HTMLInputElement>(null); const [progress, setProgress] = useState<number | null>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) { onNotice('Please choose a PDF document.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { onNotice('That PDF is over 10 MB. Please use a smaller document.', 'error'); return; }
    try { setProgress(0); const result = await api.uploadPdf(file, setProgress); onUploaded(result.path); onNotice('PDF uploaded and ready to save.', 'success'); }
    catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setProgress(null); }
  };
  return <><input ref={ref} hidden type="file" accept="application/pdf,.pdf" onChange={event => upload(event.target.files?.[0])} /><button className="button button--secondary" onClick={() => ref.current?.click()} disabled={progress !== null}>{progress === null ? label : `Uploading ${progress}%`}</button></>;
}

export function PdfField({ value, onChange, onNotice }: SharedProps) {
  const url = typeof value === 'string' ? value : '';
  return <div className="document-field">{url && <div className="document-chip"><span>PDF</span><a href={url} target="_blank" rel="noreferrer">{url.split('/').pop()}</a><button className="icon-button danger" onClick={() => onChange('')} aria-label="Remove document"><TrashIcon /></button></div>}<PdfUploader label={url ? 'Replace PDF' : 'Upload PDF'} onUploaded={path => onChange(path)} onNotice={onNotice} /></div>;
}

export function PdfsField({ value, onChange, onNotice }: SharedProps) {
  const docs: DocumentValue[] = Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && 'url' in item) as DocumentValue[] : [];
  const move = (from: number, to: number) => { if (to < 0 || to >= docs.length) return; const next = [...docs]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next); };
  return <div className="documents-field">{docs.map((doc, index) => <div className="document-row" key={`${doc.url}-${index}`}><GripIcon /><label><span>Document name</span><input value={doc.label || ''} onChange={event => onChange(docs.map((current, i) => i === index ? { ...current, label: event.target.value } : current))} /></label><a href={doc.url} target="_blank" rel="noreferrer">View PDF</a><button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move document ${index + 1} up`}>↑</button><button onClick={() => move(index, index + 1)} disabled={index === docs.length - 1} aria-label={`Move document ${index + 1} down`}>↓</button><button className="danger" onClick={() => onChange(docs.filter((_, i) => i !== index))} aria-label={`Remove document ${index + 1}`}><TrashIcon /></button></div>)}<PdfUploader label="＋ Add PDF" onUploaded={path => onChange([...docs, { label: '', url: path }])} onNotice={onNotice} /></div>;
}
