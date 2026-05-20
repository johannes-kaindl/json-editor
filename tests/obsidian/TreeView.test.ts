import { describe, it, expect, beforeEach, vi } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

describe("TreeView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders into its container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { markerStyle: "modern" });
    view.setValue({ a: 1 });
    expect(container.querySelector(".json-tree-root")).not.toBeNull();
  });

  it("opens a text input when a string value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("jay");
  });

  it("opens a number input when a number value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ n: 42 });
    const value = container.querySelector(".json-number") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='number']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("42");
  });

  it("opens a checkbox when a boolean value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ b: true });
    const value = container.querySelector(".json-boolean") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.checked).toBe(true);
  });

  it("does not open an editor when a null value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ x: null });
    const value = container.querySelector(".json-null") as HTMLElement;
    value.click();
    expect(container.querySelector("input")).toBeNull();
  });

  it("emits onChange with the edited value when Enter is pressed on a text input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: unknown[] = [];
    const view = new TreeView(container, { onChange: (v) => changes.push(v) });
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(changes).toEqual([{ name: "sam" }]);
  });

  it("cancels edit on Escape without firing onChange", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: unknown[] = [];
    const view = new TreeView(container, { onChange: (v) => changes.push(v) });
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(changes).toEqual([]);
  });

  it("does not open an editor when readonly: true", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { readonly: true });
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    expect(container.querySelector("input")).toBeNull();
  });

  it("calls opts.onPathClick when a row is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: Array<(string | number)[]> = [];
    const view = new TreeView(container, { onPathClick: (p) => calls.push(p) });
    view.setValue({ name: "jay" });
    const row = container.querySelector('.json-row[data-path="name"]') as HTMLElement;
    row.click();
    expect(calls).toEqual([["name"]]);
  });

  it("attaches a .json-copy-btn to every rendered row", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1, b: { c: 2 } });
    const rows = container.querySelectorAll(".json-row");
    rows.forEach((r) => {
      expect(r.querySelector(".json-copy-btn")).not.toBeNull();
    });
  });

  it("copy button on a nested row copies the nested value (not the root)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ users: [{ name: "jay" }] });
    const innerRow = container.querySelector(
      '.json-row[data-path="users[0].name"]'
    ) as HTMLElement;
    const btn = innerRow.querySelector(".json-copy-btn") as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('"jay"');
  });

  it("scrollToPath finds a row by data-path and applies the flash class briefly", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ users: [{ name: "jay" }] });
    view.scrollToPath(["users", 0, "name"]);
    const row = container.querySelector('.json-row[data-path="users[0].name"]') as HTMLElement;
    expect(row.classList.contains("json-row-flash")).toBe(true);
  });

  it("scrollToPath is a no-op when no matching row exists", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1 });
    // Should not throw
    expect(() => view.scrollToPath(["nonexistent", "deeply", "nested"])).not.toThrow();
  });

  it("does not call opts.onValueHover while an inline edit input is focused", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: number[] = [];
    const view = new TreeView(container, { onValueHover: () => calls.push(1) });
    view.setValue({ name: "jay" });
    // Open an edit
    const valueEl = container.querySelector(".json-string") as HTMLElement;
    valueEl.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    input.focus();
    // Now hover a primitive — should be suppressed
    const anyValue = container.querySelector(".json-string");
    anyValue?.dispatchEvent(new MouseEvent("mouseenter"));
    expect(calls).toEqual([]);
  });
});
