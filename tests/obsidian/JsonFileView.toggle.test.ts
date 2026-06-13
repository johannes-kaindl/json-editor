// Audit 3.1: the headline Tree↔Source toggle was mouse-only — no public method
// to bind a command to, and no view-header action. Add a public toggleMode()
// and an addAction icon in onOpen.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;
const actionsOf = (v: JsonFileView) => (v as unknown as { actionsEl: HTMLElement }).actionsEl;

describe("JsonFileView Tree↔Source toggle (audit 3.1)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("toggleMode() flips between tree and source", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS); // defaultMode 'tree'
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();

    v.toggleMode();
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();

    v.toggleMode();
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();
  });

  it("toggleMode() is a no-op on invalid JSON (cannot enter tree)", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("{not valid}", true); // forced source
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
    v.toggleMode(); // tree is unavailable → stays source
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
  });

  it("onOpen adds a view-header action that toggles the mode", async () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);
    await v.onOpen();

    const action = actionsOf(v).querySelector("button");
    expect(action).not.toBeNull();
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();

    action?.click();
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull(); // toggled to source
  });
});
