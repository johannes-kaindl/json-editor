import { describe, it, expect, beforeEach } from "vitest";
import { Plugin, type App } from "obsidian";
import { JsonEditorSettingsTab, DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

class FakePlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  async saveSettings() { await this.saveData(this.settings); }
}

describe("JsonEditorSettingsTab", () => {
  let app: App;
  let plugin: FakePlugin;
  let tab: JsonEditorSettingsTab;

  beforeEach(() => {
    app = {} as App;
    plugin = new FakePlugin(app, { id: "x", name: "x", version: "0.1.0" });
    tab = new JsonEditorSettingsTab(app, plugin);
  });

  it("DEFAULT_SETTINGS provides reasonable defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      defaultMode: "tree",
      indent: 2,
      markerStyle: "modern",
      autoCollapseDepth: 2,
      validateAgainstSchema: true,
      companionSchemaSuffix: ".schema.json",
    });
  });

  it("display() renders six settings rows", () => {
    tab.display();
    const rows = tab.containerEl.children;
    expect(rows.length).toBe(6);
  });

  it("display() pre-fills current settings into controls", () => {
    plugin.settings = {
      defaultMode: "source",
      indent: 4,
      markerStyle: "classic",
      autoCollapseDepth: 1,
      validateAgainstSchema: false,
      companionSchemaSuffix: ".json-schema",
    };
    tab.display();
    const select = tab.containerEl.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("source");
  });
});
