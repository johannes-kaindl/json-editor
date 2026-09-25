import type { MarkdownPostProcessorContext } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderJsonCodeblock } from "../../src/obsidian/CodeblockProcessor";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const ctx = { sourcePath: "n.md", getSectionInfo: () => null } as MarkdownPostProcessorContext;
const host = (): HTMLElement => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

describe("repair button in the error card", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is absent without a handler (no LLM wiring, nothing to click)", () => {
    const el = host();
    renderJsonCodeblock("{oops", el, ctx, DEFAULT_SETTINGS);
    expect(el.querySelector(".json-codeblock-repair")).toBeNull();
  });

  it("sits in the title row, with wrench icon, label and tooltip", () => {
    const el = host();
    renderJsonCodeblock("{oops", el, ctx, DEFAULT_SETTINGS, "json", () => {});
    const btn = el.querySelector(
      ".json-codeblock-head .json-codeblock-repair",
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.querySelector("[data-icon='wrench']")).not.toBeNull();
    expect(btn.textContent).toBe("Repair");
    expect(btn.getAttribute("aria-label")).toMatch(/LLM/);
  });

  it("hands source, parser error and language to the handler on click", () => {
    const el = host();
    const onRepair = vi.fn();
    renderJsonCodeblock('{"a": }', el, ctx, DEFAULT_SETTINGS, "jsonc", onRepair);
    (el.querySelector(".json-codeblock-repair") as HTMLButtonElement).click();
    expect(onRepair).toHaveBeenCalledWith(
      expect.objectContaining({ source: '{"a": }', lang: "jsonc", el }),
    );
    expect(onRepair.mock.calls[0]?.[0].errorMessage).toEqual(expect.any(String));
  });

  it("valid blocks get no repair button even with a handler", () => {
    const el = host();
    renderJsonCodeblock('{"a": 1}', el, ctx, DEFAULT_SETTINGS, "json", () => {});
    expect(el.querySelector(".json-codeblock-repair")).toBeNull();
  });
});
