import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { renderJsonCodeblock } from "./obsidian/CodeblockProcessor";
import { JSON_VIEW_TYPE, JsonFileView } from "./obsidian/JsonFileView";
import {
  DEFAULT_SETTINGS,
  type JsonEditorSettings,
  JsonEditorSettingsTab,
} from "./obsidian/SettingsTab";

export default class JsonEditorPlugin extends Plugin {
  settings: JsonEditorSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    const stored = (await this.loadData()) as Partial<JsonEditorSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };

    this.registerView(
      JSON_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new JsonFileView(leaf, this.settings),
    );

    this.registerMarkdownCodeBlockProcessor("json", (src, el, ctx) =>
      renderJsonCodeblock(src, el, ctx, this.settings),
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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
