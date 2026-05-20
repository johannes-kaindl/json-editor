import { describe, it, expect, beforeEach } from "vitest";
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
});
