import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as unknown as WorkspaceLeaf;
const DOC = { top: 1, cfg: { net: { host: "h", ports: [1, 2] }, name: "n" }, tail: [0] };

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
  (v as unknown as { file: unknown }).file = { extension: "json", basename: "a", path: "n/a.json" };
  v.setViewData(JSON.stringify(DOC), false);
  return v;
}

const rows = (v: JsonFileView): string[] =>
  [...v.contentEl.querySelectorAll(".json-row")].map((r) => r.getAttribute("data-path") ?? "");
const row = (v: JsonFileView, p: string): HTMLElement =>
  v.contentEl.querySelector<HTMLElement>(`.json-row[data-path="${p}"]`) as HTMLElement;
const own = (el: HTMLElement, cls: string): HTMLElement | undefined =>
  [...el.children].find((c) => c.classList.contains(cls)) as HTMLElement | undefined;
const seg = (v: JsonFileView, label: string): HTMLButtonElement | undefined =>
  [...v.contentEl.querySelectorAll<HTMLButtonElement>(".bc-seg")].find(
    (b) => b.textContent === label,
  );

describe("JsonFileView focus on a branch", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  it("the focus button of a container row shows that branch as the root", () => {
    const v = makeView();
    // The row's own actions are its direct child; nested rows carry their own buttons.
    own(row(v, "cfg"), "json-row-actions")
      ?.querySelector<HTMLButtonElement>(".json-row-focus")
      ?.click();
    expect(rows(v)).toEqual([
      "cfg.net",
      "cfg.net.host",
      "cfg.net.ports",
      "cfg.net.ports[0]",
      "cfg.net.ports[1]",
      "cfg.name",
    ]);
    expect(v.contentEl.querySelector(".bc-seg-focus-root")?.textContent).toBe("cfg");
  });

  it("scalar rows have no focus button", () => {
    const v = makeView();
    expect(row(v, "top").querySelector(".json-row-focus")).toBeNull();
  });

  it("'root' in the breadcrumb returns to the whole file", () => {
    const v = makeView();
    v.focusOn(["cfg"]);
    seg(v, "root")?.click();
    expect(rows(v)).toContain("top");
    expect(rows(v)).toContain("tail[0]");
    expect(v.contentEl.querySelector(".bc-seg-outside, .bc-seg-focus-root")).toBeNull();
  });

  it("an ancestor segment widens the focus to that branch", () => {
    const v = makeView();
    v.focusOn(["cfg", "net"]);
    expect(rows(v)).not.toContain("cfg.name");
    seg(v, "cfg")?.click();
    expect(rows(v)).toContain("cfg.name");
    expect(rows(v)).not.toContain("top");
    expect(v.contentEl.querySelector(".bc-seg-focus-root")?.textContent).toBe("cfg");
  });

  it("the breadcrumb offers 'Show as root' for a container, not for a scalar or the current root", () => {
    const v = makeView();
    row(v, "top").click();
    expect(v.contentEl.querySelector(".bc-focus-btn")).toBeNull();
    row(v, "cfg").click();
    expect(v.contentEl.querySelector(".bc-focus-btn")).not.toBeNull();
    v.contentEl.querySelector<HTMLButtonElement>(".bc-focus-btn")?.click();
    expect(rows(v)[0]).toBe("cfg.net");
    expect(v.contentEl.querySelector(".bc-focus-btn")).toBeNull();
  });

  it("an edit inside the focused branch keeps the focus", () => {
    const v = makeView();
    v.focusOn(["cfg"]);
    row(v, "cfg.net.host").querySelector<HTMLButtonElement>(".json-row-delete")?.click();
    expect(rows(v)).not.toContain("cfg.net.host");
    expect(rows(v)).toContain("cfg.name");
    expect(rows(v)).not.toContain("top");
    expect(v.contentEl.querySelector(".bc-seg-focus-root")?.textContent).toBe("cfg");
  });

  it("falls back to the whole file, breadcrumb included, when the focused branch is gone", () => {
    const v = makeView();
    v.focusOn(["cfg"]);
    v.setViewData(JSON.stringify({ top: 1 }), false);
    expect(rows(v)).toEqual(["top"]);
    expect(v.contentEl.querySelector(".bc-seg-outside, .bc-seg-focus-root")).toBeNull();
  });

  it("another file starts unfocused", () => {
    const v = makeView();
    v.focusOn(["cfg"]);
    v.setViewData(JSON.stringify(DOC), true);
    expect(rows(v)).toContain("top");
    expect(v.contentEl.querySelector(".bc-seg-outside, .bc-seg-focus-root")).toBeNull();
  });

  it("the focused view does not overwrite the remembered collapse state of the file", () => {
    const store = makeStore();
    store.data.set("n/a.json", ["cfg.net"]);
    const v = makeView(store);
    v.focusOn(["cfg", "net"]);
    store.set.mockClear();
    v.collapseAll();
    vi.advanceTimersByTime(1500);
    v.onunload();
    expect(store.set).not.toHaveBeenCalled();
    expect(store.data.get("n/a.json")).toEqual(["cfg.net"]);
  });

  it("leaving the focus brings the remembered collapse state of the whole file back", () => {
    const store = makeStore();
    store.data.set("n/a.json", ["cfg.net"]);
    const v = makeView(store);
    v.focusOn(["cfg"]);
    v.expandAll();
    v.clearFocus();
    const netRow = row(v, "cfg.net");
    expect(own(netRow, "json-container")?.classList.contains("is-collapsed")).toBe(true);
  });

  it("the collapse toggle button works relative to the focused root", () => {
    const v = makeView();
    v.focusOn(["cfg"]);
    const btn = v.contentEl.querySelector<HTMLButtonElement>(".json-collapse-toggle-btn");
    btn?.click();
    const cs = [...v.contentEl.querySelectorAll<HTMLElement>(".json-container")];
    expect(cs.find((c) => c.dataset.depth === "0")?.classList.contains("is-collapsed")).toBe(false);
    expect(
      cs.filter((c) => c.dataset.depth !== "0").every((c) => c.classList.contains("is-collapsed")),
    ).toBe(true);
  });
});
