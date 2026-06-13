import { Menu, Platform, type WorkspaceLeaf } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

describe("JsonFileView mobile", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Menu.instances = [];
    Platform.isMobile = true;
  });
  afterEach(() => {
    Platform.isMobile = false;
  });

  it("renders the tree in touch mode (no draggable rows, no inline copy buttons)", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".json-row[draggable]")).toBeNull();
    expect(v.contentEl.querySelector(".json-copy-btn")).toBeNull();
  });

  it("moveRow moves an array item down", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20,30]", false);
    v.moveRow([0], +1);
    expect(JSON.parse(v.getViewData())).toEqual([20, 10, 30]);
  });

  it("moveRow moves an object key up (reorders keys)", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1,"b":2}', false);
    v.moveRow(["b"], -1);
    expect(Object.keys(JSON.parse(v.getViewData()))).toEqual(["b", "a"]);
  });

  it("moveRow on the first item is a no-op", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20]", false);
    v.moveRow([0], -1);
    expect(JSON.parse(v.getViewData())).toEqual([10, 20]);
  });

  it("long-press on a row opens a Menu whose Delete entry deletes the row", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1,"b":2}', false);
    const row = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="a"]')!;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const menu = Menu.instances.find((m) => m.shown)!;
    expect(menu.shown).toBe(true);
    menu.items.find((i) => i.titleText === "Delete")!.clickHandler!();
    expect(JSON.parse(v.getViewData())).toEqual({ b: 2 });
  });

  it("long-press Move down on the first array item reorders via the menu", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20,30]", false);
    const row = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="[0]"]')!;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const menu = Menu.instances.find((m) => m.shown)!;
    const moveDown = menu.items.find((i) => i.titleText === "Move down")!;
    expect(moveDown.disabled).toBe(false);
    moveDown.clickHandler!();
    expect(JSON.parse(v.getViewData())).toEqual([20, 10, 30]);
  });

  it("shows undo/redo buttons, disabled initially, undo enabled after an edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const undoBtn = v.contentEl.querySelector<HTMLButtonElement>(".json-undo-btn")!;
    const redoBtn = v.contentEl.querySelector<HTMLButtonElement>(".json-redo-btn")!;
    expect(undoBtn).not.toBeNull();
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
    v.setViewData("[10,20]", false);
    v.moveRow([0], +1);
    expect(v.contentEl.querySelector<HTMLButtonElement>(".json-undo-btn")!.disabled).toBe(false);
  });

  it("clicking the undo button reverts the last edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20]", false);
    v.moveRow([0], +1);
    expect(JSON.parse(v.getViewData())).toEqual([20, 10]);
    v.contentEl.querySelector<HTMLButtonElement>(".json-undo-btn")!.click();
    expect(JSON.parse(v.getViewData())).toEqual([10, 20]);
  });

  it("does NOT render undo/redo buttons on desktop", () => {
    Platform.isMobile = false;
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".json-undo-btn")).toBeNull();
  });
});
