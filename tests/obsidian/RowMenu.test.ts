import { Menu } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonType } from "../../src/core/edit";
import { openRowMenu } from "../../src/obsidian/RowMenu";

const baseOpts = () => ({
  value: "x" as unknown,
  path: ["a"],
  canRename: true,
  currentType: "string" as JsonType,
  readonly: false,
  moveUpEnabled: true,
  moveDownEnabled: true,
  onCopyValue: vi.fn(),
  onCopyPath: vi.fn(),
  onRename: vi.fn(),
  onChangeType: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  onDelete: vi.fn(),
});

const titles = (menu: { items: { titleText: string }[] }) => menu.items.map((i) => i.titleText);
const evt = () => new MouseEvent("contextmenu");

describe("openRowMenu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Menu.instances = [];
  });

  it("editable object key: shows copy + rename + change-type + move + delete", () => {
    const menu = openRowMenu(evt(), baseOpts());
    expect(menu.shown).toBe(true);
    expect(titles(menu)).toEqual([
      "Copy value",
      "Copy path",
      "Rename key",
      "Change type",
      "Move up",
      "Move down",
      "Delete",
    ]);
  });

  it("array index: omits Rename key", () => {
    const menu = openRowMenu(evt(), { ...baseOpts(), canRename: false });
    expect(titles(menu)).not.toContain("Rename key");
    expect(titles(menu)).toContain("Move up");
  });

  it("readonly: only copy entries", () => {
    const menu = openRowMenu(evt(), { ...baseOpts(), readonly: true });
    expect(titles(menu)).toEqual(["Copy value", "Copy path"]);
  });

  it("validationError renders a disabled header item with the message", () => {
    const menu = openRowMenu(evt(), { ...baseOpts(), validationError: "must be a number" });
    expect(menu.items[0].titleText).toContain("must be a number");
    expect(menu.items[0].disabled).toBe(true);
  });

  it("disables Move up / Move down at the bounds", () => {
    const menu = openRowMenu(evt(), { ...baseOpts(), moveUpEnabled: false, moveDownEnabled: true });
    const up = menu.items.find((i) => i.titleText === "Move up")!;
    const down = menu.items.find((i) => i.titleText === "Move down")!;
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(false);
  });

  it("Delete item is marked as a warning", () => {
    const menu = openRowMenu(evt(), baseOpts());
    expect(menu.items.find((i) => i.titleText === "Delete")!.warning).toBe(true);
  });

  it("clicking Copy value invokes onCopyValue", () => {
    const opts = baseOpts();
    const menu = openRowMenu(evt(), opts);
    menu.items.find((i) => i.titleText === "Copy value")!.clickHandler!();
    expect(opts.onCopyValue).toHaveBeenCalled();
  });

  it("clicking Move up invokes onMoveUp", () => {
    const opts = baseOpts();
    const menu = openRowMenu(evt(), opts);
    menu.items.find((i) => i.titleText === "Move up")!.clickHandler!();
    expect(opts.onMoveUp).toHaveBeenCalled();
  });

  it("Copy path / Rename key / Move down / Delete each invoke their callback", () => {
    const opts = baseOpts();
    const menu = openRowMenu(evt(), opts);
    menu.items.find((i) => i.titleText === "Copy path")!.clickHandler!();
    menu.items.find((i) => i.titleText === "Rename key")!.clickHandler!();
    menu.items.find((i) => i.titleText === "Move down")!.clickHandler!();
    menu.items.find((i) => i.titleText === "Delete")!.clickHandler!();
    expect(opts.onCopyPath).toHaveBeenCalled();
    expect(opts.onRename).toHaveBeenCalled();
    expect(opts.onMoveDown).toHaveBeenCalled();
    expect(opts.onDelete).toHaveBeenCalled();
  });

  it("Change type opens a follow-up menu with 6 entries, current disabled; picking calls onChangeType", () => {
    const opts = baseOpts();
    const menu = openRowMenu(evt(), opts);
    const changeType = menu.items.find((i) => i.titleText === "Change type")!;
    changeType.clickHandler!();
    const typeMenu = Menu.instances.at(-1)!; // the follow-up menu created by the click
    expect(typeMenu).not.toBe(menu);
    expect(typeMenu.items.length).toBe(6);
    expect(typeMenu.items.find((i) => i.titleText.toLowerCase() === "string")!.disabled).toBe(true);
    typeMenu.items.find((i) => i.titleText.toLowerCase() === "number")!.clickHandler!();
    expect(opts.onChangeType).toHaveBeenCalledWith("number");
  });
});
