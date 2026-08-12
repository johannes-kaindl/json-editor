/**
 * The active window's document — pop-out-window safe (Obsidian's `activeDocument`
 * global). Wrapped in a typed helper so call sites stay fully type-safe (the
 * return type is `Document`, not `any`) even under type-aware linters that don't
 * load Obsidian's ambient global declarations. Avoids the bare `document` global
 * (eslint-plugin-obsidianmd `prefer-active-doc`).
 */
export function activeDoc(): Document {
  return activeDocument;
}

/**
 * Obsidian's own element helpers live on `Window` at runtime, but its type
 * declarations only put `createEl` on `Node` and in the global scope — so
 * `doc.win.createEl(...)`, the form `obsidianmd/prefer-create-el` asks for, does
 * not type-check. The cast is made once here rather than at every call site.
 */
type ElementCreatingWindow = Window & {
  createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
};

/**
 * An element factory bound to `doc`'s window — pop-out safe, because it builds
 * in the document that actually owns the container rather than in whichever
 * window happens to be focused. This is what `core/render` receives so it can
 * stay free of both Obsidian imports and `document.createElement`.
 */
export function elementFactory(
  doc: Document,
): <K extends keyof HTMLElementTagNameMap>(tag: K) => HTMLElementTagNameMap[K] {
  const win = doc.win as ElementCreatingWindow;
  return (tag) => win.createEl(tag);
}

/**
 * Create a detached element through Obsidian's helper, in `doc`'s window
 * (defaults to the active document). The adapter's counterpart to the factory
 * handed to `core/render` — same mechanism, convenient at a call site.
 */
export function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  doc: Document = activeDoc(),
): HTMLElementTagNameMap[K] {
  return elementFactory(doc)(tag);
}
