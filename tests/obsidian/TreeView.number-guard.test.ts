// Review finding #7: editing a number cell to a value beyond 2^53 silently
// truncated it (Number("9007199254740993") -> ...992) and saved the corrupted
// value. The tree editor must reject such input rather than corrupt silently;
// source mode remains the way to handle big integers.

import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

describe("TreeView number editor — unsafe integer guard (#7)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("rejects editing a number to an unsafe integer (>2^53) and surfaces an error", () => {
    const errors: Error[] = [];
    const changes: unknown[] = [];
    const tv = new TreeView(container, {
      onError: (e) => errors.push(e),
      onChange: (v) => changes.push(v),
    });
    tv.setValue({ n: 5 });

    const numEl = container.querySelector<HTMLElement>(".json-number")!;
    numEl.click();
    const input = container.querySelector<HTMLInputElement>(".json-inline-edit")!;
    input.value = "9007199254740993";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(errors.length).toBe(1);
    expect(changes.length).toBe(0); // edit not committed
    expect(tv.getValue()).toEqual({ n: 5 }); // value unchanged
  });

  it("still allows editing a number to a safe value", () => {
    const changes: unknown[] = [];
    const tv = new TreeView(container, { onChange: (v) => changes.push(v) });
    tv.setValue({ n: 5 });

    const numEl = container.querySelector<HTMLElement>(".json-number")!;
    numEl.click();
    const input = container.querySelector<HTMLInputElement>(".json-inline-edit")!;
    input.value = "42";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(changes).toEqual([{ n: 42 }]);
  });
});
