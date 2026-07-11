import { beforeEach, describe, expect, it } from "vitest";
import { renderJsonCodeblock } from "../../src/obsidian/CodeblockProcessor";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

describe("renderJsonCodeblock — jsonc (T9)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a read-only tree for a commented jsonc block; label reads JSONC", () => {
    const el = document.createElement("div");
    renderJsonCodeblock(`{\n  // note\n  "a": 1\n}`, el, {} as never, DEFAULT_SETTINGS, "jsonc");
    expect(el.querySelector(".json-codeblock-label")?.textContent).toBe("JSONC");
    expect(el.querySelector(".json-row")).toBeTruthy();
  });

  it("shows an error card for structurally broken jsonc", () => {
    const el = document.createElement("div");
    renderJsonCodeblock(`{ "a": }`, el, {} as never, DEFAULT_SETTINGS, "jsonc");
    expect(el.querySelector(".json-codeblock.is-error")).toBeTruthy();
    expect(el.querySelector(".json-codeblock-label")?.textContent).toBe("JSONC · error");
  });

  it("a comment in a plain json block is still an error (strict)", () => {
    const el = document.createElement("div");
    renderJsonCodeblock(`{ // c\n "a": 1 }`, el, {} as never, DEFAULT_SETTINGS, "json");
    expect(el.querySelector(".json-codeblock.is-error")).toBeTruthy();
  });
});
