import { beforeEach, describe, expect, it } from "vitest";
import type { JsonPath } from "../../src/core/types";
import { TreeView, type TreeViewOptions } from "../../src/obsidian/TreeView";

const DOC = { top: 1, cfg: { net: { host: "h", ports: [1, 2] }, name: "n" }, tail: [0] };

function mount(opts: TreeViewOptions = {}): { container: HTMLElement; view: TreeView } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new TreeView(container, { autoCollapseDepth: 99, ...opts });
  view.setValue(DOC);
  return { container, view };
}

const rowPaths = (c: HTMLElement): string[] =>
  [...c.querySelectorAll(".json-row")].map((r) => r.getAttribute("data-path") ?? "");

describe("TreeView focus on a subtree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders only the focused branch, with document-relative paths", () => {
    const { container, view } = mount();
    expect(view.setFocus(["cfg", "net"])).toBe(true);
    expect(rowPaths(container)).toEqual([
      "cfg.net.host",
      "cfg.net.ports",
      "cfg.net.ports[0]",
      "cfg.net.ports[1]",
    ]);
    expect(view.getFocus()).toEqual(["cfg", "net"]);
  });

  it("refuses a path that is not a container and keeps the current view", () => {
    const { container, view } = mount();
    const before = rowPaths(container);
    expect(view.setFocus(["top"])).toBe(false);
    expect(view.setFocus(["nope"])).toBe(false);
    expect(view.getFocus()).toEqual([]);
    expect(rowPaths(container)).toEqual(before);
  });

  it("an empty path leaves the focus and shows the whole file again", () => {
    const { container, view } = mount();
    view.setFocus(["cfg"]);
    expect(view.setFocus([])).toBe(true);
    expect(view.getFocus()).toEqual([]);
    expect(rowPaths(container)).toContain("top");
    expect(rowPaths(container)).toContain("tail[0]");
  });

  it("the focused root offers add-key with the FULL parent path", () => {
    const got: Array<{ parent: JsonPath; key: string }> = [];
    const { container, view } = mount({ onAddKey: (parent, key) => got.push({ parent, key }) });
    view.setFocus(["cfg", "net"]);
    const trigger = container.querySelector<HTMLElement>(
      ".json-tree-root > .json-container > .json-content > .json-add-affordance .json-add-trigger",
    );
    expect(trigger).not.toBeNull();
    trigger?.click();
    const input = container.querySelector<HTMLInputElement>(".json-add-input");
    expect(input).not.toBeNull();
    if (input) {
      input.value = "k";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    expect(got).toEqual([{ parent: ["cfg", "net"], key: "k" }]);
  });

  it("collapsedPaths reports document-relative paths of the focused containers", () => {
    const { view } = mount();
    view.setFocus(["cfg"]);
    view.collapseAll();
    expect(view.collapsedPaths().sort()).toEqual(["cfg", "cfg.net", "cfg.net.ports"].sort());
  });

  it("falls back to the whole file when the focused branch disappears", () => {
    const { container, view } = mount();
    view.setFocus(["cfg", "net"]);
    view.setValue({ top: 1 });
    expect(view.getFocus()).toEqual([]);
    expect(rowPaths(container)).toEqual(["top"]);
  });

  it("keeps the focus across a re-render that leaves the branch intact", () => {
    const { container, view } = mount();
    view.setFocus(["cfg"]);
    view.setValue({ ...DOC, top: 2 });
    expect(view.getFocus()).toEqual(["cfg"]);
    expect(rowPaths(container)).not.toContain("top");
  });

  it("collapse-to-first-level keeps the focused root open and closes below it", () => {
    const { container, view } = mount();
    view.setFocus(["cfg"]);
    view.collapseToFirstLevel();
    const roots = [...container.querySelectorAll<HTMLElement>(".json-container")];
    expect(
      roots
        .filter((c) => c.dataset.depth === "0")
        .every((c) => !c.classList.contains("is-collapsed")),
    ).toBe(true);
    expect(
      roots
        .filter((c) => c.dataset.depth !== "0")
        .every((c) => c.classList.contains("is-collapsed")),
    ).toBe(true);
  });
});
