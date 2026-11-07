import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdminConfig,
  ContentValue,
  ElementDefinition,
  ElementFieldConfig,
  ElementLibrary,
  LayoutNode,
  LayoutProp,
  LayoutRoot,
  LinkValue,
} from '../../api/types';
import { MediaPicker } from './MediaFields';
import { previewForPath } from '../../lib/content';
import type { SlashItem } from './RichTextEditor';

const RichTextEditor = lazy(() => import('./RichTextEditor').then(module => ({ default: module.RichTextEditor })));

const EMPTY_LIBRARY: ElementLibrary = {
  schema: 1,
  elements: [],
  children: { layout: [] },
  choices: { tokens: {}, alignments: ['start', 'center'], headingLevels: ['h2', 'h3', 'h4'] },
};

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 6)
    : `n${Date.now().toString(36).slice(-5)}`;
}

function findNode(nodes: LayoutNode[], id: string): LayoutNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findNode(node.children || [], id);
    if (nested) return nested;
  }
}

function mapNode(nodes: LayoutNode[], id: string, change: (node: LayoutNode) => LayoutNode): LayoutNode[] {
  return nodes.map(node => {
    if (node.id === id) return change(node);
    if (!node.children?.length) return node;
    return { ...node, children: mapNode(node.children, id, change) };
  });
}

function removeNode(nodes: LayoutNode[], id: string): LayoutNode[] {
  return nodes
    .filter(node => node.id !== id)
    .map(node => node.children?.length ? { ...node, children: removeNode(node.children, id) } : node);
}

function moveNode(nodes: LayoutNode[], id: string, direction: -1 | 1): LayoutNode[] {
  const index = nodes.findIndex(node => node.id === id);
  if (index >= 0) {
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return nodes;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return nodes.map(node => node.children?.length ? { ...node, children: moveNode(node.children, id, direction) } : node);
}

function parentOf(nodes: LayoutNode[], id: string, parentType = 'layout', parentId: string | null = null): { type: string; id: string | null } | undefined {
  for (const node of nodes) {
    if (node.id === id) return { type: parentType, id: parentId };
    const nested = parentOf(node.children || [], id, node.type, node.id);
    if (nested) return nested;
  }
}

function insertAfterNode(nodes: LayoutNode[], id: string, inserted: LayoutNode): { nodes: LayoutNode[]; found: boolean } {
  const index = nodes.findIndex(node => node.id === id);
  if (index >= 0) {
    const next = [...nodes];
    next.splice(index + 1, 0, inserted);
    return { nodes: next, found: true };
  }
  let found = false;
  const next = nodes.map(node => {
    if (found || !node.children?.length) return node;
    const result = insertAfterNode(node.children, id, inserted);
    if (!result.found) return node;
    found = true;
    return { ...node, children: result.nodes };
  });
  return { nodes: next, found };
}

function nodeSummary(node: LayoutNode, def?: ElementDefinition): string {
  const props = node.props || {};
  const label = props.label || props.text || props.kicker || props.caption;
  if (typeof label === 'string' && label.trim()) return label.trim().slice(0, 55);
  if (typeof props.html === 'string') {
    const plain = props.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain) return plain.slice(0, 55);
  }
  return def?.title || node.type;
}

function Outline({ nodes, definitions, selected, onSelect, onMove, onRemove }: {
  nodes: LayoutNode[];
  definitions: Map<string, ElementDefinition>;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return <ol className="layout-outline">
    {nodes.map((node, index) => {
      const def = definitions.get(node.type);
      return <li key={node.id}>
        <div className={`layout-outline__row ${selected === node.id ? 'is-selected' : ''}`}>
          <button type="button" className="layout-outline__select" onClick={() => onSelect(node.id)}>
            <span aria-hidden="true">{def?.icon || '□'}</span>
            <span><strong>{def?.title || node.type}</strong><small>{nodeSummary(node, def)}</small></span>
          </button>
          <span className="layout-outline__actions">
            <button type="button" disabled={index === 0} onClick={() => onMove(node.id, -1)} aria-label={`Move ${def?.title || node.type} up`}>↑</button>
            <button type="button" disabled={index === nodes.length - 1} onClick={() => onMove(node.id, 1)} aria-label={`Move ${def?.title || node.type} down`}>↓</button>
            <button type="button" className="danger" onClick={() => onRemove(node.id)} aria-label={`Remove ${def?.title || node.type}`}>×</button>
          </span>
        </div>
        {node.children?.length ? <Outline nodes={node.children} definitions={definitions} selected={selected} onSelect={onSelect} onMove={onMove} onRemove={onRemove} /> : null}
      </li>;
    })}
  </ol>;
}

function LinkControl({ value, onChange }: { value: LayoutProp; onChange: (value: LayoutProp) => void }) {
  const link = value && typeof value === 'object' ? value as LinkValue : {};
  const kind = Object.keys(link)[0] as keyof LinkValue | undefined;
  const setKind = (next: string) => onChange(next ? { [next]: '' } : null);
  return <div className="layout-link-field">
    <select aria-label="Link type" value={kind || ''} onChange={event => setKind(event.target.value)}>
      <option value="">No link</option>
      <option value="url">Web address</option>
      <option value="page">Page</option>
      <option value="anchor">Section on this page</option>
      <option value="tel">Phone number</option>
      <option value="email">Email address</option>
      <option value="document">Document</option>
    </select>
    {kind && <input aria-label="Link value" value={link[kind] || ''} onChange={event => onChange({ [kind]: event.target.value })} />}
  </div>;
}

function ElementControl({ name, field, value, config, slashItems, onInsertBlock, onChange, onNotice }: {
  name: string;
  field: ElementFieldConfig;
  value: LayoutProp;
  config: AdminConfig;
  slashItems?: SlashItem[];
  onInsertBlock?: (type: string) => void;
  onChange: (value: LayoutProp) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [picker, setPicker] = useState(false);
  let control;
  if (field.type === 'boolean') {
    control = <label className="toggle"><input aria-label={field.label} type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{value ? 'On' : 'Off'}</strong></label>;
  } else if (field.type === 'text') {
    control = <textarea aria-label={field.label} rows={4} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />;
  } else if (field.type === 'date') {
    control = <input aria-label={field.label} type="date" value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />;
  } else if (field.type === 'richtext') {
    control = <Suspense fallback={<div className="rich-text-editor is-loading">Preparing the editor…</div>}><RichTextEditor label={field.label} headings={field.headings} value={typeof value === 'string' ? value : ''} slashItems={slashItems} onInsertBlock={onInsertBlock} onChange={onChange} /></Suspense>;
  } else if (field.type === 'image') {
    const src = typeof value === 'string' ? value : '';
    control = <div className="layout-image-field">
      {src && <img src={previewForPath(src)} alt="" />}
      <button type="button" className="button button--secondary" onClick={() => setPicker(true)}>{src ? 'Replace photo' : 'Choose photo'}</button>
      {src && <button type="button" className="button button--quiet" onClick={() => onChange(null)}>Remove</button>}
      <MediaPicker open={picker} imageType="gallery" preset={config.imageSizes.gallery} onClose={() => setPicker(false)} onPick={picked => onChange(picked.path)} onNotice={onNotice} />
    </div>;
  } else if (field.type === 'link') {
    control = <LinkControl value={value} onChange={onChange} />;
  } else if (field.type === 'select') {
    control = <select aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  } else if (field.type === 'token') {
    const options = (config.elementLibrary || EMPTY_LIBRARY).choices.tokens[field.scale || ''] || [];
    control = <select aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  } else if (field.type === 'align') {
    const choices = (config.elementLibrary || EMPTY_LIBRARY).choices;
    const options = field.inherit ? ['auto', ...choices.alignments] : choices.alignments;
    control = <select aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option} value={option}>{option === 'auto' ? 'Same as section' : option === 'start' ? 'Left' : 'Centre'}</option>)}</select>;
  } else if (field.type === 'heading-level') {
    control = <select aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}>{(config.elementLibrary || EMPTY_LIBRARY).choices.headingLevels.map(option => <option key={option} value={option}>{option.toUpperCase()}</option>)}</select>;
  } else {
    control = <input aria-label={field.label} value={typeof value === 'string' ? value : ''} pattern={field.pattern} onChange={event => onChange(event.target.value)} />;
  }
  return <div className="form-field layout-property" data-field={name}>
    <div className="form-field__label"><label>{field.label}{field.required && <em>Required</em>}</label></div>
    {field.hint && <p className="field-hint">{field.hint}</p>}
    {control}
  </div>;
}

export function LayoutField({ value, config, onChange, onNotice }: {
  value: ContentValue | undefined;
  config: AdminConfig;
  onChange: (value: ContentValue) => void;
  onNotice: (message: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const library = config.elementLibrary || EMPTY_LIBRARY;
  const definitions = useMemo(() => new Map(library.elements.map(def => [def.name, def])), [library]);
  const layout: LayoutRoot = value && typeof value === 'object' && !Array.isArray(value) && 'children' in value
    ? value as LayoutRoot
    : { schema: library.schema, children: [] };
  const [selected, setSelected] = useState<string | null>(layout.children[0]?.id || null);
  const [activeTab, setActiveTab] = useState('Content');
  const undoStack = useRef<LayoutRoot[]>([]);
  const redoStack = useRef<LayoutRoot[]>([]);
  const [, refreshHistory] = useState(0);
  const selectedNode = selected ? findNode(layout.children, selected) : undefined;
  const selectedDef = selectedNode ? definitions.get(selectedNode.type) : undefined;

  useEffect(() => {
    const first = selectedDef ? Object.keys(selectedDef.tabs)[0] : 'Content';
    setActiveTab(first);
  }, [selected, selectedDef]);

  const commitLayout = (next: LayoutRoot, remember = true) => {
    if (remember) {
      undoStack.current.push(structuredClone(layout));
      redoStack.current = [];
    }
    onChange(next);
    refreshHistory(version => version + 1);
  };
  const commit = (children: LayoutNode[]) => commitLayout({ schema: library.schema, children });
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(structuredClone(layout));
    commitLayout(previous, false);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(structuredClone(layout));
    commitLayout(next, false);
  };
  const add = (parentId: string | null, type: string) => {
    const def = definitions.get(type);
    if (!def) return;
    const node: LayoutNode = { type, id: newId(), props: { ...def.defaults }, ...(def.container ? { children: [] } : {}) };
    if (parentId) commit(mapNode(layout.children, parentId, parent => ({ ...parent, children: [...(parent.children || []), node] })));
    else commit([...layout.children, node]);
    setSelected(node.id);
  };
  const updateProp = (name: string, propValue: LayoutProp) => {
    if (!selectedNode) return;
    commit(mapNode(layout.children, selectedNode.id, node => ({ ...node, props: { ...(node.props || {}), [name]: propValue } })));
  };
  const remove = (id: string) => {
    commit(removeNode(layout.children, id));
    if (selected === id) setSelected(null);
  };
  const selectedParent = selectedNode ? parentOf(layout.children, selectedNode.id) : undefined;
  const slashItems: SlashItem[] = selectedDef?.name === 'prose' && selectedParent
    ? (library.children[selectedParent.type] || [])
      .filter(type => type !== 'prose' && type !== 'heading')
      .map(type => definitions.get(type))
      .filter(Boolean)
      .map(def => ({ type: def!.name, title: def!.title, icon: def!.icon }))
    : [];
  const insertSibling = (type: string) => {
    if (!selectedNode) return;
    const def = definitions.get(type);
    if (!def || !selectedParent || !def.allowedParents.includes(selectedParent.type)) return;
    const node: LayoutNode = { type, id: newId(), props: { ...def.defaults }, ...(def.container ? { children: [] } : {}) };
    const result = insertAfterNode(layout.children, selectedNode.id, node);
    if (!result.found) return;
    commit(result.nodes);
    setSelected(node.id);
  };
  const parentType = selectedDef?.container ? selectedDef.name : 'layout';
  const parentId = selectedDef?.container ? selectedNode?.id || null : null;
  const allowed = (library.children[parentType] || []).map(type => definitions.get(type)).filter(Boolean) as ElementDefinition[];
  const visibleFields = selectedDef?.tabs[activeTab] || [];

  return <div className="layout-field">
    <aside className="layout-field__outline" aria-label="Page outline">
      <header><div><strong>Page outline</strong><span>{layout.children.length ? 'Select a block to edit it' : 'Start with a section or article'}</span></div><div className="layout-history"><button type="button" disabled={!undoStack.current.length} onClick={undo} aria-label="Undo page change">↶</button><button type="button" disabled={!redoStack.current.length} onClick={redo} aria-label="Redo page change">↷</button></div></header>
      {layout.children.length
        ? <Outline nodes={layout.children} definitions={definitions} selected={selected} onSelect={setSelected} onMove={(id, direction) => commit(moveNode(layout.children, id, direction))} onRemove={remove} />
        : <p className="empty-small">This page has no builder content yet.</p>}
    </aside>
    <section className="layout-field__editor">
      {selectedNode && selectedDef ? <>
        <header className="layout-field__editor-title"><span aria-hidden="true">{selectedDef.icon || '□'}</span><div><h3>{selectedDef.title}</h3><p>Edit this block, or add content inside it.</p></div></header>
        <div className="layout-tabs" role="tablist" aria-label={`${selectedDef.title} settings`}>
          {Object.keys(selectedDef.tabs).map(tab => <button type="button" role="tab" aria-selected={tab === activeTab} className={tab === activeTab ? 'is-active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </div>
        <div className="layout-properties">
          {visibleFields.map(name => {
            const field = selectedDef.fields[name];
            if (!field || (field.enable && !selectedNode.props?.[field.enable])) return null;
            return <ElementControl key={name} name={name} field={field} value={selectedNode.props?.[name]} config={config} slashItems={slashItems} onInsertBlock={insertSibling} onChange={next => updateProp(name, next)} onNotice={onNotice} />;
          })}
        </div>
      </> : selectedNode ? <p className="field-hint field-hint--error">This block comes from a newer or site-specific element library. It has been kept unchanged.</p> : <div className="layout-field__welcome"><h3>Build this page</h3><p>Add a section for a designed page, or an article for a long guide.</p></div>}
      <div className="layout-palette">
        <strong>{parentId ? `Add inside ${selectedDef?.title}` : 'Add to page'}</strong>
        <div>{allowed.map(def => <button type="button" key={def.name} onClick={() => add(parentId, def.name)}><span aria-hidden="true">{def.icon || '□'}</span>{def.title}</button>)}</div>
      </div>
    </section>
  </div>;
}
