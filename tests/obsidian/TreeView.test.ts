import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("emits onValueEdit with the path + new value when Enter is pressed on a text input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: unknown[] = [];
    const view = new TreeView(container, {
      onValueEdit: (path, newVal) => changes.push({ path, newVal }),
    });
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(changes).toEqual([{ path: ["name"], newVal: "sam" }]);
    expect(view.getValue()).toEqual({ name: "sam" });
  });

  it("cancels edit on Escape without firing onValueEdit", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: unknown[] = [];
    const view = new TreeView(container, {
      onValueEdit: (path, newVal) => changes.push({ path, newVal }),
    });
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

  it("calls opts.onPathClick when a row is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: Array<(string | number)[]> = [];
    const view = new TreeView(container, { onPathClick: (p) => calls.push(p) });
    view.setValue({ name: "jay" });
    const row = container.querySelector('.json-row[data-path="name"]') as HTMLElement;
    row.click();
    expect(calls).toEqual([["name"]]);
  });

  it("attaches a .json-copy-btn to every rendered row", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1, b: { c: 2 } });
    const rows = container.querySelectorAll(".json-row");
    rows.forEach((r) => {
      expect(r.querySelector(".json-copy-btn")).not.toBeNull();
    });
  });

  it("copy button on a nested row copies the nested value (not the root)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ users: [{ name: "jay" }] });
    const innerRow = container.querySelector('.json-row[data-path="users[0].name"]') as HTMLElement;
    const btn = innerRow.querySelector(".json-copy-btn") as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('"jay"');
  });

  it("scrollToPath finds a row by data-path and applies the flash class briefly", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ users: [{ name: "jay" }] });
    view.scrollToPath(["users", 0, "name"]);
    const row = container.querySelector('.json-row[data-path="users[0].name"]') as HTMLElement;
    expect(row.classList.contains("json-row-flash")).toBe(true);
  });

  it("scrollToPath is a no-op when no matching row exists", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1 });
    // Should not throw
    expect(() => view.scrollToPath(["nonexistent", "deeply", "nested"])).not.toThrow();
  });

  it("does not call opts.onValueHover while an inline edit input is focused", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: number[] = [];
    const view = new TreeView(container, { onValueHover: () => calls.push(1) });
    // Use two keys so one string remains in the DOM while the other is being edited.
    view.setValue({ name: "jay", tag: "admin" });
    const nameEl = container.querySelector(
      '.json-row[data-path="name"] .json-string',
    ) as HTMLElement;
    nameEl.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    input.focus();
    // 'tag' value is still rendered; hover it — must be suppressed by editing flag.
    const tagValue = container.querySelector(
      '.json-row[data-path="tag"] .json-string',
    ) as HTMLElement;
    expect(tagValue).not.toBeNull();
    tagValue.dispatchEvent(new MouseEvent("mouseenter"));
    expect(calls).toEqual([]);
  });

  it("parsePathStr round-trips for keys containing a bracket character", async () => {
    // Regression for C1: pathToString → data-path → parsePathStr (via copy
    // button) must yield the same path even when a key contains ']'.
    // CSS attribute selectors with `]` in the value are awkward; iterate manually.
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ "weird]key": "secret" });
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".json-row"));
    const row = rows.find((r) => r.getAttribute("data-path") === '["weird]key"]');
    expect(row).toBeDefined();
    const btn = row?.querySelector(".json-copy-btn") as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('"secret"');
  });

  it("calls onBeforeRender before each render", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: number[] = [];
    const view = new TreeView(container, { onBeforeRender: () => calls.push(1) });
    view.setValue({ a: 1 });
    view.setValue({ a: 2 });
    expect(calls).toEqual([1, 1]);
  });
});

describe("TreeView.applyFilter", () => {
  let container: HTMLElement;
  let tv: TreeView;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    tv = new TreeView(container, {});
    tv.setValue({
      config: { server: { port: 8080, host: "localhost" } },
      database: { connection: { port: 5432 } },
    });
  });

  it("empty query returns matchCount 0 and adds no filter classes", () => {
    const r = tv.applyFilter("");
    expect(r.matchCount).toBe(0);
    expect(container.querySelectorAll(".json-match").length).toBe(0);
    expect(
      container.querySelector(".json-tree-root")?.classList.contains("json-filter-active"),
    ).toBe(false);
  });

  it("non-empty query marks matching rows with json-match", () => {
    const r = tv.applyFilter("port");
    expect(r.matchCount).toBe(2);
    const matched = container.querySelectorAll(".json-match");
    const paths = Array.from(matched).map((el) => el.getAttribute("data-path"));
    expect(paths).toContain("config.server.port");
    expect(paths).toContain("database.connection.port");
  });

  it("marks ancestor rows with json-on-path", () => {
    tv.applyFilter("port");
    const onPath = Array.from(container.querySelectorAll(".json-on-path")).map((el) =>
      el.getAttribute("data-path"),
    );
    expect(onPath).toContain("config");
    expect(onPath).toContain("config.server");
    expect(onPath).toContain("database");
    expect(onPath).toContain("database.connection");
  });

  it("adds json-filter-active to the tree root", () => {
    tv.applyFilter("port");
    const root = container.querySelector(".json-tree-root")!;
    expect(root.classList.contains("json-filter-active")).toBe(true);
  });

  it("applyFilter('') after a non-empty query removes all filter classes", () => {
    tv.applyFilter("port");
    tv.applyFilter("");
    expect(container.querySelectorAll(".json-match").length).toBe(0);
    expect(container.querySelectorAll(".json-on-path").length).toBe(0);
    expect(
      container.querySelector(".json-tree-root")?.classList.contains("json-filter-active"),
    ).toBe(false);
  });

  it("returns matchCount 0 for non-empty query with no matches but still activates filter", () => {
    const r = tv.applyFilter("nonexistent_xyz_123");
    expect(r.matchCount).toBe(0);
    expect(
      container.querySelector(".json-tree-root")?.classList.contains("json-filter-active"),
    ).toBe(true);
  });

  it("auto-expands auto-collapsed containers that contain a match", () => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    tv = new TreeView(container, { autoCollapseDepth: 0 });
    tv.setValue({ outer: { inner: { needle: 1 } } });

    // Sanity-check: at least one container is collapsed before the filter applies
    const collapsedBefore = container.querySelectorAll(".json-container.is-collapsed");
    expect(collapsedBefore.length).toBeGreaterThan(0);

    tv.applyFilter("needle");

    // After filter: all on-path containers should be open
    const stillCollapsed = container.querySelectorAll(
      ".json-on-path .json-container.is-collapsed, .json-match .json-container.is-collapsed",
    );
    expect(stillCollapsed.length).toBe(0);
  });
});
