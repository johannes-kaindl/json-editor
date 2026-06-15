// Obsidian exposes `activeDocument` / `activeWindow` as globals that point at
// the currently-focused window (so plugins are pop-out-window safe). happy-dom
// doesn't define them, so map them onto the test document/window here.
Object.assign(globalThis, {
  activeDocument: globalThis.document,
  activeWindow: globalThis.window,
});
