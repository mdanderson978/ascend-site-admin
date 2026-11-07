import '@testing-library/jest-dom/vitest';

const localValues = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    get length() { return localValues.size; },
    clear: () => localValues.clear(),
    getItem: (key: string) => localValues.get(String(key)) ?? null,
    key: (index: number) => [...localValues.keys()][index] ?? null,
    removeItem: (key: string) => { localValues.delete(String(key)); },
    setItem: (key: string, value: string) => { localValues.set(String(key), String(value)); },
  } satisfies Storage,
});

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
}

// ProseMirror asks the browser for caret geometry. jsdom deliberately has no
// layout engine, so provide inert rectangles for editor interaction tests.
if (!document.elementFromPoint) document.elementFromPoint = () => document.body;
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [new DOMRect()] as unknown as DOMRectList;
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect();
