import { Menu, Platform, type WorkspaceLeaf } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;
const VALIDATING = { ...DEFAULT_SETTINGS, validateAgainstSchema: true };
const PERSON_SCHEMA = `{
  "type": "object",
  "properties": { "name": { "type": "string" }, "age": { "type": "integer" } },
  "required": ["name"]
}`;
const sourceChange = (v: JsonFileView, text: string) =>
  (v as unknown as { handleSourceChange(t: string): void }).handleSourceChange(text);
const shownMenu = () => Menu.instances.find((m) => m.shown)!;
const longPress = (v: JsonFileView, pathStr: string) => {
  const row = v.contentEl.querySelector<HTMLElement>(`.json-row[data-path="${pathStr}"]`)!;
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  return shownMenu();
};

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

  it("a source-mode edit enables the undo button immediately", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);
    const undoBtn = v.contentEl.querySelector<HTMLButtonElement>(".json-undo-btn")!;
    expect(undoBtn.disabled).toBe(true);
    sourceChange(v, '{"a":12}');
    expect(undoBtn.disabled).toBe(false);
  });

  it("long-press Rename key on an object key starts the inline rename editor", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    longPress(v, "a").items.find((i) => i.titleText === "Rename key")!.clickHandler!();
    const input = v.contentEl.querySelector<HTMLInputElement>(".json-inline-edit.json-key-rename");
    expect(input).not.toBeNull();
    expect(input?.value).toBe("a");
  });

  it("long-press Change type → Number changes the value type end-to-end", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"x":"hello"}', false);
    longPress(v, "x").items.find((i) => i.titleText === "Change type")!.clickHandler!();
    const typeMenu = Menu.instances.at(-1)!; // follow-up menu
    typeMenu.items.find((i) => i.titleText === "Number")!.clickHandler!();
    expect(JSON.parse(v.getViewData())).toEqual({ x: 0 });
  });

  it("schema validation error appears as a disabled menu header (D4)", () => {
    const v = new JsonFileView(fakeLeaf(), VALIDATING);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"Jay","age":"old"}', false);
    v.setSchema(PERSON_SCHEMA);
    const menu = longPress(v, "age");
    expect(menu.items[0].disabled).toBe(true);
    expect(menu.items[0].titleText.toLowerCase()).toMatch(/integer|type/);
  });

  it("array item row menu omits Rename key and disables Move up on the first item", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20,30]", false);
    const menu = longPress(v, "[0]");
    expect(menu.items.map((i) => i.titleText)).not.toContain("Rename key");
    expect(menu.items.find((i) => i.titleText === "Move up")!.disabled).toBe(true);
  });

  it("Move down is disabled on the last array item", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20,30]", false);
    const menu = longPress(v, "[2]");
    expect(menu.items.find((i) => i.titleText === "Move down")!.disabled).toBe(true);
  });
});
