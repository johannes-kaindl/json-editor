import { describe, it, expect, beforeEach } from "vitest";
import { JsonFileView, JSON_VIEW_TYPE } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { WorkspaceLeaf } from "obsidian";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} } as WorkspaceLeaf);

describe("JsonFileView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("exposes JSON_VIEW_TYPE = 'json-editor-view'", () => {
    expect(JSON_VIEW_TYPE).toBe("json-editor-view");
  });

  it("renders a toggle with Tree and Source pills", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const pills = v.contentEl.querySelectorAll(".json-mode-pill");
    expect(pills.length).toBe(2);
    expect(pills[0].textContent).toBe("Tree");
    expect(pills[1].textContent).toBe("Source");
  });

  it("starts in tree mode by default", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();
    expect(v.contentEl.querySelector(".cm-editor")).toBeNull();
  });

  it("starts in source mode when settings.defaultMode = source", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-tree-root")).toBeNull();
  });

  it("toggles to source view when Source pill is clicked", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const sourcePill = v.contentEl.querySelectorAll(".json-mode-pill")[1] as HTMLElement;
    sourcePill.click();
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-tree-root")).toBeNull();
  });

  it("forces source mode and shows error banner when JSON is invalid", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("{not valid}", false);
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-error-banner")).not.toBeNull();
    const treePill = v.contentEl.querySelector(".json-mode-pill") as HTMLButtonElement;
    expect(treePill.disabled).toBe(true);
  });

  it("re-enables tree toggle when source content becomes valid again", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("{not valid}", false);
    v.setViewData('{"a":1}', false);
    const treePill = v.contentEl.querySelector(".json-mode-pill") as HTMLButtonElement;
    expect(treePill.disabled).toBe(false);
  });

  it("getViewData() returns the current text after tree edits", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    const data = v.getViewData();
    expect(JSON.parse(data)).toEqual({ name: "sam" });
  });

  it("calls requestSave after a tree edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    const before = v.saveCount;
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(v.saveCount).toBe(before + 1);
  });

  it("getViewType returns the registered view type", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    expect(v.getViewType()).toBe("json-editor-view");
  });

  it("shows an empty-state UI with 'Initialize as {}' button when data is empty", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("", false);
    const empty = v.contentEl.querySelector(".json-empty-state");
    expect(empty).not.toBeNull();
    const btn = v.contentEl.querySelector(".json-empty-state-init") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(v.contentEl.querySelector(".json-error-banner")).toBeNull();
  });

  it("initializes data as '{}' when the empty-state button is clicked", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("", false);
    const btn = v.contentEl.querySelector(".json-empty-state-init") as HTMLButtonElement;
    btn.click();
    expect(JSON.parse(v.getViewData())).toEqual({});
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-empty-state")).toBeNull();
  });
});
