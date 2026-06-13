// Audit 2.2: undo/redo in source mode ran restoreText -> setViewData ->
// refreshMode, which destroyed and rebuilt the CodeMirror editor on every step
// (cursor/scroll/focus lost; unusable in long files). The source-mode restore
// must dispatch a minimal change into the existing editor instead.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;
const sourceChange = (v: JsonFileView, text: string) =>
  (v as unknown as { handleSourceChange(t: string): void }).handleSourceChange(text);

describe("JsonFileView source-mode undo (audit 2.2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("undo in source mode keeps the same CodeMirror editor instance", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);

    sourceChange(v, '{"a":12}');
    sourceChange(v, '{"a":123}');
    const editorBefore = v.contentEl.querySelector(".cm-editor");
    expect(editorBefore).not.toBeNull();
    expect(v.canUndo()).toBe(true);

    v.undo();

    expect(JSON.parse(v.getViewData())).toEqual({ a: 12 }); // one step undone
    expect(v.contentEl.querySelector(".cm-editor")).toBe(editorBefore); // NOT rebuilt
  });

  it("redo in source mode also keeps the same editor instance", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);
    sourceChange(v, '{"a":12}');
    const editorBefore = v.contentEl.querySelector(".cm-editor");
    v.undo();
    v.redo();
    expect(JSON.parse(v.getViewData())).toEqual({ a: 12 });
    expect(v.contentEl.querySelector(".cm-editor")).toBe(editorBefore);
  });
});
