import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client';
import type { AdminConfig, ContentTree, EntryResponse, HistoryVersion, SearchIndex } from './api/types';
import { ConfirmDialog } from './components/Dialog';
import { ExternalIcon, HistoryIcon, MenuIcon, PublishIcon, SaveIcon, TrashIcon } from './components/Icons';
import { PublishBanner, type PublishFailure } from './components/PublishBanner';
import { Sidebar } from './components/Sidebar';
import { ToastRegion, type ToastMessage } from './components/Toasts';
import { EntryForm, validateEntry } from './features/editor/EntryForm';
import { HistoryPanel } from './features/history/HistoryPanel';
import { breadcrumb, humanize, startNoteParts } from './lib/content';

type ConfirmState = { kind: 'navigate'; key: string; field?: string } | { kind: 'delete' } | { kind: 'restore'; version: HistoryVersion } | null;

export default function App() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [tree, setTree] = useState<ContentTree>({});
  const [searchIndex, setSearchIndex] = useState<SearchIndex>({});
  const [entry, setEntry] = useState<EntryResponse | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entryLoading, setEntryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [versions, setVersions] = useState<HistoryVersion[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [publishFailure, setPublishFailure] = useState<PublishFailure | null>(null);

  const notify = useCallback((message: string, kind: ToastMessage['kind'] = 'info') => {
    setToasts(current => [...current, { id: Date.now() + Math.random(), message, kind }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);

  const refreshNavigation = useCallback(async () => {
    const [nextTree, nextSearch] = await Promise.all([api.contentTree(), api.search()]);
    setTree(nextTree); setSearchIndex(nextSearch);
  }, []);

  useEffect(() => {
    Promise.all([api.config(), api.contentTree(), api.search()]).then(([nextConfig, nextTree, nextSearch]) => {
      setConfig(nextConfig); setTree(nextTree); setSearchIndex(nextSearch); document.title = nextConfig.browserTitle;
    }).catch(error => notify(`Could not start the admin: ${error.message}`, 'error')).finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);

  const loadEntry = useCallback(async (key: string, field?: string) => {
    setEntryLoading(true); setHistoryOpen(false); setErrors({});
    try {
      const loaded = await api.entry(key);
      setCurrentKey(key); setEntry(loaded); setDirty(false); setDraftSaved(false);
      if (field) window.setTimeout(() => document.querySelector(`[data-field="${CSS.escape(field)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    } catch (error) { notify((error as Error).message, 'error'); }
    finally { setEntryLoading(false); }
  }, [notify]);

  const openEntry = (key: string, field?: string) => dirty ? setConfirm({ kind: 'navigate', key, field }) : loadEntry(key, field);
  const mutateEntry = (next: EntryResponse) => { setEntry(next); setDirty(true); setDraftSaved(false); setErrors({}); };

  const save = useCallback(async () => {
    if (!entry || !currentKey || saving) return;
    const nextErrors = validateEntry(entry.fields, entry.data);
    for (const field of entry.fields) if (field.type === 'markdown' && field.required && !entry.body.trim()) nextErrors[field.name] = `${field.label} cannot be empty.`;
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); notify('Please fix the highlighted fields before saving.', 'error'); document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setSaving(true);
    try {
      const response = await api.save(currentKey, entry.data, entry.body);
      let savedKey = currentKey;
      if (currentKey.endsWith('/new') && response.slug) {
        savedKey = `${currentKey.split('/')[0]}/${response.slug}`; setCurrentKey(savedKey);
      }
      setDirty(false); setDraftSaved(true); setErrors({}); await refreshNavigation(); notify('Draft saved.', 'success');
      if (savedKey !== currentKey) setEntry(await api.entry(savedKey));
    } catch (error) { notify((error as Error).message, 'error'); }
    finally { setSaving(false); }
  }, [entry, currentKey, saving, notify, refreshNavigation]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); } };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [save]);

  const removeEntry = async () => {
    if (!currentKey) return;
    try {
      await api.remove(currentKey); setEntry(null); setCurrentKey(null); setDirty(false); setDraftSaved(true); await refreshNavigation(); notify('Entry deleted. Publish when you are ready to make it live.', 'success');
    } catch (error) { notify((error as Error).message, 'error'); }
    finally { setConfirm(null); }
  };

  const publish = async () => {
    if (dirty) { notify('Save your draft before publishing.', 'error'); return; }
    setPublishing(true); setPublishFailure(null);
    try {
      const response = await api.publish();
      if (!response.ok) { setPublishFailure({ summary: 'Something went wrong publishing your changes.', output: response.output }); return; }
      setDraftSaved(false); notify('Published successfully. The live site is rebuilding now.', 'success');
    } catch (error) { setPublishFailure({ summary: (error as Error).message }); }
    finally { setPublishing(false); }
  };

  // Mirrors save()'s /new -> real-slug promotion: a rename is a filesystem
  // mutation, like delete/restore/reorder, that lands as a draft — Publish
  // stays a separate, explicit step.
  const onRenamed = async (newSlug: string) => {
    if (!currentKey) return;
    const nextKey = `${currentKey.split('/')[0]}/${newSlug}`;
    setDraftSaved(true); setCurrentKey(nextKey);
    await refreshNavigation();
    setEntry(await api.entry(nextKey));
    notify('Renamed. Publish when you are ready to make it live.', 'success');
  };

  const reorderEntries = async (collection: string, slugs: string[]) => {
    try { await api.order(collection, slugs); setDraftSaved(true); await refreshNavigation(); notify('Entry order saved as a draft.', 'success'); }
    catch (error) { notify((error as Error).message, 'error'); }
  };

  const openHistory = async () => {
    if (!currentKey || currentKey.endsWith('/new')) return;
    setHistoryOpen(true); setHistoryLoading(true);
    try { setVersions((await api.history(currentKey)).versions); }
    catch (error) { notify((error as Error).message, 'error'); }
    finally { setHistoryLoading(false); }
  };

  const restore = async (version: HistoryVersion) => {
    if (!currentKey) return;
    try { await api.restore(currentKey, version.sha); setEntry(await api.entry(currentKey)); setDirty(false); setDraftSaved(true); setHistoryOpen(false); await refreshNavigation(); notify('Previous version restored as a draft. Review it, then publish.', 'success'); }
    catch (error) { notify((error as Error).message, 'error'); }
    finally { setConfirm(null); }
  };

  const confirmDetails = useMemo(() => {
    if (!confirm) return null;
    if (confirm.kind === 'navigate') return { title: 'Discard unsaved changes?', description: 'Your changes on this page have not been saved. Moving away will discard them.', label: 'Discard changes', danger: true };
    if (confirm.kind === 'delete') return { title: 'Delete this entry?', description: 'It will be removed from the working copy. The live site will not change until you publish.', label: 'Delete entry', danger: true };
    return { title: 'Restore this version?', description: 'The current page will be replaced with this earlier version. It will remain a draft until you publish.', label: 'Restore version', danger: false };
  }, [confirm]);
  const acceptConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'navigate') { const next = confirm; setConfirm(null); void loadEntry(next.key, next.field); }
    else if (confirm.kind === 'delete') void removeEntry();
    else void restore(confirm.version);
  };

  if (loading) return <div className="boot-state"><div className="brand__mark">A</div><span>Opening site admin…</span></div>;
  if (!config) return <div className="boot-state boot-state--error"><h1>Could not open Site Admin</h1><p>Check that the content server is running, then refresh this page.</p></div>;

  const isNew = currentKey?.endsWith('/new') || false;
  const [collection, slug] = currentKey?.split('/') || [];
  const title = isNew ? `New ${config.dynamicCollections[collection]?.label || 'entry'}` : currentKey ? config.pageLabels[currentKey] || humanize(slug) : 'Content overview';
  const trail = currentKey ? breadcrumb(currentKey, config.navStructure, config.pageLabels) : '';
  const canDelete = Boolean(currentKey && config.dynamicCollections[collection] && !isNew);
  const canRename = Boolean(currentKey && !isNew && (config.dynamicCollections[collection] || config.renamable.includes(currentKey)));
  const livePattern = currentKey ? config.urlPatterns[collection] : null;
  const liveUrl = currentKey && config.siteUrl && livePattern && !isNew ? `${config.siteUrl.replace(/\/$/, '')}/${slug === 'home' ? '' : livePattern.replace('{slug}', encodeURIComponent(slug))}` : '';
  const status = dirty ? 'Unsaved changes' : draftSaved ? 'Draft saved' : currentKey ? 'Published' : '';

  return <div className="app-shell">
    <Sidebar config={config} tree={tree} searchIndex={searchIndex} activeKey={currentKey} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onOpenEntry={openEntry} onReorder={reorderEntries} />
    <main className="workspace">
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><MenuIcon /></button>
        <div className="page-heading">{trail && <span>{trail}</span>}<h1>{title}</h1>{status && <small className={`entry-status ${dirty ? 'dirty' : draftSaved ? 'draft' : ''}`}><i />{status}</small>}</div>
        <div className="topbar__actions">
          {liveUrl && <a className="button button--quiet view-live" href={liveUrl} target="_blank" rel="noreferrer"><ExternalIcon /> View site</a>}
          <button className="button button--quiet history-button" onClick={openHistory} disabled={!currentKey || isNew}><HistoryIcon /> History</button>
          {canDelete && <button className="icon-button danger" onClick={() => setConfirm({ kind: 'delete' })} aria-label="Delete entry"><TrashIcon /></button>}
          <button className="button button--secondary" disabled={!entry || saving || !dirty} onClick={save}><SaveIcon /> {saving ? 'Saving…' : 'Save draft'}</button>
          <button className="button button--primary" disabled={publishing || dirty} onClick={publish}><PublishIcon /> {publishing ? 'Publishing…' : 'Publish'}</button>
        </div>
      </header>
      <div className="mobile-actions"><button className="button button--secondary" disabled={!entry || saving || !dirty} onClick={save}><SaveIcon /> Save draft</button><button className="button button--primary" disabled={publishing || dirty} onClick={publish}><PublishIcon /> Publish</button></div>
      <div className="content-scroll">
        {entryLoading ? <div className="loading-page"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : entry ? <EntryForm entry={entry} config={config} errors={errors} canRename={canRename} liveUrl={liveUrl} onRenamed={onRenamed} onDataChange={data => mutateEntry({ ...entry, data })} onBodyChange={body => mutateEntry({ ...entry, body })} onNotice={notify} /> : <section className="welcome-card"><span className="eyebrow">Ascend Site Admin 2.0</span><h2>What would you like to update?</h2><p>{config.startScreenIntro}</p>{config.tasks.length > 0 && <div className="task-grid">{config.tasks.map(task => <button key={`${task.goto}-${task.field || ''}`} onClick={() => openEntry(task.goto, task.field)}><span>{task.label}</span><strong>Open →</strong></button>)}</div>}<div className="welcome-note">{startNoteParts(config.startScreenNote).map((part, index) => part.break ? <br key={index} /> : part.strong ? <strong key={index}>{part.text}</strong> : <Fragment key={index}>{part.text}</Fragment>)}</div></section>}
      </div>
    </main>
    <HistoryPanel open={historyOpen} versions={versions} loading={historyLoading} onClose={() => setHistoryOpen(false)} onRestore={version => setConfirm({ kind: 'restore', version })} />
    {confirmDetails && <ConfirmDialog open title={confirmDetails.title} description={confirmDetails.description} confirmLabel={confirmDetails.label} danger={confirmDetails.danger} onCancel={() => setConfirm(null)} onConfirm={acceptConfirm} />}
    {publishFailure && <PublishBanner failure={publishFailure} onDismiss={() => setPublishFailure(null)} />}
    <ToastRegion toasts={toasts} dismiss={dismissToast} />
  </div>;
}
