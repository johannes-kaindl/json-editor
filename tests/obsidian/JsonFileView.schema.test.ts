import { describe, it, expect, beforeEach } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { WorkspaceLeaf } from "obsidian";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} } as WorkspaceLeaf);

const PERSON_SCHEMA = `{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer" }
  },
  "required": ["name"]
}`;

describe("JsonFileView schema validation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("setSchema accepts a valid schema text and stores it without errors banner", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"Jay","age":35}', false);
    v.setSchema(PERSON_SCHEMA);
    const banner = v.contentEl.querySelector(".json-schema-banner") as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.hidden).toBe(true);
  });

  it("setSchema with invalid value triggers banner with error count", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"age":"old"}', false);
    v.setSchema(PERSON_SCHEMA);
    const banner = v.contentEl.querySelector(".json-schema-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toMatch(/2 schema errors|2 errors/);
  });

  it("setSchema marks the offending row with .json-row-error", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"Jay","age":"old"}', false);
    v.setSchema(PERSON_SCHEMA);
    const row = v.contentEl.querySelector<HTMLElement>(
      '.json-row[data-path="age"].json-row-error'
    );
    expect(row).not.toBeNull();
    expect(row?.getAttribute("title")?.toLowerCase()).toMatch(/integer|type/);
  });

  it("editing a value to fix the error clears the banner", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"Jay","age":"old"}', false);
    v.setSchema(PERSON_SCHEMA);
    const banner = v.contentEl.querySelector(".json-schema-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);
    // Edit "old" → 30
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    // age is at index 1 in obj — find by path
    const ageRow = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="age"]')!;
    const ageValueEl = ageRow.querySelector<HTMLElement>(".json-string")!;
    ageValueEl.click();
    // Now we need the input to take a number — but the value was a string, so input type = text.
    // Instead, directly set new data via setViewData (simulates correction)
    v.setViewData('{"name":"Jay","age":30}', false);
    expect(banner.hidden).toBe(true);
  });

  it("setSchema with malformed schema text shows parse-error variant", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"Jay"}', false);
    v.setSchema("{not json}");
    const banner = v.contentEl.querySelector(".json-schema-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);
    expect(banner.classList.contains("is-schema-parse-error")).toBe(true);
    expect(banner.textContent?.toLowerCase()).toMatch(/schema/);
  });

  it("validateAgainstSchema:false disables validation", () => {
    const settings = { ...DEFAULT_SETTINGS, validateAgainstSchema: false };
    const v = new JsonFileView(fakeLeaf(), settings);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"age":"old"}', false);
    v.setSchema(PERSON_SCHEMA);
    const banner = v.contentEl.querySelector(".json-schema-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);
  });
});
