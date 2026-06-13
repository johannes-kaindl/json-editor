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

  it("Change type submenu has 6 entries with the current type disabled; picking calls onChangeType", () => {
    const opts = baseOpts();
    const menu = openRowMenu(evt(), opts);
    const changeType = menu.items.find((i) => i.titleText === "Change type")!;
    const sub = changeType.submenu!;
    expect(sub.items.length).toBe(6);
    expect(sub.items.find((i) => i.titleText.toLowerCase() === "string")!.disabled).toBe(true);
    sub.items.find((i) => i.titleText.toLowerCase() === "number")!.clickHandler!();
    expect(opts.onChangeType).toHaveBeenCalledWith("number");
  });
});
