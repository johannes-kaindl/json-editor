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
});
