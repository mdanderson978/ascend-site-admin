export type Primitive = string | number | boolean | null;
export type ContentValue = Primitive | ImageValue | ImageValue[] | string[] | DocumentValue | DocumentValue[] | BlockValue[] | LayoutRoot;
export type ContentData = Record<string, ContentValue | undefined>;

export interface ImageValue { src: string; alt?: string }
export interface DocumentValue { label: string; url: string }

export type FieldType = 'string' | 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'markdown' | 'image' | 'images' | 'list' | 'pdf' | 'pdfs' | 'heading' | 'select' | 'blocks' | 'layout';

export interface SelectOption { value: string; label: string }

/** type: 'blocks' only — one entry in the palette a `blocks` field offers.
 *  `fields` reuses the ordinary FieldConfig system verbatim — a block type
 *  is just a small field template, same shape as a page's own top-level
 *  `fields` array. Nesting a `blocks` or `markdown` field inside `fields`
 *  is rejected at server boot (see index.mjs's validateBlockTypeConfig). */
export interface BlockTypeDef {
  id: string;
  label: string;
  icon?: string;
  fields: FieldConfig[];
}

/** One item in a `blocks` field's array value. `id` is UI-only bookkeeping
 *  (React keys, drag identity) — stripped server-side before the value is
 *  ever written to a content file's YAML. Every other key is one of this
 *  block's own field values, keyed by that field's `name`. */
export interface BlockValue { id: string; type: string; [fieldName: string]: ContentValue | string }

export type LayoutProp = string | boolean | LinkValue | null | undefined;
export interface LinkValue { page?: string; url?: string; tel?: string; email?: string; anchor?: string; document?: string }
export interface LayoutNode { type: string; id: string; props?: Record<string, LayoutProp>; children?: LayoutNode[] }
export interface LayoutRoot { schema: number; children: LayoutNode[] }

export type ElementFieldType = 'string' | 'date' | 'text' | 'richtext' | 'image' | 'link' | 'select' | 'token' | 'align' | 'heading-level' | 'boolean';
export interface ElementFieldConfig {
  type: ElementFieldType;
  label: string;
  hint?: string;
  required?: boolean;
  pattern?: string;
  scale?: string;
  inherit?: boolean;
  headings?: boolean;
  enable?: string;
  options?: SelectOption[];
}
export interface ElementDefinition {
  name: string;
  title: string;
  group: string;
  icon?: string;
  container: boolean;
  fields: Record<string, ElementFieldConfig>;
  tabs: Record<string, string[]>;
  defaults: Record<string, LayoutProp>;
  allowedParents: string[];
}
export interface ElementLibrary {
  schema: number;
  elements: ElementDefinition[];
  children: Record<string, string[]>;
  choices: {
    tokens: Record<string, SelectOption[]>;
    alignments: string[];
    headingLevels: string[];
  };
}

export interface FieldConfig {
  name: string;
  label: string;
  type?: FieldType;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  size?: string;
  /** @deprecated Use size; retained for early V2 development configs. */
  imageType?: string;
  /** type: 'blocks' — minimum number of blocks required, if any. */
  min?: number;
  /** type: 'blocks' — maximum number of blocks allowed, if any. */
  max?: number;
  /** type: 'select' only — suggested choices. With allowCustom unset/false
   *  this is the exhaustive, enforced list (a plain <select>). With
   *  allowCustom: true these are offered as autocomplete suggestions but
   *  the editor may type any other value (a text input + <datalist>). */
  options?: SelectOption[];
  /** type: 'select' only — see `options`. */
  allowCustom?: boolean;
  /** type: 'blocks' only — the palette of block types this field can contain. */
  blockTypes?: BlockTypeDef[];
}

export interface NavigationItem { key?: string; dynamic?: string; sub?: boolean; exclude?: string[] }
export interface NavigationSection { label: string; breadcrumb?: boolean; items: NavigationItem[] }
export interface DynamicCollection { label: string; titleField: string; orderField?: string }
export interface TaskShortcut { goto: string; field?: string; label: string }
export interface ImagePreset { w?: number; h?: number; label?: string; maxWidth?: number; maxHeight?: number; fit?: string }

export interface ShortcodeField {
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'group';
  required?: boolean;
  hint?: string;
  placeholder?: string;
  value?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  addLabel?: string;
  itemFields?: ShortcodeField[];
}
export interface ShortcodeEntry {
  id: string;
  icon?: string;
  label: string;
  tooltip?: string;
  panel?: { fields?: ShortcodeField[]; submitLabel?: string; ariaLabel?: string };
  directive?: { kind?: 'leaf' | 'container'; name: string; attrs?: Record<string, number | string>; contentField?: number };
}
export interface ShortcodeConfig { include?: string[]; custom?: ShortcodeEntry[] }

export interface AdminConfig {
  siteTitle: string;
  browserTitle: string;
  pageLabels: Record<string, string>;
  navStructure: NavigationSection[];
  dynamicCollections: Record<string, DynamicCollection>;
  tasks: TaskShortcut[];
  shortcodes: ShortcodeConfig;
  siteUrl: string;
  urlPatterns: Record<string, string | null>;
  renamable: string[];
  externalLinkSurfaces: string[];
  crossListable: Record<string, { field: string; targetCollection: string; label?: string }>;
  menuSlots: Record<string, MenuSlot>;
  /** 'owner/repo', derived server-side from the origin git remote. null if
   *  there's no remote or it isn't a github.com URL (mainly test fixtures) -
   *  the post-publish banner shows no deploy-status link/badge in that case. */
  githubRepo: string | null;
  /** The .github/workflows/*.yml filename that builds and deploys this
   *  site - defaults to 'publish-deploy.yml' server-side. */
  deployWorkflowFile: string;
  imageSizes: Record<string, ImagePreset>;
  startScreenIntro: string;
  startScreenNote: string;
  altPlaceholder: string;
  richHtmlImport?: boolean;
  /** V3 page-builder catalogue. Present when the installed engine supports layout fields. */
  elementLibrary?: ElementLibrary;
}

/** A `blocks` field's preview entry: one preview-map per block, keyed by
 *  that block's own image field name(s) — mirrors the top-level
 *  `EntryResponse.previews` shape one level down. */
export type BlockPreviews = Array<Record<string, string | Array<string | null>>>;

export interface EntryResponse {
  key?: string;
  slug?: string;
  data: ContentData;
  body: string;
  fields: FieldConfig[];
  previews: Record<string, string | Array<string | null> | BlockPreviews>;
}

export interface RenameLinkHit { file: string; count: number }
export interface RenameCascadeHit { collection: string; count: number }

export interface RenamePreview {
  ok: boolean;
  error?: string;
  oldPath?: string;
  newPath?: string;
  newSlug?: string;
  collision?: 'filename' | 'redirect-source' | null;
  linksToFix?: RenameLinkHit[];
  cascade?: RenameCascadeHit[];
  externalLinkSurfaces?: string[];
}

export interface RenameResult {
  ok: boolean;
  error?: string;
  slug?: string;
  redirect?: { from: string; to: string };
  linksFixed?: number;
  cascaded?: number;
}
export interface SearchField { name: string; label: string; hint: string; value: string }
export type SearchIndex = Record<string, SearchField[]>;
export type ContentTree = Record<string, string[]>;
export interface UploadImage { name?: string; path: string; preview: string }
export interface ChatGptRecovery {
  id: string;
  targetKey: string;
  createdAt: number;
  state: 'active' | 'undone' | 'superseded' | 'failed';
  canUndo: boolean;
  hasOriginalPaste: boolean;
}
export interface RichHtmlImportResult {
  body: string;
  title: string;
  description: string;
  targetSlug: string;
  assets: { style: string; script: string; images: string[] };
  report: { images: number; styleBlocks: number; inlineStyles: number; scriptBlocks: number; skippedScripts: number; eventHandlers: number; externalResources: number; localAssets: number; repairedImages: number };
  warnings: string[];
  recovery?: ChatGptRecovery;
}
export interface HistoryVersion { sha: string; date: number; message: string }

// Menus: admin-authored, freely add/rename/delete-able named menus. A page
// item stores stableId (never a slug/path) so a rename never goes stale -
// livePath/missing are resolved server-side on every GET, never persisted.
export interface MenuPageItem { id: string; type: 'page'; stableId: string; label: string; key?: string | null; livePath?: string | null; missing?: boolean }
export interface MenuLinkItem { id: string; type: 'link'; url: string; label: string; newTab?: boolean; nofollow?: boolean; sponsored?: boolean }
export interface MenuHeadingItem { id: string; type: 'heading'; label: string; children: Array<MenuPageItem | MenuLinkItem> }
export type MenuItem = MenuPageItem | MenuLinkItem | MenuHeadingItem;
export interface Menu { id: string; name: string; items: MenuItem[] }
export interface MenusResponse { menus: Menu[]; slotAssignments: Record<string, string> }
export interface MenuSlot { label: string }
export interface MenuPageOption { key: string; title: string; stableId: string }
