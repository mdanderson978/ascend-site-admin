import { useState } from 'react';
import { api } from '../../api/client';
import type { RenamePreview } from '../../api/types';
import { Dialog } from '../../components/Dialog';

interface RenameDialogProps {
  open: boolean;
  entryKey: string;
  currentSlug: string;
  currentUrl: string;
  onClose: () => void;
  onRenamed: (newSlug: string) => void;
}

// Mirrors the server's sanitize() in index.mjs exactly, for display only —
// the server remains the single source of truth for the real slug; this is
// just so the editor sees what their URL will look like as they type,
// instead of finding out only after committing (today's total silence).
function previewSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function RenameDialog({ open, entryKey, currentSlug, currentUrl, onClose, onRenamed }: RenameDialogProps) {
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [input, setInput] = useState(currentSlug);
  const [preview, setPreview] = useState<RenamePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setStep('edit'); setInput(currentSlug); setPreview(null); setError(''); };
  const close = () => { reset(); onClose(); };

  const runPreview = async () => {
    const slug = previewSlug(input);
    if (!slug) { setError('Enter a valid URL slug.'); return; }
    if (slug === currentSlug) { setError("That is already this page's URL."); return; }
    setBusy(true); setError('');
    try {
      const response = await api.renamePreview(entryKey, slug);
      if (!response.ok) { setError(response.error || 'Could not preview this rename.'); return; }
      setPreview(response);
      setStep('confirm');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview?.newSlug) return;
    setBusy(true); setError('');
    try {
      const result = await api.rename(entryKey, preview.newSlug);
      if (!result.ok || !result.slug) { setError(result.error || 'Could not rename this page.'); return; }
      reset();
      onRenamed(result.slug);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const slugPreview = previewSlug(input);
  const linkCount = preview?.linksToFix?.reduce((sum, hit) => sum + hit.count, 0) || 0;
  const cascadeCount = preview?.cascade?.reduce((sum, hit) => sum + hit.count, 0) || 0;
  const surfaces = preview?.externalLinkSurfaces || [];

  return (
    <Dialog
      open={open}
      title={step === 'edit' ? 'Change this page\'s URL' : 'Confirm URL change'}
      onClose={close}
      actions={step === 'edit'
        ? <><button className="button button--quiet" onClick={close}>Cancel</button><button className="button button--primary" disabled={busy} onClick={runPreview}>{busy ? 'Checking…' : 'Continue'}</button></>
        : <><button className="button button--quiet" onClick={() => setStep('edit')}>Back</button><button className="button button--primary" disabled={busy || Boolean(preview?.collision)} onClick={commit}>{busy ? 'Renaming…' : 'Confirm rename'}</button></>}
    >
      {step === 'edit' ? (
        <div className="dialog-form">
          <p className="rename-dialog__diff">Current URL: <code>{currentUrl}</code></p>
          <p className="rename-dialog__reassurance">
            <strong>It's safe to rename this page.</strong> A permanent redirect from
            the old address to the new one is created automatically the moment you
            confirm below — Google transfers this page's existing search rankings
            across, and anyone using an old link or bookmark still reaches the page.
          </p>
          <label>
            <span>New URL</span>
            <input type="text" value={input} onChange={event => setInput(event.target.value)} autoFocus />
          </label>
          {slugPreview && <p className="rename-dialog__preview">Will become: <code>{slugPreview}</code></p>}
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      ) : preview ? (
        <div className="dialog-form">
          <p className="rename-dialog__diff"><code>{preview.oldPath}</code> → <code>{preview.newPath}</code></p>
          {preview.collision ? (
            <p className="field-error" role="alert">
              {preview.collision === 'filename'
                ? 'A page already exists at that URL. Choose a different one.'
                : 'That URL is already used as a redirect elsewhere. Choose a different one.'}
            </p>
          ) : (
            <>
              <p className="rename-dialog__reassurance"><strong>Search rankings are protected.</strong> A permanent redirect from the old URL to the new one will be created automatically, so this page keeps its rankings and old links keep working.</p>
              {linkCount > 0 && <p>{linkCount} link{linkCount === 1 ? '' : 's'} on {preview.linksToFix?.length} other page{preview.linksToFix?.length === 1 ? '' : 's'} will be updated automatically.</p>}
              {cascadeCount > 0 && <p>{cascadeCount} page{cascadeCount === 1 ? '' : 's'} inside this section will move with it.</p>}
              {surfaces.length > 0 && (
                <div className="rename-dialog__manual">
                  <p>You'll need to check these yourself, the admin can't update them automatically:</p>
                  <ul>{surfaces.map(surface => <li key={surface}>{surface}</li>)}</ul>
                </div>
              )}
            </>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      ) : null}
    </Dialog>
  );
}
