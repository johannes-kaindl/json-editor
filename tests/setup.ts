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
