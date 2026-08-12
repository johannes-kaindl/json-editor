import { type App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type { Plugin } from "obsidian";
import { type SettingControlHost, renderSettingDefinitions } from "../vendor/kit/settings_walker";

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

/**
 * Settings are declared once, as data, and consumed twice: Obsidian >= 1.13 reads
 * `getSettingDefinitions()` directly (which is what makes them appear in settings
 * search), while older versions call `display()`, where the shared walker draws
 * the same declaration with the classic Setting API. One source, two paths — the
 * kit pattern lifted from nine independent copies across the plugin family.
 */
export class JsonEditorSettingsTab extends PluginSettingTab implements SettingControlHost {
  constructor(
    app: App,
    private settingsPlugin: PluginWithSettings,
  ) {
    super(app, settingsPlugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Default mode",
        desc: "Which view opens by default when a .json file is opened.",
        control: {
          type: "dropdown",
          key: "defaultMode",
          options: { tree: "Tree", source: "Source" },
        },
      },
      {
        name: "Indent",
        desc: "Spaces or tab used when serializing JSON from tree edits.",
        control: {
          type: "dropdown",
          key: "indent",
          options: { "2": "Two spaces", "4": "Four spaces", tab: "Tab" },
        },
      },
      {
        name: "Tree marker style",
        desc: "Visual style of the tree: modern (no markers) or classic (┐├┘).",
        control: {
          type: "dropdown",
          key: "markerStyle",
          options: { modern: "Modern (clean indent)", classic: "Classic (┐├┘)" },
        },
      },
      {
        name: "Auto-collapse depth",
        desc: "Nodes strictly deeper than this depth start collapsed. 0 = collapse all but root.",
        control: { type: "text", key: "autoCollapseDepth" },
      },
      {
        name: "Validate against JSON schema",
        desc: "Off by default. When enabled, the plugin automatically loads a sibling schema file next to the current .json file (e.g. data.json → data.schema.json) and highlights validation errors in real time. Enabling this auto-loads schema files from your vault — only turn it on if you trust those files.",
        control: { type: "toggle", key: "validateAgainstSchema" },
      },
      {
        name: "Companion schema suffix",
        desc: "Suffix used to find the sibling schema file. Default '.schema.json' resolves data.json → data.schema.json.",
        control: { type: "text", key: "companionSchemaSuffix" },
      },
    ] as SettingDefinitionItem[];
  }

  /** Fallback path for Obsidian < 1.13, drawing the same declaration. */
  display(): void {
    this.containerEl.replaceChildren();
    renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  getControlValue(key: string): unknown {
    const s = this.settingsPlugin.settings;
    switch (key) {
      case "defaultMode":
        return s.defaultMode;
      // The control speaks "tab"; the setting stores an actual tab character.
      case "indent":
        return s.indent === "\t" ? "tab" : String(s.indent);
      case "markerStyle":
        return s.markerStyle;
      case "autoCollapseDepth":
        return String(s.autoCollapseDepth);
      case "validateAgainstSchema":
        return s.validateAgainstSchema;
      case "companionSchemaSuffix":
        return s.companionSchemaSuffix;
      default:
        return undefined;
    }
  }

  /**
   * Invalid input is dropped rather than stored — a negative depth or a suffix
   * containing a path separator would be applied to every file that opens
   * afterwards, so the setting keeps its previous value instead.
   */
  setControlValue(key: string, value: unknown): void {
    const s = this.settingsPlugin.settings;
    switch (key) {
      case "defaultMode":
        s.defaultMode = value as "tree" | "source";
        break;
      case "indent":
        s.indent = value === "tab" ? "\t" : (Number.parseInt(String(value), 10) as 2 | 4);
        break;
      case "markerStyle":
        s.markerStyle = value as "modern" | "classic";
        break;
      case "autoCollapseDepth": {
        const n = Number.parseInt(String(value), 10);
        if (!Number.isFinite(n) || n < 0) return;
        s.autoCollapseDepth = n;
        break;
      }
      case "validateAgainstSchema":
        s.validateAgainstSchema = Boolean(value);
        break;
      case "companionSchemaSuffix": {
        const trimmed = String(value).trim();
        if (!isValidCompanionSuffix(trimmed)) return;
        s.companionSchemaSuffix = trimmed;
        break;
      }
      default:
        return;
    }
    void this.settingsPlugin.saveSettings();
  }
}
