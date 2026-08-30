import type { AdminConfig, ContentData, ContentTree, EntryResponse, HistoryVersion, Menu, MenuItem, MenuPageOption, MenusResponse, RenamePreview, RenameResult, RichHtmlImportResult, SearchIndex, UploadImage } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  config: () => request<AdminConfig>('/api/config'),
  contentTree: () => request<ContentTree>('/api/content'),
  search: () => request<SearchIndex>('/api/search'),
  entry: (key: string) => request<EntryResponse>(`/api/content/${key}`),
  save: (key: string, data: ContentData, body: string) => request<{ ok: boolean; slug?: string; error?: string }>(`/api/content/${key}`, json({ data, body })),
  remove: (key: string) => request<{ ok: boolean; error?: string }>(`/api/content/${key}`, { method: 'DELETE' }),
  history: (key: string) => request<{ versions: HistoryVersion[] }>(`/api/history/${key}`),
  restore: (key: string, sha: string) => request<{ ok: boolean; restoredFiles?: string[]; error?: string }>(`/api/restore/${key}`, json({ sha })),
  publish: (message = 'Content update') => request<{ ok: boolean; output?: string }>('/api/git/push', json({ message })),
  renamePreview: (key: string, newSlug: string) => request<RenamePreview>(`/api/rename/${key}/preview`, json({ newSlug })),
  rename: (key: string, newSlug: string) => request<RenameResult>(`/api/rename/${key}`, json({ newSlug })),
  uploads: () => request<{ files: UploadImage[] }>('/api/uploads'),
  pageImages: (key: string, data: ContentData) => request<{ files: UploadImage[] }>(`/api/page-images/${key}`, json({ data })),
  importChatGptHtml: (key: string, html: string, data: ContentData) => request<RichHtmlImportResult>(`/api/import/chatgpt/${key}`, json({ html, data })),
  order: (collection: string, slugs: string[]) => request<{ ok: boolean }>(`/api/order/${collection}`, json({ slugs })),
  menus: () => request<MenusResponse>('/api/menus'),
  menuPages: () => request<{ pages: MenuPageOption[] }>('/api/menu-pages'),
  createMenu: (name: string) => request<{ ok: boolean; menu: Menu; error?: string }>('/api/menus', json({ name })),
  saveMenu: (id: string, changes: { name?: string; items?: MenuItem[] }) => request<{ ok: boolean; error?: string }>(`/api/menus/${id}`, json(changes)),
  deleteMenu: (id: string) => request<{ ok: boolean; error?: string }>(`/api/menus/${id}`, { method: 'DELETE' }),
  assignMenuSlot: (slotKey: string, menuId: string | null) => request<{ ok: boolean; error?: string }>(`/api/menu-slots/${slotKey}`, json({ menuId })),
  uploadImage: (file: File, imageType: string, onProgress?: (percent: number) => void) => new Promise<UploadImage>((resolve, reject) => {
    const data = new FormData();
    data.append('file', file);
    data.append('imageType', imageType);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/image');
    xhr.responseType = 'json';
    xhr.upload.onprogress = event => event.lengthComputable && onProgress?.(Math.round((event.loaded / event.total) * 100));
    xhr.onerror = () => reject(new Error('The upload could not be completed.'));
    xhr.onload = () => {
      const result = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300 && !result.error) resolve(result);
      else reject(new Error(result.error || `Upload failed (${xhr.status})`));
    };
    xhr.send(data);
  }),
  uploadPageImage: (key: string, file: File, contentData: ContentData, onProgress?: (percent: number) => void) => new Promise<UploadImage>((resolve, reject) => {
    const data = new FormData();
    data.append('file', file);
    data.append('data', JSON.stringify(contentData));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload/page-image/${key}`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = event => event.lengthComputable && onProgress?.(Math.round((event.loaded / event.total) * 100));
    xhr.onerror = () => reject(new Error('The upload could not be completed.'));
    xhr.onload = () => {
      const result = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300 && !result.error) resolve(result);
      else reject(new Error(result.error || `Upload failed (${xhr.status})`));
    };
    xhr.send(data);
  }),
  uploadPdf: (file: File, onProgress?: (percent: number) => void) => new Promise<{ path: string }>((resolve, reject) => {
    const data = new FormData(); data.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/pdf'); xhr.responseType = 'json';
    xhr.upload.onprogress = event => event.lengthComputable && onProgress?.(Math.round((event.loaded / event.total) * 100));
    xhr.onerror = () => reject(new Error('The upload could not be completed.'));
    xhr.onload = () => {
      const result = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300 && !result.error) resolve(result);
      else reject(new Error(result.error || `Upload failed (${xhr.status})`));
    };
    xhr.send(data);
  }),
};
