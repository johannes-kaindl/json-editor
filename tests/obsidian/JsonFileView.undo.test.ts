import { describe, it, expect, beforeEach } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { WorkspaceLeaf } from "obsidian";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} } as WorkspaceLeaf);

describe("JsonFileView undo/redo + structural edits", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("canUndo starts false; becomes true after a value edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    expect(v.canUndo()).toBe(false);
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(v.canUndo()).toBe(true);
  });

  it("undo reverts a value edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(JSON.parse(v.getViewData())).toEqual({ name: "sam" });
    v.undo();
    expect(JSON.parse(v.getViewData())).toEqual({ name: "jay" });
  });

  it("redo re-applies after undo", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    v.undo();
    expect(JSON.parse(v.getViewData())).toEqual({ name: "jay" });
    v.redo();
    expect(JSON.parse(v.getViewData())).toEqual({ name: "sam" });
  });

  it("delete-row via RowActions deletes and is undoable", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1,"b":2}', false);
    const delBtn = v.contentEl.querySelector<HTMLButtonElement>(
      '.json-row[data-path="a"] .json-row-delete'
    )!;
    delBtn.click();
    expect(JSON.parse(v.getViewData())).toEqual({ b: 2 });
    v.undo();
    expect(JSON.parse(v.getViewData())).toEqual({ a: 1, b: 2 });
  });

  it("add-key via AddAffordance adds key with null value", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const trigger = v.contentEl.querySelector<HTMLButtonElement>(
      ".json-container > .json-content > .json-add-affordance > .json-add-trigger"
    )!;
    trigger.click();
    const input = v.contentEl.querySelector(".json-add-input") as HTMLInputElement;
    input.value = "newKey";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(JSON.parse(v.getViewData())).toEqual({ a: 1, newKey: null });
  });

  it("add-item via AddAffordance appends null to array", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[1,2]", false);
    const trigger = v.contentEl.querySelector<HTMLButtonElement>(
      ".json-add-trigger"
    )!;
    trigger.click();
    expect(JSON.parse(v.getViewData())).toEqual([1, 2, null]);
  });

  it("rename via RowActions updates key in place", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"old":1}', false);
    const renameBtn = v.contentEl.querySelector<HTMLButtonElement>(
      '.json-row[data-path="old"] .json-row-rename'
    )!;
    renameBtn.click();
    const input = v.contentEl.querySelector(".json-key-rename") as HTMLInputElement;
    input.value = "new";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(JSON.parse(v.getViewData())).toEqual({ new: 1 });
  });

  it("switching to source mode clears undo history", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(v.canUndo()).toBe(true);
    const sourcePill = v.contentEl.querySelectorAll<HTMLButtonElement>(".json-mode-pill")[1];
    sourcePill.click();
    expect(v.canUndo()).toBe(false);
  });

  it("add with duplicate key shows error (currentValue unchanged)", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const trigger = v.contentEl.querySelector<HTMLButtonElement>(
      ".json-add-trigger"
    )!;
    trigger.click();
    const input = v.contentEl.querySelector(".json-add-input") as HTMLInputElement;
    input.value = "a";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    // Duplicate rejected — data unchanged
    expect(JSON.parse(v.getViewData())).toEqual({ a: 1 });
  });

  it("Backspace on focused row deletes it", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1,"b":2}', false);
    const treeRoot = v.contentEl.querySelector(".json-tree-root") as HTMLElement;
    // First row "a" is the default active. Press Backspace.
    treeRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    expect(JSON.parse(v.getViewData())).toEqual({ b: 2 });
  });
});
