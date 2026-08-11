import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

function makeStore() {
  const data = new Map<string, string[]>();
  return {
    data,
    get: (p: string) => data.get(p),
    set: vi.fn((p: string, paths: string[]) => {
      data.set(p, paths);
    }),
  };
}

function makeView(store?: ReturnType<typeof makeStore>): JsonFileView {
  const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, autoCollapseDepth: 99 }, store);
  document.body.appendChild(v.contentEl);
  (v as unknown as { file: unknown }).file = {
    extension: "json",
    basename: "a",
    path: "notes/a.json",
  };
  return v;
}

function containerFor(root: HTMLElement, pathStr: string): HTMLElement | null {
  const row = [...root.querySelectorAll<HTMLElement>(".json-row")].find(
    (r) => r.getAttribute("data-path") === pathStr,
  );
  return row?.querySelector<HTMLElement>(".json-container") ?? null;
}

describe("JsonFileView collapse persistence", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  it("writes the collapsed paths through the store, debounced", () => {
    const store = makeStore();
    const v = makeView(store);
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    v.collapseAll();
    expect(store.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(store.set).toHaveBeenCalledWith("notes/a.json", ["root", "a"]);
  });

  it("flushes a pending write when the view unloads", () => {
    const store = makeStore();
    const v = makeView(store);
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    v.collapseAll();
    v.onunload();
    expect(store.set).toHaveBeenCalledWith("notes/a.json", ["root", "a"]);
  });

  it("restores the stored state instead of the depth default", () => {
    const store = makeStore();
    store.data.set("notes/a.json", ["a"]);
    const v = makeView(store);
    v.setViewData(JSON.stringify({ a: { b: 1 }, c: { d: 2 } }), false);
    expect(containerFor(v.contentEl, "a")?.classList.contains("is-collapsed")).toBe(true);
    expect(containerFor(v.contentEl, "c")?.classList.contains("is-collapsed")).toBe(false);
  });

  it("records a single toggle click too, not just the bulk commands", () => {
    const store = makeStore();
    const v = makeView(store);
    v.setViewData(JSON.stringify({ a: { b: 1 } }), false);
    const toggle = containerFor(v.contentEl, "a")?.querySelector<HTMLElement>(
      ".json-collapse-toggle",
    );
    toggle?.click();
    vi.advanceTimersByTime(1000);
    expect(store.set).toHaveBeenCalledWith("notes/a.json", ["a"]);
  });

  it("works without a store at all", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS });
    document.body.appendChild(v.contentEl);
    expect(() => v.setViewData(JSON.stringify({ a: { b: 1 } }), false)).not.toThrow();
  });
});
