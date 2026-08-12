// Obsidian >= 1.13 reads getSettingDefinitions() to make settings searchable;
// older versions call display(). Both must describe the SAME six settings, which
// is why the definitions are the single source and display() just walks them.

import { type App, Plugin } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, JsonEditorSettingsTab } from "../../src/obsidian/SettingsTab";

class FakePlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function keysOf(items: unknown[]): string[] {
  return items.map((i) => (i as { control?: { key?: string } }).control?.key ?? "");
}

describe("declarative setting definitions", () => {
  let plugin: FakePlugin;
  let tab: JsonEditorSettingsTab;

  beforeEach(() => {
    const app = {} as App;
    plugin = new FakePlugin(app, { id: "x", name: "x", version: "0.1.0" });
    tab = new JsonEditorSettingsTab(app, plugin);
  });

  it("exposes every setting, so none is missing from settings search", () => {
    const keys = keysOf(tab.getSettingDefinitions());
    expect(keys.sort()).toEqual(
      [
        "autoCollapseDepth",
        "companionSchemaSuffix",
        "defaultMode",
        "indent",
        "markerStyle",
        "validateAgainstSchema",
      ].sort(),
    );
  });

  it("reads the current value for each key", () => {
    plugin.settings.markerStyle = "classic";
    expect(tab.getControlValue("markerStyle")).toBe("classic");
    expect(tab.getControlValue("validateAgainstSchema")).toBe(false);
  });

  it("represents a tab indent as the string 'tab', not a raw \\t", () => {
    plugin.settings.indent = "\t";
    expect(tab.getControlValue("indent")).toBe("tab");
    tab.setControlValue("indent", "4");
    expect(plugin.settings.indent).toBe(4);
    tab.setControlValue("indent", "tab");
    expect(plugin.settings.indent).toBe("\t");
  });

  it("rejects a negative auto-collapse depth instead of storing it", () => {
    tab.setControlValue("autoCollapseDepth", "-3");
    expect(plugin.settings.autoCollapseDepth).toBe(DEFAULT_SETTINGS.autoCollapseDepth);
    tab.setControlValue("autoCollapseDepth", "5");
    expect(plugin.settings.autoCollapseDepth).toBe(5);
  });

  it("rejects a companion suffix containing a path separator", () => {
    tab.setControlValue("companionSchemaSuffix", "../evil.json");
    expect(plugin.settings.companionSchemaSuffix).toBe(DEFAULT_SETTINGS.companionSchemaSuffix);
    tab.setControlValue("companionSchemaSuffix", ".s.json");
    expect(plugin.settings.companionSchemaSuffix).toBe(".s.json");
  });
});
