// Blocker 1.4: when a file contains numbers JSON cannot round-trip, warn the
// user and open the tree read-only so a tree edit cannot silently rewrite the
// untouched lossy numbers. Source mode stays editable.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;
const saveCountOf = (v: JsonFileView) => (v as unknown as { saveCount: number }).saveCount;

describe("JsonFileView lossy-number handling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the lossy warn banner (not a parse error) when a number loses precision", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"id":9007199254740993,"name":"x"}', false);

    const lossy = v.contentEl.querySelector(".json-lossy-banner") as HTMLElement;
    expect(lossy).not.toBeNull();
    expect(lossy.hidden).toBe(false);
    expect(v.contentEl.querySelector(".json-error-banner")).toBeNull();
  });

  it("does not show the warn banner for faithful numbers", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1,"name":"x"}', false);

    const lossy = v.contentEl.querySelector(".json-lossy-banner") as HTMLElement;
    expect(lossy.hidden).toBe(true);
  });

  it("renders the tree read-only on a lossy file: clicking a value opens no editor and saves nothing", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"id":9007199254740993,"name":"x"}', false);

    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull(); // tree, not source
    const before = saveCountOf(v);
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    expect(v.contentEl.querySelector(".json-inline-edit")).toBeNull(); // read-only: no editor
    expect(saveCountOf(v)).toBe(before); // nothing persisted
  });

  it("recomputes lossy state on a source-mode edit (fixing the number clears the warning)", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"id":9007199254740993}', false);
    const lossy = v.contentEl.querySelector(".json-lossy-banner") as HTMLElement;
    expect(lossy.hidden).toBe(false);

    // Simulate a source-mode edit that turns the lossy int into a string.
    (v as unknown as { handleSourceChange(t: string): void }).handleSourceChange(
      '{"id":"9007199254740993"}',
    );
    expect(lossy.hidden).toBe(true);
  });

  it("clears the warn banner when navigating to a faithful file", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"id":9007199254740993}', true);
    const lossy = v.contentEl.querySelector(".json-lossy-banner") as HTMLElement;
    expect(lossy.hidden).toBe(false);

    v.setViewData('{"ok":1}', true);
    expect(lossy.hidden).toBe(true);
  });
});
