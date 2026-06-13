// Audit 2.12: SourceView was never destroyed on unload (CodeMirror leaks
// observers/window listeners), and the TypeMenu module-singleton listeners
// survived onunload. onunload must tear both down; closeActiveMenu must be
// callable from outside the module.

import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import { closeActiveMenu, openTypeMenu } from "../../src/obsidian/TypeMenu";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

describe("JsonFileView / TypeMenu lifecycle (2.12)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("onunload destroys the source view", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', true);
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();

    v.onunload();

    expect((v as unknown as { sourceView: unknown }).sourceView).toBeNull();
  });

  it("closeActiveMenu (exported) closes an open type menu", () => {
    const anchor = document.createElement("div");
    anchor.className = "json-row";
    document.body.appendChild(anchor);
    openTypeMenu(anchor, { currentType: "string", onPick: () => {} });
    expect(document.querySelector(".json-type-menu")).not.toBeNull();

    closeActiveMenu();

    expect(document.querySelector(".json-type-menu")).toBeNull();
  });
});
