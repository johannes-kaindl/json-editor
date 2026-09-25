import { type App, Plugin } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  JsonEditorSettingsTab,
  isValidCompanionSuffix,
} from "../../src/obsidian/SettingsTab";
import type { RepairService } from "../../src/obsidian/repair-service";
import { buildEndpointSourceSection } from "../../src/vendor/kit-obsidian/endpoint-source";
import { buildRequestSection } from "../../src/vendor/kit-obsidian/request-section";

// The kit blocks draw their own DOM against the real Setting API; here only the wiring counts.
vi.mock("../../src/vendor/kit-obsidian/endpoint-source", () => ({
  buildEndpointSourceSection: vi.fn(),
  findEndpointManager: () => null,
  onEndpointManagerChanged: () => () => {},
}));
vi.mock("../../src/vendor/kit-obsidian/request-section", () => ({ buildRequestSection: vi.fn() }));
vi.mock("../../src/vendor/kit-obsidian/endpoint-list", () => ({ buildEndpointList: vi.fn() }));

class FakePlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  repairService = {
    requestSectionState: () => ({}),
    requestSession: {},
    activeEndpointUrl: () => null,
    invalidate: () => {},
    resolve: async () => ({}),
    saveRequestSettings: async () => {},
  } as unknown as RepairService;
  async saveSettings() {
    await this.saveData(this.settings);
  }
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
    expect(DEFAULT_SETTINGS).toMatchObject({
      defaultMode: "tree",
      indent: 2,
      markerStyle: "modern",
      autoCollapseDepth: 2,
      validateAgainstSchema: false,
      companionSchemaSuffix: ".schema.json",
    });
    // LLM repair block: one local endpoint, automatic choice, a bounded wait.
    expect(DEFAULT_SETTINGS.endpoints).toEqual([{ url: "http://127.0.0.1:1234" }]);
    expect(DEFAULT_SETTINGS.choice).toEqual({});
    expect(DEFAULT_SETTINGS.timeoutSec).toBe(60);
  });

  it("display() renders the six editor rows plus the repair group (heading + 3 rows)", () => {
    tab.display();
    const rows = tab.containerEl.children;
    expect(rows.length).toBe(10);
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

  it("hangs the kit endpoint and request blocks under the repair group, in mode 'structured'", () => {
    tab.display();
    expect(buildEndpointSourceSection).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "chat", caller: "json-editor" }),
    );
    expect(buildRequestSection).toHaveBeenCalledWith(
      expect.objectContaining({ modes: ["structured"] }),
    );
  });

  it("stores the timeout with a floor and ignores non-numbers", () => {
    tab.setControlValue("timeoutSec", "1");
    expect(plugin.settings.timeoutSec).toBe(5);
    tab.setControlValue("timeoutSec", "90");
    expect(plugin.settings.timeoutSec).toBe(90);
    tab.setControlValue("timeoutSec", "abc");
    expect(plugin.settings.timeoutSec).toBe(90);
  });
});
