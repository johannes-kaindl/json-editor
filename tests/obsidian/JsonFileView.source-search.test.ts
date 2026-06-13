// Audit 3.2: the source mode had no search and Cmd+F force-switched to tree
// (destroying the editor) or, on invalid JSON, silently focused a hidden
// SearchBar. focusSearch must be mode-aware: source -> CM search panel, tree ->
// the tree SearchBar.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

describe("JsonFileView mode-aware search (audit 3.2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("focusSearch in source mode opens the source search panel without switching to tree", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);
    const editorBefore = v.contentEl.querySelector(".cm-editor");

    v.focusSearch();

    expect(v.contentEl.querySelector(".cm-editor")).toBe(editorBefore); // still source, same editor
    const panel = v.contentEl.querySelector(".cm-search") ?? v.contentEl.querySelector(".cm-panel");
    expect(panel).not.toBeNull();
    expect(v.contentEl.querySelector(".json-tree-root")).toBeNull();
  });

  it("focusSearch in tree mode focuses the tree search bar", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS); // tree
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);

    v.focusSearch();

    const input = v.contentEl.querySelector(".json-search-input");
    expect(v.contentEl.ownerDocument.activeElement).toBe(input);
  });

  it("focusSearch on invalid JSON (forced source) opens source search, not a dead SearchBar", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("{not valid}", true); // forced source
    v.focusSearch();
    const panel = v.contentEl.querySelector(".cm-search") ?? v.contentEl.querySelector(".cm-panel");
    expect(panel).not.toBeNull();
  });
});
