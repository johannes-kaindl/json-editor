import { App, PluginSettingTab, Setting } from "obsidian";
import type { Plugin } from "obsidian";

export interface JsonEditorSettings {
  defaultMode: "tree" | "source";
  indent: 2 | 4 | "\t";
  markerStyle: "modern" | "classic";
  autoCollapseDepth: number;
}

export const DEFAULT_SETTINGS: JsonEditorSettings = {
  defaultMode: "tree",
  indent: 2,
  markerStyle: "modern",
  autoCollapseDepth: 2,
};

interface PluginWithSettings extends Plugin {
  settings: JsonEditorSettings;
  saveSettings(): Promise<void>;
}

export class JsonEditorSettingsTab extends PluginSettingTab {
  constructor(app: App, private settingsPlugin: PluginWithSettings) {
    super(app, settingsPlugin);
  }

  display(): void {
    this.containerEl.innerHTML = "";
    const s = this.settingsPlugin.settings;

    new Setting(this.containerEl)
      .setName("Default mode")
      .setDesc("Which view opens by default when a .json file is opened.")
      .addDropdown((dd) => {
        dd.addOption("tree", "Tree");
        dd.addOption("source", "Source");
        dd.setValue(s.defaultMode);
        dd.onChange(async (v) => {
          s.defaultMode = v as "tree" | "source";
          await this.settingsPlugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("Indent")
      .setDesc("Spaces or tab used when serializing JSON from Tree edits.")
      .addDropdown((dd) => {
        dd.addOption("2", "2 spaces");
        dd.addOption("4", "4 spaces");
        dd.addOption("tab", "Tab");
        dd.setValue(s.indent === "\t" ? "tab" : String(s.indent));
        dd.onChange(async (v) => {
          s.indent = v === "tab" ? "\t" : (parseInt(v, 10) as 2 | 4);
          await this.settingsPlugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("Tree marker style")
      .setDesc("Visual style of the tree: modern (no markers) or classic (┐├┘).")
      .addDropdown((dd) => {
        dd.addOption("modern", "Modern (clean indent)");
        dd.addOption("classic", "Classic (┐├┘)");
        dd.setValue(s.markerStyle);
        dd.onChange(async (v) => {
          s.markerStyle = v as "modern" | "classic";
          await this.settingsPlugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("Auto-collapse depth")
      .setDesc(
        "Nodes strictly deeper than this depth start collapsed. 0 = collapse all but root."
      )
      .addText((text) => {
        text.setValue(String(s.autoCollapseDepth));
        text.onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            s.autoCollapseDepth = n;
            await this.settingsPlugin.saveSettings();
          }
        });
      });
  }
}
