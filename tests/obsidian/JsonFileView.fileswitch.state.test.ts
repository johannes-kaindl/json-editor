// Blocker 2.8 (bundled with 1.2): per-file state — currentSchema, search query,
// and a parse-error-forced source mode — must NOT survive a file switch / leaf
// reuse. These describe the correct behavior and fail against current code.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

// validateAgainstSchema is forced on here because this suite exercises schema
// state directly via setSchema(); the autoload default is opt-out (blocker 1.3).
const SCHEMA_SETTINGS = { ...DEFAULT_SETTINGS, validateAgainstSchema: true };

const PERSON_SCHEMA = `{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer" }
  },
  "required": ["name"]
}`;

describe("REPRO: per-file state must reset on file switch (leaf reuse)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("currentSchema does not validate the next file after a switch", () => {
    const v = new JsonFileView(fakeLeaf(), SCHEMA_SETTINGS);
    document.body.appendChild(v.contentEl);

    // File A: load + attach a schema that flags it.
    v.setViewData('{"age":"old"}', true);
    v.setSchema(PERSON_SCHEMA);
    const banner = v.contentEl.querySelector(".json-schema-banner") as HTMLElement;
    expect(banner.hidden).toBe(false); // schema active on file A

    // Leaf reuse for file B (no companion schema).
    v.clear();
    v.setViewData('{"x":1}', true);

    expect(banner.hidden).toBe(true); // schema must be gone
    expect(v.contentEl.querySelector(".json-row.json-row-error")).toBeNull();
  });

  it("forced source mode (invalid file) does not stick to the next valid file", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS); // defaultMode "tree"
    document.body.appendChild(v.contentEl);

    v.setViewData("{not valid}", true);
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull(); // forced source

    v.setViewData('{"a":1}', true);
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();
    expect(v.contentEl.querySelector(".cm-editor")).toBeNull(); // back to defaultMode
  });

  it("search query does not carry over to the next file", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);

    v.setViewData('{"port":8080}', true);
    const input = v.contentEl.querySelector(".json-search-input") as HTMLInputElement;
    input.value = "port";
    input.dispatchEvent(new Event("input"));
    expect(v.contentEl.querySelector(".json-match")).not.toBeNull();

    v.clear();
    v.setViewData('{"host":"x"}', true);

    const input2 = v.contentEl.querySelector(".json-search-input") as HTMLInputElement;
    expect(input2.value).toBe("");
    expect(v.contentEl.querySelector(".json-match")).toBeNull();
    const count = v.contentEl.querySelector(".json-search-count") as HTMLElement;
    expect(count.hidden).toBe(true);
  });

  it("internal undo/redo (clear=false) does NOT reset history", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);

    v.setViewData('{"name":"fileA"}', true);
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const edit = v.contentEl.querySelector(".json-inline-edit") as HTMLInputElement;
    edit.value = "edited";
    edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(v.canUndo()).toBe(true);

    v.undo(); // restoreText -> setViewData(text, false): must keep the redo entry
    expect(v.canRedo()).toBe(true);
  });
});
