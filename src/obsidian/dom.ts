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
