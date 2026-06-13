// REPRO (Audit 2026-06-10): Datenverlust bei Leaf-Wiederverwendung.
//
// Obsidian ruft beim Wechsel auf eine andere Datei im selben Leaf:
//   onUnloadFile(fileA) → clear() → onLoadFile(fileB) → setViewData(contentB, true)
// Laut obsidian.d.ts (TextFileView.clear): "it's best to clear any editor
// states like undo-redo history". JsonFileView setzt this.history aber weder
// in clear() noch bei setViewData(_, clear=true) zurück → Cmd+Z in Datei B
// stellt Inhalt von Datei A her und ruft requestSave() → Datei B wird mit
// dem Inhalt von Datei A überschrieben.
//
// Diese Tests beschreiben das KORREKTE Verhalten und schlagen aktuell fehl.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

/** Simulate one tree-mode value edit (same pattern as JsonFileView.undo.test.ts). */
function editFirstString(v: JsonFileView, newText: string): void {
  const value = v.contentEl.querySelector(".json-string") as HTMLElement;
  value.click();
  const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
  input.value = newText;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
}

describe("REPRO: history must not survive a file switch (leaf reuse)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clear() + setViewData(B, clear=true) resets undo history", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);

    // --- File A is open, user edits it (history gets an entry) ---
    v.setViewData('{"name":"fileA"}', true);
    editFirstString(v, "edited");
    expect(JSON.parse(v.getViewData())).toEqual({ name: "edited" });
    expect(v.canUndo()).toBe(true);

    // --- Obsidian reuses the leaf for file B ---
    v.clear(); // onUnloadFile(fileA)
    v.setViewData('{"other":"fileB"}', true); // onLoadFile(fileB)

    // Per TextFileView contract the undo history belongs to file A and must
    // be gone now. Currently this FAILS: canUndo() is still true.
    expect(v.canUndo()).toBe(false);
  });

  it("undo after file switch must not write file A content into file B", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);

    // File A: open + edit
    v.setViewData('{"name":"fileA"}', true);
    editFirstString(v, "edited");

    // Leaf reuse for file B
    v.clear();
    v.setViewData('{"other":"fileB"}', true);
    const savesBeforeUndo = (v as unknown as { saveCount: number }).saveCount;

    // Cmd+Z in file B (command checkCallback gates on canUndo(), which is
    // — wrongly — still true, so undo() runs).
    v.undo();

    // Currently FAILS: getViewData() returns '{"name":"fileA"}' and
    // requestSave() was called → Obsidian would persist file A's content
    // into file B on disk.
    expect(JSON.parse(v.getViewData())).toEqual({ other: "fileB" });
    expect((v as unknown as { saveCount: number }).saveCount).toBe(savesBeforeUndo);
  });

  it("setViewData with clear=true alone (external reload) resets history", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);

    v.setViewData('{"name":"old"}', true);
    editFirstString(v, "edited");
    expect(v.canUndo()).toBe(true);

    // Same view instance gets fresh content flagged as "completely different
    // file" — history must reset even without an explicit clear() call.
    v.setViewData('{"name":"fresh"}', true);
    expect(v.canUndo()).toBe(false);
  });
});
