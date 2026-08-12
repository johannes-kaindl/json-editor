// uebernommen aus obsidian-letterhead/tests/setup/dom-shim.ts, 2026-08-12
// Unveraendert. Ergaenzungen (document.win, setText) stehen bewusst in tests/setup.ts,
// damit diese Kopie byte-nah an der Quelle bleibt — REGISTRY-Eintrag "createEl-Shim",
// json_viewer ist das 3. Exemplar, die Kit-Extraktion ist damit faellig.
// Referenz-Implementierung von Obsidians createEl/createDiv/createSpan/createFragment
// für happy-dom-Tests. Obsidian definiert diese Helfer zur Laufzeit als globale Funktionen
// UND auf HTMLElement.prototype; happy-dom (und jsdom) kennen sie nicht.
//
// Das ist bewusst die dokumentierte Semantik — `document.createElement(tag)` + DomElementInfo
// anwenden + anhängen — und KEIN das-Ergebnis-verfälschender Stub: die Tests, die diese Helfer
// auslösen, prüfen weiterhin das reale DOM (`document.querySelector`), nicht diese Datei.
//
// Import in Tests, die Code mit createEl(...) unter happy-dom ausführen (z.B. do-print.test.ts).
type ElInfo = {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  href?: string;
  prepend?: boolean;
};

function apply(el: HTMLElement, o?: ElInfo | string): HTMLElement {
  if (!o) return el;
  if (typeof o === 'string') {
    el.className = o;
    return el;
  }
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(' ') : o.cls;
  if (o.text != null) el.textContent = o.text;
  if (o.attr) {
    for (const k of Object.keys(o.attr)) {
      const v = o.attr[k];
      if (v != null && v !== false) el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const p of ['title', 'value', 'type', 'placeholder', 'href'] as const) {
    if (o[p] != null) (el as unknown as Record<string, unknown>)[p] = o[p];
  }
  return el;
}

function make(doc: Document, tag: string, o?: ElInfo | string, cb?: (el: HTMLElement) => void): HTMLElement {
  const el = apply(doc.createElement(tag), o);
  cb?.(el);
  return el;
}

if (typeof globalThis.document !== 'undefined' && typeof globalThis.HTMLElement !== 'undefined') {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.createEl = function (this: HTMLElement, tag: string, o?: ElInfo | string, cb?: (el: HTMLElement) => void) {
    const el = make(this.ownerDocument, tag, o, cb);
    if (o && typeof o === 'object' && o.prepend) this.prepend(el);
    else this.appendChild(el);
    return el;
  };
  proto.createDiv = function (this: HTMLElement, o?: ElInfo | string, cb?: (el: HTMLElement) => void) {
    return (this as unknown as { createEl: typeof proto.createEl }).createEl('div', o, cb);
  };
  proto.createSpan = function (this: HTMLElement, o?: ElInfo | string, cb?: (el: HTMLElement) => void) {
    return (this as unknown as { createEl: typeof proto.createEl }).createEl('span', o, cb);
  };

  const g = globalThis as unknown as Record<string, unknown>;
  g.createEl = (tag: string, o?: ElInfo | string, cb?: (el: HTMLElement) => void) => make(document, tag, o, cb);
  g.createDiv = (o?: ElInfo | string, cb?: (el: HTMLElement) => void) => make(document, 'div', o, cb);
  g.createSpan = (o?: ElInfo | string, cb?: (el: HTMLElement) => void) => make(document, 'span', o, cb);
  g.createFragment = (cb?: (f: DocumentFragment) => void) => {
    const f = document.createDocumentFragment();
    cb?.(f);
    return f;
  };
}
