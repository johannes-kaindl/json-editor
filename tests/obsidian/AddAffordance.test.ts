import { describe, it, expect } from "vitest";
import { createAddAffordance } from "../../src/obsidian/AddAffordance";

describe("createAddAffordance", () => {
  it("renders '+ Add key' for object kind", () => {
    const el = createAddAffordance({ kind: "object", onAdd: () => {} });
    expect(el.querySelector(".json-add-trigger")?.textContent).toBe("+ Add key");
  });

  it("renders '+ Add item' for array kind", () => {
    const el = createAddAffordance({ kind: "array", onAdd: () => {} });
    expect(el.querySelector(".json-add-trigger")?.textContent).toBe("+ Add item");
  });

  it("array: clicking trigger fires onAdd with undefined immediately", () => {
    const calls: (string | undefined)[] = [];
    const el = createAddAffordance({ kind: "array", onAdd: (k) => calls.push(k) });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(".json-add-trigger")!.click();
    expect(calls).toEqual([undefined]);
  });

  it("object: clicking trigger reveals an inline input", () => {
    const el = createAddAffordance({ kind: "object", onAdd: () => {} });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(".json-add-trigger")!.click();
    expect(el.querySelector(".json-add-input")).toBeInstanceOf(HTMLInputElement);
  });

  it("object: pressing Enter on input fires onAdd with trimmed key", () => {
    const calls: (string | undefined)[] = [];
    const el = createAddAffordance({ kind: "object", onAdd: (k) => calls.push(k) });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(".json-add-trigger")!.click();
    const input = el.querySelector<HTMLInputElement>(".json-add-input")!;
    input.value = "  newKey  ";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(calls).toEqual(["newKey"]);
  });

  it("object: pressing Escape on input cancels (no onAdd, fires onCancel)", () => {
    const addCalls: unknown[] = [];
    const cancelCalls: unknown[] = [];
    const el = createAddAffordance({
      kind: "object",
      onAdd: () => addCalls.push(1),
      onCancel: () => cancelCalls.push(1),
    });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(".json-add-trigger")!.click();
    const input = el.querySelector<HTMLInputElement>(".json-add-input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(addCalls).toEqual([]);
    expect(cancelCalls).toEqual([1]);
  });

  it("object: empty input on commit fires onCancel, not onAdd", () => {
    const addCalls: unknown[] = [];
    const cancelCalls: unknown[] = [];
    const el = createAddAffordance({
      kind: "object",
      onAdd: () => addCalls.push(1),
      onCancel: () => cancelCalls.push(1),
    });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(".json-add-trigger")!.click();
    const input = el.querySelector<HTMLInputElement>(".json-add-input")!;
    input.value = "   ";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(addCalls).toEqual([]);
    expect(cancelCalls).toEqual([1]);
  });
});
