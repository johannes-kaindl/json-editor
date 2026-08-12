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

// Obsidian's element helpers (createEl/createDiv/createSpan/createFragment) under
// happy-dom — adopted rather than rewritten; see the file's provenance header.
import "./setup/dom-shim";

// Two things json_viewer needs that the shim does not carry, kept here so the
// adopted copy stays identical to its source:
//  - `document.win`: how Obsidian goes from a Document back to its Window. It is
//    the pop-out-safe route `obsidianmd/prefer-create-el` asks for, and
//    src/obsidian/dom.ts builds its element factory on it. Note the prototype:
//    happy-dom's document is an HTMLDocument whose chain does NOT pass through
//    globalThis.Document, so patching that one silently misses.
//  - `setText`: used by GoToPathModal's suggestion rendering.
Object.defineProperty(Object.getPrototypeOf(globalThis.document), "win", {
  configurable: true,
  get(this: Document) {
    return this.defaultView ?? globalThis.window;
  },
});

const winProto = globalThis.window as unknown as Record<string, unknown>;
for (const name of ["createEl", "createDiv", "createSpan"] as const) {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g[name] === "function") winProto[name] = g[name];
}

const elProto = globalThis.HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elProto.setText !== "function") {
  elProto.setText = function setText(this: HTMLElement, text: string) {
    this.textContent = text;
  };
}
