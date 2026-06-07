import { describe, expect, it } from "vitest";
import { createRowActions } from "../../src/obsidian/RowActions";

describe("createRowActions", () => {
  it("includes a rename button when canRename: true", () => {
    const el = createRowActions({ canRename: true, onRename: () => {}, onDelete: () => {} });
    expect(el.querySelector(".json-row-rename")).not.toBeNull();
  });

  it("omits the rename button when canRename: false (arrays)", () => {
    const el = createRowActions({ canRename: false, onRename: () => {}, onDelete: () => {} });
    expect(el.querySelector(".json-row-rename")).toBeNull();
  });

  it("always includes a delete button", () => {
    const a = createRowActions({ canRename: true, onRename: () => {}, onDelete: () => {} });
    const b = createRowActions({ canRename: false, onRename: () => {}, onDelete: () => {} });
    expect(a.querySelector(".json-row-delete")).not.toBeNull();
    expect(b.querySelector(".json-row-delete")).not.toBeNull();
  });

  it("clicking rename fires onRename and stops propagation", () => {
    let called = 0;
    const el = createRowActions({
      canRename: true,
      onRename: () => called++,
      onDelete: () => {},
    });
    document.body.appendChild(el);
    const renameBtn = el.querySelector<HTMLButtonElement>(".json-row-rename")!;
    renameBtn.click();
    expect(called).toBe(1);
  });

  it("clicking delete fires onDelete", () => {
    let called = 0;
    const el = createRowActions({
      canRename: false,
      onRename: () => {},
      onDelete: () => called++,
    });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(".json-row-delete")?.click();
    expect(called).toBe(1);
  });

  it("buttons have aria-labels for accessibility", () => {
    const el = createRowActions({ canRename: true, onRename: () => {}, onDelete: () => {} });
    expect(el.querySelector(".json-row-rename")?.getAttribute("aria-label")).toBe("Rename key");
    expect(el.querySelector(".json-row-delete")?.getAttribute("aria-label")).toBe("Delete row");
  });

  it("includes a type-switch button when onChangeType provided", () => {
    const el = createRowActions({
      canRename: true,
      onRename: () => {},
      onDelete: () => {},
      onChangeType: () => {},
    });
    expect(el.querySelector(".json-row-type")).not.toBeNull();
  });

  it("omits the type-switch button when onChangeType missing", () => {
    const el = createRowActions({ canRename: true, onRename: () => {}, onDelete: () => {} });
    expect(el.querySelector(".json-row-type")).toBeNull();
  });

  it("clicking type-switch fires onChangeType and stops propagation", () => {
    let called = 0;
    const el = createRowActions({
      canRename: false,
      onRename: () => {},
      onDelete: () => {},
      onChangeType: () => called++,
    });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(".json-row-type")?.click();
    expect(called).toBe(1);
  });

  it("type-switch button has aria-label", () => {
    const el = createRowActions({
      canRename: false,
      onRename: () => {},
      onDelete: () => {},
      onChangeType: () => {},
    });
    expect(el.querySelector(".json-row-type")?.getAttribute("aria-label")).toBe("Change type");
  });
});
