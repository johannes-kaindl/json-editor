import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { renderJsonCodeblock } from "./obsidian/CodeblockProcessor";
import { JSON_VIEW_TYPE, JsonFileView } from "./obsidian/JsonFileView";
import {
  DEFAULT_SETTINGS,
  type JsonEditorSettings,
  JsonEditorSettingsTab,
} from "./obsidian/SettingsTab";
import { mergeSettings } from "./vendor/kit/settings";

export default class JsonEditorPlugin extends Plugin {
  settings: JsonEditorSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    this.settings = mergeSettings(DEFAULT_SETTINGS, await this.loadData());

    this.registerView(
      JSON_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new JsonFileView(leaf, this.settings),
    );

    this.registerMarkdownCodeBlockProcessor("json", (src, el, ctx) =>
      renderJsonCodeblock(src, el, ctx, this.settings, "json"),
    );

    this.registerMarkdownCodeBlockProcessor("jsonc", (src, el, ctx) =>
      renderJsonCodeblock(src, el, ctx, this.settings, "jsonc"),
    );

    this.addSettingTab(new JsonEditorSettingsTab(this.app, this));

    this.addCommand({
      id: "focus-search",
      name: "Focus search",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view) return false;
        if (!checking) view.focusSearch();
        return true;
      },
    });

    this.addCommand({
      id: "undo-edit",
      name: "Undo edit",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view || !view.canUndo()) return false;
        if (!checking) view.undo();
        return true;
      },
    });

    this.addCommand({
      id: "redo-edit",
      name: "Redo edit",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view || !view.canRedo()) return false;
        if (!checking) view.redo();
        return true;
      },
    });

    this.addCommand({
      id: "toggle-tree-source",
      name: "Toggle tree/source view",
      // No default *command* hotkey (those are global and would shadow the core
      // "Toggle reading view"). Mod+E is instead handled by the view-local Scope
      // in JsonFileView (active only in JSON views, so it never overrides the
      // core binding elsewhere). This command stays for the palette + custom rebinding.
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view) return false;
        if (!checking) view.toggleMode();
        return true;
      },
    });

    // Claim the .json file extension LAST and guard it: registerExtensions
    // throws hard if another plugin already handles .json. An uncaught throw
    // would abort onload and take down everything registered above, so we
    // degrade gracefully — the view + code-block rendering keep working.
    try {
      this.registerExtensions(["json"], JSON_VIEW_TYPE);
    } catch {
      new Notice(
        "JSON Editor: another plugin already handles .json — file view disabled, code-block rendering still active.",
      );
    }
    // Separate try/catch so a .jsonc collision doesn't skip the .json claim
    // (and vice versa) — each extension degrades independently.
    try {
      this.registerExtensions(["jsonc"], JSON_VIEW_TYPE);
    } catch {
      new Notice(
        "JSON Editor: another plugin already handles .jsonc — file view disabled, code-block rendering still active.",
      );
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
