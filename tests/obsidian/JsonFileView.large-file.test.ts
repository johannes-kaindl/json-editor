// Audit 4.1: a multi-MB file opened eagerly in tree mode froze the main thread.
// Over the render budget, the view opens in source mode with a "Load tree
// anyway" banner; the override must not leak across a file switch.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;
// A single huge string trips the byte budget but renders as ONE tree row, so
// the "load anyway" path stays fast in happy-dom.
const bigString = JSON.stringify("x".repeat(1_100_000));

const treeRoot = (v: JsonFileView) => v.contentEl.querySelector(".json-tree-root");
const cmEditor = (v: JsonFileView) => v.contentEl.querySelector(".cm-editor");
const largeBanner = (v: JsonFileView) =>
  v.contentEl.querySelector(".json-large-file-banner") as HTMLElement;

describe("JsonFileView large-file guard (audit 4.1)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens an over-budget file in source mode with a banner", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS); // tree default
    document.body.appendChild(v.contentEl);
    v.setViewData(bigString, true);
    expect(cmEditor(v)).not.toBeNull();
    expect(treeRoot(v)).toBeNull();
    expect(largeBanner(v).hidden).toBe(false);
  });

  it("'Load tree anyway' switches to tree and hides the banner", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData(bigString, true);
    (v.contentEl.querySelector(".json-large-file-load") as HTMLButtonElement).click();
    expect(treeRoot(v)).not.toBeNull();
    expect(largeBanner(v).hidden).toBe(true);
  });

  it("the override does not survive a file switch (reused leaf)", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData(bigString, true);
    (v.contentEl.querySelector(".json-large-file-load") as HTMLButtonElement).click();
    expect(treeRoot(v)).not.toBeNull();

    v.setViewData(bigString, true); // different file (clear=true) → override reset
    expect(cmEditor(v)).not.toBeNull(); // forced source again
  });

  it("a small file opens in tree with no banner", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);
    expect(treeRoot(v)).not.toBeNull();
    expect(largeBanner(v).hidden).toBe(true);
  });

  it("re-checks the budget on a manual tree switch after in-session source growth", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true); // small, source mode (largeFile=false)

    // Grow past the node budget via a source-mode edit.
    const big = `[${Array.from({ length: 16000 }, (_, i) => i).join(",")}]`;
    (v as unknown as { handleSourceChange(t: string): void }).handleSourceChange(big);

    v.toggleMode(); // attempt source -> tree

    // The guard must re-evaluate: stay in source, show the banner — NOT render
    // a 16k-node tree (the freeze 4.1 prevents).
    expect(cmEditor(v)).not.toBeNull();
    expect(treeRoot(v)).toBeNull();
    expect(largeBanner(v).hidden).toBe(false);
  });

  it("a large AND lossy file opens in source (large precedence over lossy read-only tree)", () => {
    // Built as text to avoid a precision-losing numeric literal in source.
    const json = `[9007199254740993,${Array.from({ length: 15001 }, (_, i) => i).join(",")}]`;
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData(json, true); // node-budget exceeded + lossy int
    expect(cmEditor(v)).not.toBeNull();
    expect(treeRoot(v)).toBeNull();
  });
});
