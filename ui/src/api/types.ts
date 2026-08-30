export type Primitive = string | number | boolean | null;
export type ContentValue = Primitive | ImageValue | ImageValue[] | string[] | DocumentValue | DocumentValue[];
export type ContentData = Record<string, ContentValue | undefined>;

export interface ImageValue { src: string; alt?: string }
export interface DocumentValue { label: string; url: string }

export type FieldType = 'string' | 'text' | 'textarea' | 'number' | 'boolean' | 'markdown' | 'image' | 'images' | 'list' | 'pdf' | 'pdfs' | 'heading' | 'select';

export interface SelectOption { value: string; label: string }

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
  min?: number;
  max?: number;
  /** type: 'select' only — suggested choices. With allowCustom unset/false
   *  this is the exhaustive, enforced list (a plain <select>). With
   *  allowCustom: true these are offered as autocomplete suggestions but
   *  the editor may type any other value (a text input + <datalist>). */
  options?: SelectOption[];
  /** type: 'select' only — see `options`. */
  allowCustom?: boolean;
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
  imageSizes: Record<string, ImagePreset>;
  startScreenIntro: string;
  startScreenNote: string;
  altPlaceholder: string;
  richHtmlImport?: boolean;
}

export interface EntryResponse {
  key?: string;
  slug?: string;
  data: ContentData;
  body: string;
  fields: FieldConfig[];
  previews: Record<string, string | Array<string | null>>;
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
export interface RichHtmlImportResult {
  body: string;
  title: string;
  description: string;
  targetSlug: string;
  assets: { style: string; script: string; images: string[] };
  report: { images: number; styleBlocks: number; inlineStyles: number; scriptBlocks: number; eventHandlers: number; externalResources: number };
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
