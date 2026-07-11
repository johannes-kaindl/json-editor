import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { jsoncParse } from "../../src/core/jsonc";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

/** Give the view a `.jsonc` file so isJsonc routing engages. */
function asJsonc(v: JsonFileView): void {
  (v as unknown as { file: unknown }).file = {
    extension: "jsonc",
    basename: "x",
    path: "x.jsonc",
  };
}

/** Parse helper for assertions. */
function parsed(src: string): unknown {
  const r = jsoncParse(src);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.value;
}

/** Simulate one tree-mode string edit (same pattern as JsonFileView.undo.test.ts). */
function editFirstString(v: JsonFileView, newText: string): void {
  const value = v.contentEl.querySelector(".json-string") as HTMLElement;
  value.click();
  const input = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
  input.value = newText;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
}

describe("JsonFileView .jsonc routing (T6)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("parses .jsonc with comments without a parse error", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    asJsonc(v);
    v.setViewData(`{\n  // c\n  "a": 1\n}`, true);
    expect((v as unknown as { invalid: boolean }).invalid).toBe(false);
    expect((v as unknown as { currentValue: unknown }).currentValue).toEqual({ a: 1 });
  });

  it("still treats a comment in a .json file as invalid", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    // no asJsonc → default .json (strict)
    v.setViewData(`{\n  // c\n  "a": 1\n}`, true);
    expect((v as unknown as { invalid: boolean }).invalid).toBe(true);
  });
});

describe("JsonFileView .jsonc editing preserves comments (T7)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("edits a value in the tree, keeping comments, with working undo/redo", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    asJsonc(v);
    v.setViewData(`{\n  // keep\n  "a": "x"\n}`, true);

    editFirstString(v, "y");
    expect(v.getViewData()).toContain("// keep");
    expect(parsed(v.getViewData())).toEqual({ a: "y" });

    v.undo();
    expect(parsed(v.getViewData())).toEqual({ a: "x" });
    expect(v.getViewData()).toContain("// keep");

    v.redo();
    expect(parsed(v.getViewData())).toEqual({ a: "y" });
  });
});

describe("JsonFileView .jsonc round-trip (T10)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("open + save with no edit is byte-identical", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    asJsonc(v);
    const src = `{\n  // top\n  "a": 1, /* x */\n  "b": [1, 2,],\n}`;
    v.setViewData(src, true);
    expect(v.getViewData()).toBe(src);
  });
});

describe("JsonFileView .jsonc schema validation (T10)", () => {
  const VALIDATING = { ...DEFAULT_SETTINGS, validateAgainstSchema: true };
  const SCHEMA = `{ "type": "object", "properties": { "age": { "type": "integer" } } }`;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("validates the comment-stripped value: a bad type in a .jsonc is flagged", () => {
    const v = new JsonFileView(fakeLeaf(), VALIDATING);
    document.body.appendChild(v.contentEl);
    asJsonc(v);
    v.setViewData(`{\n  // a comment\n  "age": "old"\n}`, true);
    v.setSchema(SCHEMA);
    const banner = v.contentEl.querySelector(".json-schema-banner") as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.hidden).toBe(false); // "old" violates integer → error surfaced
  });
});
