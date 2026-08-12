// Obsidian exposes `activeDocument` / `activeWindow` as globals that point at
// the currently-focused window (so plugins are pop-out-window safe). happy-dom
// doesn't define them, so map them onto the test document/window here.
Object.assign(globalThis, {
  activeDocument: globalThis.document,
  activeWindow: globalThis.window,
});

// Obsidian augments Node with a cross-window-safe `instanceOf`; happy-dom lacks
// it. Provide a same-window equivalent for tests.
const nodeProto = globalThis.Node.prototype as Node & {
  instanceOf?: (type: unknown) => boolean;
};
if (typeof nodeProto.instanceOf !== "function") {
  nodeProto.instanceOf = function instanceOf(this: Node, type: unknown): boolean {
    return this instanceof (type as new (...args: never[]) => unknown);
  };
}

// Obsidian augments Document/Window/HTMLElement with its own DOM helpers
// (`createEl`, `createDiv`, `createSpan`, `setText`, and `document.win`). Plugin
// code is required to use them (obsidianmd/prefer-create-el) instead of
// `document.createElement`, so the test DOM has to provide them. happy-dom does
// not, and the kit's mock builds fake element objects rather than real nodes —
// which our DOM-structure tests cannot use. Hence a real-prototype polyfill.
type ElOpts = {
  cls?: string | string[];
  text?: string;
  type?: string;
  href?: string;
  title?: string;
  placeholder?: string;
  value?: string;
  attr?: Record<string, string | number | boolean | null>;
};

function applyElOpts(el: HTMLElement, o?: ElOpts): HTMLElement {
  if (!o) return el;
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.title !== undefined) el.title = o.title;
  if (o.type !== undefined) (el as HTMLInputElement).type = o.type;
  if (o.href !== undefined) (el as HTMLAnchorElement).href = o.href;
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
  if (o.placeholder !== undefined) (el as HTMLInputElement).placeholder = o.placeholder;
  if (o.attr) {
    for (const [k, v] of Object.entries(o.attr)) {
      if (v !== null) el.setAttribute(k, String(v));
    }
  }
  return el;
}

const win = globalThis.window as unknown as Record<string, unknown>;
win.createEl = (tag: string, o?: ElOpts) => applyElOpts(globalThis.document.createElement(tag), o);
win.createDiv = (o?: ElOpts) => applyElOpts(globalThis.document.createElement("div"), o);
win.createSpan = (o?: ElOpts) => applyElOpts(globalThis.document.createElement("span"), o);

// `document.win` is how Obsidian gets from a Document back to its Window — the
// pop-out-safe route the lint rule asks plugins to take. Define it on the actual
// prototype of the test document: happy-dom's document is an HTMLDocument whose
// chain does NOT pass through globalThis.Document, so patching that misses.
Object.defineProperty(Object.getPrototypeOf(globalThis.document), "win", {
  configurable: true,
  get(this: Document) {
    return this.defaultView ?? globalThis.window;
  },
});

const elProto = Object.getPrototypeOf(
  globalThis.document.createElement("div"),
) as unknown as Record<string, unknown>;
// On an element the helpers create AND append — that is the whole point of them.
elProto.createEl = function createEl(this: HTMLElement, tag: string, o?: ElOpts) {
  const child = applyElOpts(this.ownerDocument.createElement(tag), o);
  this.appendChild(child);
  return child;
};
elProto.createDiv = function createDiv(this: HTMLElement, o?: ElOpts) {
  return (this as unknown as { createEl: (t: string, o?: ElOpts) => HTMLElement }).createEl(
    "div",
    o,
  );
};
elProto.createSpan = function createSpan(this: HTMLElement, o?: ElOpts) {
  return (this as unknown as { createEl: (t: string, o?: ElOpts) => HTMLElement }).createEl(
    "span",
    o,
  );
};
if (typeof elProto.setText !== "function") {
  elProto.setText = function setText(this: HTMLElement, text: string) {
    this.textContent = text;
  };
}
