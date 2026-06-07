import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JSON_VIEW_TYPE, JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

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
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
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
    const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
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

  it("empty state has a title and a hint line", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("", false);
    expect(v.contentEl.querySelector(".json-empty-state-title")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-empty-state-hint")).not.toBeNull();
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

  it("renders a .json-toolbar holding the breadcrumb and the mode toggle", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const toolbar = v.contentEl.querySelector(".json-toolbar");
    expect(toolbar).not.toBeNull();
    expect(toolbar?.querySelector(".json-breadcrumb")).not.toBeNull();
    expect(toolbar?.querySelector(".json-mode-toggle")).not.toBeNull();
    const children = Array.from(v.contentEl.children);
    const toolbarIdx = children.findIndex((c) => c.classList.contains("json-toolbar"));
    const bodyIdx = children.findIndex((c) => c.classList.contains("json-editor-body"));
    expect(toolbarIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThan(toolbarIdx);
  });

  it("breadcrumb starts at 'root' on first render", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const segs = v.contentEl.querySelectorAll(".json-breadcrumb .bc-seg");
    expect(segs.length).toBe(1);
    expect(segs[0].textContent).toBe("root");
  });

  it("clicking a row updates the breadcrumb path", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    const row = v.contentEl.querySelector('.json-row[data-path="name"]') as HTMLElement;
    row.click();
    const segs = v.contentEl.querySelectorAll(".json-breadcrumb .bc-seg");
    expect(segs.length).toBe(2);
    expect(segs[1].textContent).toBe("name");
  });

  it("clicking a breadcrumb segment invokes scrollToPath on the tree", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"users":[{"name":"jay"}]}', false);
    // Click the row to populate the breadcrumb
    const row = v.contentEl.querySelector('.json-row[data-path="users[0].name"]') as HTMLElement;
    row.click();
    // Now click the 'users' segment in the breadcrumb (second segment after root)
    const segs = v.contentEl.querySelectorAll<HTMLElement>(".json-breadcrumb .bc-seg");
    segs[1].click();
    const usersRow = v.contentEl.querySelector('.json-row[data-path="users"]') as HTMLElement;
    expect(usersRow.classList.contains("json-row-flash")).toBe(true);
  });

  it("removes the breadcrumb DOM in clear()", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    v.clear();
    // Breadcrumb element still exists (it's part of chrome, not body), but should have reset to root
    const segs = v.contentEl.querySelectorAll(".json-breadcrumb .bc-seg");
    expect(segs.length).toBe(1);
    expect(segs[0].textContent).toBe("root");
  });
});

describe("JsonFileView SearchBar integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("toolbar contains a SearchBar in tree mode", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"port":8080}', false);
    const sb = v.contentEl.querySelector(".json-search-bar") as HTMLElement;
    expect(sb).toBeInstanceOf(HTMLElement);
    expect(sb.hidden).toBe(false);
  });

  it("SearchBar is hidden in source mode", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"port":8080}', false);
    const sb = v.contentEl.querySelector(".json-search-bar") as HTMLElement;
    expect(sb.hidden).toBe(true);
  });

  it("typing in SearchBar filters the tree", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"port":8080,"host":"localhost"}', false);
    const input = v.contentEl.querySelector(".json-search-input") as HTMLInputElement;
    input.value = "port";
    input.dispatchEvent(new Event("input"));
    const matches = v.contentEl.querySelectorAll(".json-match");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("match count is shown next to the input after a query", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"port":8080,"host":"localhost"}', false);
    const input = v.contentEl.querySelector(".json-search-input") as HTMLInputElement;
    input.value = "port";
    input.dispatchEvent(new Event("input"));
    const count = v.contentEl.querySelector(".json-search-count") as HTMLElement;
    expect(count.hidden).toBe(false);
    expect(count.textContent).toContain("match");
  });

  it("query persists through mode-switch tree→source→tree and re-applies", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"port":8080,"host":"localhost"}', false);
    const input = v.contentEl.querySelector(".json-search-input") as HTMLInputElement;
    input.value = "port";
    input.dispatchEvent(new Event("input"));

    const pills = v.contentEl.querySelectorAll<HTMLButtonElement>(".json-mode-pill");
    pills[1].click(); // Source
    pills[0].click(); // Tree

    const newInput = v.contentEl.querySelector(".json-search-input") as HTMLInputElement;
    expect(newInput.value).toBe("port");
    const matches = v.contentEl.querySelectorAll(".json-match");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("SearchBar is hidden in empty-state", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("", false);
    const sb = v.contentEl.querySelector(".json-search-bar") as HTMLElement;
    expect(sb.hidden).toBe(true);
  });

  it("focusSearch() switches to tree mode and focuses the input", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    v.focusSearch();
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();
    expect(document.activeElement).toBe(v.contentEl.querySelector(".json-search-input"));
  });
});
