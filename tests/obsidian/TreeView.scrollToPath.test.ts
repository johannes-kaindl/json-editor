// scrollToPath used to just call scrollIntoView. That was already half-broken
// when a collapsed subtree was `max-height: 0`; since 1.10.2 made it
// `display: none` it is a complete no-op on a hidden row — which silently killed
// the breadcrumb click and, later, "Go to path".

import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

function mount(): { container: HTMLElement; view: TreeView } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new TreeView(container, { autoCollapseDepth: 99 });
  view.setValue({ database: { pool: { min: 2, idleMs: 30000 } }, other: 1 });
  return { container, view };
}

function containerFor(root: HTMLElement, pathStr: string): HTMLElement | null {
  const row = [...root.querySelectorAll<HTMLElement>(".json-row")].find(
    (r) => r.getAttribute("data-path") === pathStr,
  );
  return row?.querySelector<HTMLElement>(".json-container") ?? null;
}

describe("scrollToPath on a collapsed branch", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("expands every ancestor of the target row", () => {
    const { container, view } = mount();
    view.collapseAll();
    view.scrollToPath(["database", "pool", "idleMs"]);
    expect(containerFor(container, "database")?.classList.contains("is-collapsed")).toBe(false);
    expect(containerFor(container, "database.pool")?.classList.contains("is-collapsed")).toBe(
      false,
    );
  });

  it("leaves unrelated branches collapsed", () => {
    const { container, view } = mount();
    view.setValue({ a: { x: 1 }, b: { y: 2 } });
    view.collapseAll();
    view.scrollToPath(["a", "x"]);
    expect(containerFor(container, "a")?.classList.contains("is-collapsed")).toBe(false);
    expect(containerFor(container, "b")?.classList.contains("is-collapsed")).toBe(true);
  });

  it("expands the target's own container when the target is itself a container", () => {
    const { container, view } = mount();
    view.collapseAll();
    view.scrollToPath(["database", "pool"]);
    expect(containerFor(container, "database")?.classList.contains("is-collapsed")).toBe(false);
  });

  it("does not throw for a path that does not exist", () => {
    const { view } = mount();
    expect(() => view.scrollToPath(["nope", "nada"])).not.toThrow();
  });
});
