import { describe, it, expect, beforeEach } from "vitest";
import { renderJsonCodeblock } from "../../src/obsidian/CodeblockProcessor";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { MarkdownPostProcessorContext } from "obsidian";

const fakeCtx = (): MarkdownPostProcessorContext => ({
  sourcePath: "fake/path.md",
  getSectionInfo: () => null,
});

describe("renderJsonCodeblock", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a tree for valid JSON", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock('{"a": 1}', el, fakeCtx(), DEFAULT_SETTINGS);
    expect(el.querySelector(".json-tree-root")).not.toBeNull();
  });

  it("does not bind value-click handlers (read-only)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock('{"name": "jay"}', el, fakeCtx(), DEFAULT_SETTINGS);
    const value = el.querySelector(".json-string") as HTMLElement;
    value.click();
    expect(el.querySelector("input")).toBeNull();
  });

  it("falls back to a default code-block render with an indicator on parse error", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock("{not valid}", el, fakeCtx(), DEFAULT_SETTINGS);
    expect(el.querySelector(".json-tree-root")).toBeNull();
    expect(el.querySelector(".json-codeblock-fallback")).not.toBeNull();
    expect(el.querySelector(".json-codeblock-error-indicator")).not.toBeNull();
    expect(el.textContent).toContain("{not valid}");
  });

  it("renders empty object {} as an empty tree", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock("{}", el, fakeCtx(), DEFAULT_SETTINGS);
    expect(el.querySelector(".json-tree-root")).not.toBeNull();
    expect(el.querySelector(".json-bracket")?.textContent).toBe("{}");
  });

  it("wraps valid JSON in a .json-codeblock card with a header label", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock('{"a": 1}', el, fakeCtx(), DEFAULT_SETTINGS);
    const card = el.querySelector(".json-codeblock");
    expect(card).not.toBeNull();
    expect(card?.querySelector(".json-codeblock-head")).not.toBeNull();
    expect(card?.querySelector(".json-codeblock-copy")).not.toBeNull();
    expect(card?.querySelector(".json-tree-root")).not.toBeNull();
  });

  it("starts blocks longer than 20 lines collapsed", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const obj: Record<string, number> = {};
    for (let i = 0; i < 25; i++) obj[`k${i}`] = i;
    const source = JSON.stringify(obj, null, 2); // 27 lines
    renderJsonCodeblock(source, el, fakeCtx(), DEFAULT_SETTINGS);
    expect(el.querySelector(".json-content.collapsed")).not.toBeNull();
  });

  it("keeps short blocks expanded", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock('{"a": {"b": 1}}', el, fakeCtx(), DEFAULT_SETTINGS);
    const root = el.querySelector(".json-tree-root > .json-container") as HTMLElement;
    expect(root.classList.contains("is-collapsed")).toBe(false);
  });
});
