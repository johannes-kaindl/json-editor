import { type App, PluginSettingTab, Setting } from "obsidian";
import type { Plugin } from "obsidian";

export interface JsonEditorSettings {
  defaultMode: "tree" | "source";
  indent: 2 | 4 | "\t";
  markerStyle: "modern" | "classic";
  autoCollapseDepth: number;
  validateAgainstSchema: boolean;
  companionSchemaSuffix: string;
}

/**
 * A companion-schema suffix must be a bare filename fragment, never a path:
 * no separators and no parent-dir traversal (audit 2.20). Kept lenient enough
 * to allow conventional forms like ".schema.json" and ".json-schema".
 */
export function isValidCompanionSuffix(suffix: string): boolean {
  return suffix.length > 0 && !/[/\\]/.test(suffix) && !suffix.includes("..");
}

export const DEFAULT_SETTINGS: JsonEditorSettings = {
  defaultMode: "tree",
  indent: 2,
  markerStyle: "modern",
  autoCollapseDepth: 2,
  validateAgainstSchema: false,
  companionSchemaSuffix: ".schema.json",
};

interface PluginWithSettings extends Plugin {
  settings: JsonEditorSettings;
  saveSettings(): Promise<void>;
}

export class JsonEditorSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private settingsPlugin: PluginWithSettings,
  ) {
    super(app, settingsPlugin);
  }

  display(): void {
    this.containerEl.replaceChildren();
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
          s.indent = v === "tab" ? "\t" : (Number.parseInt(v, 10) as 2 | 4);
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
      .setDesc("Nodes strictly deeper than this depth start collapsed. 0 = collapse all but root.")
      .addText((text) => {
        text.setValue(String(s.autoCollapseDepth));
        text.onChange(async (v) => {
          const n = Number.parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            s.autoCollapseDepth = n;
            await this.settingsPlugin.saveSettings();
          }
        });
      });

    new Setting(this.containerEl)
      .setName("Validate against JSON Schema")
      .setDesc(
        "Off by default. When enabled, the plugin automatically loads a sibling schema file next to the current .json file (e.g. data.json → data.schema.json) and highlights validation errors in real time. Enabling this auto-loads schema files from your vault — only turn it on if you trust those files.",
      )
      .addToggle((toggle) => {
        toggle.setValue(s.validateAgainstSchema);
        toggle.onChange(async (v) => {
          s.validateAgainstSchema = v;
          await this.settingsPlugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("Companion schema suffix")
      .setDesc(
        "Suffix used to find the sibling schema file. Default '.schema.json' resolves data.json → data.schema.json.",
      )
      .addText((text) => {
        text.setValue(s.companionSchemaSuffix);
        text.onChange(async (v) => {
          const trimmed = v.trim();
          if (isValidCompanionSuffix(trimmed)) {
            s.companionSchemaSuffix = trimmed;
            await this.settingsPlugin.saveSettings();
          }
        });
      });
  }
}
