import { useEffect, useRef, useState } from 'react';
import type { ContentData, RichHtmlImportResult, UploadImage } from '../../api/types';
import { api } from '../../api/client';
import { Dialog } from '../../components/Dialog';

const reportLabels: Record<keyof RichHtmlImportResult['report'], string> = {
  images: 'embedded images saved as files',
  styleBlocks: 'style blocks moved to page CSS',
  inlineStyles: 'inline styles preserved on their elements',
  scriptBlocks: 'scripts moved to page JavaScript',
  eventHandlers: 'interactive actions moved to page JavaScript',
  externalResources: 'external resources moved out of page content',
};

export function ChatGptHtmlImport({ open, pageKey, data, onClose, onApply, onNotice }: {
  open: boolean;
  pageKey: string;
  data: ContentData;
  onClose: () => void;
  onApply: (result: RichHtmlImportResult) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [source, setSource] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<RichHtmlImportResult | null>(null);
  const [images, setImages] = useState<UploadImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingImages(true);
    api.pageImages(pageKey, data)
      .then(response => setImages(response.files))
      .catch(error => onNotice(error.message, 'error'))
      .finally(() => setLoadingImages(false));
  }, [open, pageKey]);

  const close = () => { setSource(''); setResult(null); setDragging(false); onClose(); };
  const process = async () => {
    setProcessing(true); setResult(null);
    try {
      const imported = await api.importChatGptHtml(pageKey, source, data);
      setResult(imported); onApply(imported);
      onNotice('ChatGPT HTML sorted into page content and asset files. Review the page, then save the draft.', 'success');
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setProcessing(false); }
  };

  const upload = async (selected: FileList | File[]) => {
    const files = [...selected].filter(file => file.type.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.name));
    if (!files.length) { onNotice('Drop JPG, PNG, WebP or another image file here.', 'error'); return; }
    try {
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is over 25 MB. Please use a smaller image.`);
        setUploading({ name: file.name, progress: 0 });
        const uploaded = await api.uploadPageImage(pageKey, file, data, progress => setUploading({ name: file.name, progress }));
        setImages(current => [uploaded, ...current.filter(image => image.path !== uploaded.path)]);
      }
      onNotice(`${files.length} page image${files.length === 1 ? '' : 's'} processed as WebP. Copy the paths for ChatGPT.`, 'success');
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setUploading(null); if (imageInput.current) imageInput.current.value = ''; }
  };

  const copy = async (text: string, message: string) => {
    try { await navigator.clipboard.writeText(text); onNotice(message, 'success'); }
    catch (_) { onNotice('Could not copy automatically. Select the path and copy it manually.', 'error'); }
  };
  const copyAll = () => copy(
    `Use these exact processed image URLs in the HTML you create:\n${images.map(image => `- ${image.name}: ${image.path}`).join('\n')}`,
    'Image paths copied for ChatGPT.',
  );

  const sorted = result ? (Object.entries(result.report) as Array<[keyof RichHtmlImportResult['report'], number]>).filter(([, count]) => count > 0) : [];
  return <Dialog open={open} title="Paste ChatGPT HTML" onClose={close} actions={result
    ? <button className="button button--primary" onClick={close}>Review page content</button>
    : <><button className="button button--quiet" onClick={close}>Cancel</button><button className="button button--primary" disabled={!source.trim() || processing || Boolean(uploading)} onClick={process}>{processing ? 'Sorting content...' : 'Sort into page'}</button></>}>
    <div className="chatgpt-import">
      <section className="chatgpt-images" aria-labelledby="chatgpt-images-title">
        <div className="chatgpt-images__heading">
          <div><strong id="chatgpt-images-title">Page images</strong><p>Upload first, then give ChatGPT the exact processed paths shown below.</p></div>
          {images.length > 0 && <button className="button button--secondary" type="button" onClick={copyAll}>Copy all paths for ChatGPT</button>}
        </div>
        <input ref={imageInput} hidden multiple type="file" accept="image/*" onChange={event => event.target.files && upload(event.target.files)} />
        <button
          className={`chatgpt-images__drop ${dragging ? 'is-dragging' : ''}`}
          type="button"
          disabled={Boolean(uploading)}
          onClick={() => imageInput.current?.click()}
          onDragEnter={event => { event.preventDefault(); setDragging(true); }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files); }}
        >
          <strong>{uploading ? `Processing ${uploading.name} — ${uploading.progress}%` : 'Drop images here or choose files'}</strong>
          <span>JPG, PNG and WebP are processed into web-ready WebP images.</span>
        </button>
        {loadingImages ? <div className="loading-line">Loading page images…</div> : images.length > 0 ? <div className="chatgpt-images__list">{images.map(image => <article key={image.path}>
          <img src={image.preview} alt="" />
          <div><strong>{image.name}</strong><code>{image.path}</code></div>
          <button className="button button--quiet" type="button" onClick={() => copy(image.path, 'Image path copied.')}>Copy path</button>
        </article>)}</div> : <p className="chatgpt-images__empty">No page images uploaded yet.</p>}
      </section>
      {!result ? <>
        <p className="dialog-copy">Paste everything ChatGPT produced. Full HTML, CSS, JavaScript, inline styling and embedded images are all accepted here.</p>
        <textarea autoFocus aria-label="ChatGPT HTML" value={source} onChange={event => setSource(event.target.value)} placeholder="Paste the complete ChatGPT response here..." />
        <p className="chatgpt-import__note">The admin will put the visible HTML into Page Content, preserve inline styling, convert base64 images into real image files, and move styling and interactivity into separate page assets.</p>
      </> : <div className="chatgpt-import__result">
        <strong>Content sorted successfully</strong>
        <p>The cleaned content is now in the editor. Nothing is published until you review it, save the draft and click Publish.</p>
        {sorted.length ? <ul>{sorted.map(([key, count]) => <li key={key}><b>{count}</b> {reportLabels[key]}</li>)}</ul> : <p>No separate assets were needed; the pasted content was already clean.</p>}
        {(result.title || result.description) && <p className="chatgpt-import__metadata">Document-level title and description metadata were removed so the page's existing CMS fields remain authoritative.</p>}
      </div>}
    </div>
  </Dialog>;
}
