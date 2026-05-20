import { Plugin, type WorkspaceLeaf } from "obsidian";
import { JsonFileView, JSON_VIEW_TYPE } from "./obsidian/JsonFileView";
import { renderJsonCodeblock } from "./obsidian/CodeblockProcessor";
import {
  DEFAULT_SETTINGS,
  JsonEditorSettingsTab,
  type JsonEditorSettings,
} from "./obsidian/SettingsTab";

export default class JsonEditorPlugin extends Plugin {
  settings: JsonEditorSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    const stored = (await this.loadData()) as Partial<JsonEditorSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };

    this.registerView(JSON_VIEW_TYPE, (leaf: WorkspaceLeaf) => new JsonFileView(leaf, this.settings));
    this.registerExtensions(["json"], JSON_VIEW_TYPE);

    this.registerMarkdownCodeBlockProcessor("json", (src, el, ctx) =>
      renderJsonCodeblock(src, el, ctx, this.settings)
    );

    this.addSettingTab(new JsonEditorSettingsTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
