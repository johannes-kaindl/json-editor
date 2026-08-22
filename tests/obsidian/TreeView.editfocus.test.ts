import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

/**
 * An inline editor must hand its focus back into the tree BEFORE the commit tears
 * its element out of the document.
 *
 * Found by the GUI smoke test (2026-08-22), not by this suite: with the focus left
 * on the detached `<input>`, the next rebuild of the view body (`replaceChildren`)
 * fires a blur on a node that is no longer in the document, and Chromium aborts the
 * whole operation with
 *
 *     NotFoundError: Failed to execute 'replaceChildren' on 'Element': The node to
 *     be removed is no longer a child of this node. Perhaps it was moved in a
 *     'blur' event handler?
 *
 * The visible consequence: the FIRST Ctrl/Cmd+Z after a tree edit did nothing at
 * all (the command caught the exception and reported "not applicable"); only the
 * second one undid anything.
 */
describe("TreeView inline edit — focus handover", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  function mount(value: unknown, opts = {}): { container: HTMLElement; view: TreeView } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, opts);
    view.setValue(value as never);
    return { container, view };
  }

  function editValueAt(container: HTMLElement, path: string, next: string): HTMLInputElement {
    const target = container.querySelector<HTMLElement>(
      `.json-row[data-path="${path}"] .json-editable`,
    );
    if (!target) throw new Error(`no editable value at ${path}`);
    target.click();
    const input = container.querySelector<HTMLInputElement>(".json-inline-edit");
    if (!input) throw new Error("no inline editor opened");
    input.value = next;
    return input;
  }

  it("leaves the focus inside the tree after committing a string edit", () => {
    const { container } = mount({ marker: "before" });
    const input = editValueAt(container, "marker", "after");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(document.activeElement).not.toBe(input);
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("leaves the focus inside the tree after cancelling with Escape", () => {
    const { container } = mount({ marker: "before" });
    const input = editValueAt(container, "marker", "after");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.activeElement).not.toBe(input);
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("leaves the focus inside the tree after committing a key rename", () => {
    const mounted = mount({ marker: "before" });
    const { container } = mounted;
    const view = mounted.view;
    view.startRenameAt(["marker"]);

    const input = container.querySelector<HTMLInputElement>(".json-key-rename");
    if (!input) throw new Error("no rename editor opened");
    input.value = "renamed";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(document.activeElement).not.toBe(input);
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("leaves the focus inside the tree after toggling a boolean", () => {
    const { container } = mount({ flag: true });
    const target = container.querySelector<HTMLElement>(
      '.json-row[data-path="flag"] .json-editable',
    );
    if (!target) throw new Error("no editable boolean");
    target.click();
    const box = container.querySelector<HTMLInputElement>("input[type=checkbox]");
    if (!box) throw new Error("no checkbox opened");

    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));

    expect(document.activeElement).not.toBe(box);
    expect(container.contains(document.activeElement)).toBe(true);
  });
});
