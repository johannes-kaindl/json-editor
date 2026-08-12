import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

function makeView(): JsonFileView {
  const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, autoCollapseDepth: 99 });
  document.body.appendChild(v.contentEl);
  return v;
}

describe("JsonFileView collapse toolbar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a collapse toggle button in the toolbar", () => {
    const v = makeView();
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    const btn = v.contentEl.querySelector(".json-collapse-toggle-btn");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-label")).toBe("Collapse all");
  });

  it("collapses everything on first click and flips the label", () => {
    const v = makeView();
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    const btn = v.contentEl.querySelector<HTMLButtonElement>(".json-collapse-toggle-btn");
    btn?.click();
    const containers = [...v.contentEl.querySelectorAll(".json-container")];
    expect(containers.length).toBeGreaterThan(0);
    expect(containers.every((c) => c.classList.contains("is-collapsed"))).toBe(true);
    expect(btn?.getAttribute("aria-label")).toBe("Expand all");
  });

  it("expands everything on the second click", () => {
    const v = makeView();
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    const btn = v.contentEl.querySelector<HTMLButtonElement>(".json-collapse-toggle-btn");
    btn?.click();
    btn?.click();
    const containers = [...v.contentEl.querySelectorAll(".json-container")];
    expect(containers.some((c) => c.classList.contains("is-collapsed"))).toBe(false);
    expect(btn?.getAttribute("aria-label")).toBe("Collapse all");
  });

  it("does not throw when the file has no containers at all", () => {
    const v = makeView();
    v.setViewData(JSON.stringify(42), false);
    const btn = v.contentEl.querySelector<HTMLButtonElement>(".json-collapse-toggle-btn");
    expect(() => btn?.click()).not.toThrow();
  });

  it("collapseToDefaultDepth restores the configured depth", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, autoCollapseDepth: 0 });
    document.body.appendChild(v.contentEl);
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    v.expandAll();
    v.collapseToDefaultDepth();
    const deep = [...v.contentEl.querySelectorAll<HTMLElement>(".json-container")].filter(
      (c) => Number(c.dataset.depth) > 0,
    );
    expect(deep.length).toBeGreaterThan(0);
    expect(deep.every((c) => c.classList.contains("is-collapsed"))).toBe(true);
  });
});

describe("collapse button visibility", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is hidden in source mode — there is no tree to collapse there", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    const btn = v.contentEl.querySelector<HTMLButtonElement>(".json-collapse-toggle-btn");
    expect(btn?.hidden).toBe(true);
  });

  it("reappears when switching back to tree mode", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    v.toggleMode();
    const btn = v.contentEl.querySelector<HTMLButtonElement>(".json-collapse-toggle-btn");
    expect(btn?.hidden).toBe(false);
  });
});
