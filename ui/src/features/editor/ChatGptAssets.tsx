import { useState } from 'react';
import type { ContentData, RichHtmlImportResult } from '../../api/types';
import { api } from '../../api/client';
import { Dialog } from '../../components/Dialog';

const reportLabels: Record<keyof RichHtmlImportResult['report'], string> = {
  images: 'embedded images saved as files',
  styleBlocks: 'style blocks moved to page CSS',
  inlineStyles: 'inline styles moved to page CSS',
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

  const close = () => { setSource(''); setResult(null); onClose(); };
  const process = async () => {
    setProcessing(true); setResult(null);
    try {
      const imported = await api.importChatGptHtml(pageKey, source, data);
      setResult(imported); onApply(imported);
      onNotice('ChatGPT HTML sorted into page content and asset files. Review the page, then save the draft.', 'success');
    } catch (error) { onNotice((error as Error).message, 'error'); }
    finally { setProcessing(false); }
  };

  const sorted = result ? (Object.entries(result.report) as Array<[keyof RichHtmlImportResult['report'], number]>).filter(([, count]) => count > 0) : [];
  return <Dialog open={open} title="Paste ChatGPT HTML" onClose={close} actions={result
    ? <button className="button button--primary" onClick={close}>Review page content</button>
    : <><button className="button button--quiet" onClick={close}>Cancel</button><button className="button button--primary" disabled={!source.trim() || processing} onClick={process}>{processing ? 'Sorting content...' : 'Sort into page'}</button></>}>
    <div className="chatgpt-import">
      {!result ? <>
        <p className="dialog-copy">Paste everything ChatGPT produced. Full HTML, CSS, JavaScript, inline styling and embedded images are all accepted here.</p>
        <textarea autoFocus aria-label="ChatGPT HTML" value={source} onChange={event => setSource(event.target.value)} placeholder="Paste the complete ChatGPT response here..." />
        <p className="chatgpt-import__note">The admin will put the visible HTML into Page Content, convert base64 images into real image files, and move styling and interactivity into separate page assets.</p>
      </> : <div className="chatgpt-import__result">
        <strong>Content sorted successfully</strong>
        <p>The cleaned content is now in the editor. Nothing is published until you review it, save the draft and click Publish.</p>
        {sorted.length ? <ul>{sorted.map(([key, count]) => <li key={key}><b>{count}</b> {reportLabels[key]}</li>)}</ul> : <p>No separate assets were needed; the pasted content was already clean.</p>}
        {(result.title || result.description) && <p className="chatgpt-import__metadata">Document-level title and description metadata were removed so the page's existing CMS fields remain authoritative.</p>}
      </div>}
    </div>
  </Dialog>;
}
