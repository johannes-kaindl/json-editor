import { type App, Plugin } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  JsonEditorSettingsTab,
  isValidCompanionSuffix,
} from "../../src/obsidian/SettingsTab";
import type { RepairService } from "../../src/obsidian/repair-service";

const renderSettings = vi.fn();
const hideSettings = vi.fn();

class FakePlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  repairService = { llm: { renderSettings, hideSettings } } as unknown as RepairService;
  async saveSettings() {
    await this.saveData(this.settings);
  }
}

describe("JsonEditorSettingsTab", () => {
  let app: App;
  let plugin: FakePlugin;
  let tab: JsonEditorSettingsTab;

  beforeEach(() => {
    renderSettings.mockClear();
    hideSettings.mockClear();
    app = {} as App;
    plugin = new FakePlugin(app, { id: "x", name: "x", version: "0.1.0" });
    tab = new JsonEditorSettingsTab(app, plugin);
  });

  it("DEFAULT_SETTINGS provides reasonable defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      defaultMode: "tree",
      indent: 2,
      markerStyle: "modern",
      autoCollapseDepth: 2,
      validateAgainstSchema: false,
      companionSchemaSuffix: ".schema.json",
    });
    // LLM repair block: one local endpoint, automatic choice. The wait is the connection's.
    expect(DEFAULT_SETTINGS.endpoints).toEqual([{ url: "http://127.0.0.1:1234" }]);
    expect(DEFAULT_SETTINGS.choice).toEqual({});
    expect("timeoutSec" in DEFAULT_SETTINGS).toBe(false);
  });

  it("display() renders the help row first, then the six editor rows plus the repair group (heading + the connection row)", () => {
    tab.display();
    const rows = tab.containerEl.children;
    expect(rows.length).toBe(9);
    expect(rows[0]?.querySelector("button")?.textContent).toBe("Open documentation");
  });

  it("isValidCompanionSuffix accepts conventional suffixes, rejects path-bearing ones (2.20)", () => {
    expect(isValidCompanionSuffix(".schema.json")).toBe(true);
    expect(isValidCompanionSuffix(".json-schema")).toBe(true);
    expect(isValidCompanionSuffix("")).toBe(false);
    expect(isValidCompanionSuffix("/etc/passwd")).toBe(false);
    expect(isValidCompanionSuffix("..\\evil.json")).toBe(false);
    expect(isValidCompanionSuffix("../x.json")).toBe(false);
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

  it("draws the whole connection through the kit, in its own host and the tab's language", () => {
    tab.display();
    expect(renderSettings).toHaveBeenCalledTimes(1);
    const [host, strings] = renderSettings.mock.calls[0] as [HTMLElement, { lang: string }];
    expect(host).toBeInstanceOf(HTMLElement);
    expect(host).not.toBe(tab.containerEl);
    expect(strings).toEqual({ lang: expect.stringMatching(/^(en|de)$/) });
  });

  it("hide() lets the connection drop the model lists of the tab", () => {
    tab.hide();
    expect(hideSettings).toHaveBeenCalledTimes(1);
  });
});
