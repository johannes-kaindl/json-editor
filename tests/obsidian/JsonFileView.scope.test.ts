// Audit 2.1: default hotkeys were removed from the commands; the view instead
// registers a local keymap Scope. Crucially, Mod+Z while a text input (inline
// edit / rename / CodeMirror) is focused must fall through to native input
// undo — NOT roll back the whole document.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

interface ScopeKey {
  modifiers: string[] | null;
  key: string | null;
  handler: () => unknown;
}
const scopeOf = (v: JsonFileView) =>
  (v as unknown as { scope: { keys: ScopeKey[] } }).scope;
const binding = (k: ScopeKey) => `${(k.modifiers ?? []).join("+")}:${k.key}`;

describe("JsonFileView keymap Scope (audit 2.1)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("registers a view-local Scope with Mod+F, Mod+Z, Mod+Shift+Z", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    const scope = scopeOf(v);
    expect(scope).toBeTruthy();
    const bindings = scope.keys.map(binding);
    expect(bindings).toContain("Mod:f");
    expect(bindings).toContain("Mod:z");
    expect(bindings).toContain("Mod+Shift:z");
  });

  it("Mod+Z falls through (no document undo) while an inline editor is focused", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"a"}', true);

    // Make an undoable edit so canUndo() is true.
    (v.contentEl.querySelector(".json-string") as HTMLElement).click();
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    input.value = "edited";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(v.canUndo()).toBe(true);
    const dataAfterEdit = v.getViewData();

    // Open another inline editor and focus it.
    (v.contentEl.querySelector(".json-string") as HTMLElement).click();
    const input2 = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    input2.focus();
    expect(v.contentEl.ownerDocument.activeElement).toBe(input2);

    const modZ = scopeOf(v).keys.find((k) => binding(k) === "Mod:z");
    expect(modZ).toBeTruthy();
    const result = modZ?.handler();

    expect(result).toBeUndefined(); // not consumed → native input undo
    expect(v.getViewData()).toBe(dataAfterEdit); // document NOT rolled back
  });

  it("Mod+Z runs the document undo when focus is NOT in a text input", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"a"}', true);
    (v.contentEl.querySelector(".json-string") as HTMLElement).click();
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    input.value = "edited";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(JSON.parse(v.getViewData())).toEqual({ name: "edited" });

    // Focus is now on a row (re-render), not an input.
    const modZ = scopeOf(v).keys.find((k) => binding(k) === "Mod:z");
    modZ?.handler();

    expect(JSON.parse(v.getViewData())).toEqual({ name: "a" }); // undone
  });
});
