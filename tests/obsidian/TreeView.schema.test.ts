import { describe, it, expect, beforeEach } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("TreeView.setValidationErrors", () => {
  it("applies json-row-error class + title attribute on matching rows", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1, b: "bad" } as never);
    view.setValidationErrors(new Map([["b", "must be a number"]]));
    const errRow = container.querySelector<HTMLElement>('.json-row[data-path="b"]')!;
    expect(errRow.classList.contains("json-row-error")).toBe(true);
    expect(errRow.getAttribute("title")).toBe("must be a number");
    const okRow = container.querySelector<HTMLElement>('.json-row[data-path="a"]')!;
    expect(okRow.classList.contains("json-row-error")).toBe(false);
  });

  it("clearing errors removes the class + title", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1, b: "bad" } as never);
    view.setValidationErrors(new Map([["b", "type error"]]));
    view.setValidationErrors(new Map());
    const row = container.querySelector<HTMLElement>('.json-row[data-path="b"]')!;
    expect(row.classList.contains("json-row-error")).toBe(false);
    expect(row.getAttribute("title")).toBeNull();
  });

  it("works for nested object paths", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ outer: { inner: 99 } } as never);
    view.setValidationErrors(new Map([["outer.inner", "out of range"]]));
    const row = container.querySelector<HTMLElement>('.json-row[data-path="outer.inner"]')!;
    expect(row.classList.contains("json-row-error")).toBe(true);
  });

  it("works for array index paths", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue([1, "two", 3] as never);
    view.setValidationErrors(new Map([["[1]", "must be number"]]));
    const row = container.querySelector<HTMLElement>('.json-row[data-path="[1]"]')!;
    expect(row.classList.contains("json-row-error")).toBe(true);
  });

  it("persists across re-renders triggered by setValue", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1 } as never);
    view.setValidationErrors(new Map([["a", "boom"]]));
    view.setValue({ a: 2 } as never);
    const row = container.querySelector<HTMLElement>('.json-row[data-path="a"]')!;
    expect(row.classList.contains("json-row-error")).toBe(true);
  });
});
