// Obsidian >= 1.13 reads getSettingDefinitions() to make settings searchable;
// older versions call display(). Both must describe the SAME six settings, which
// is why the definitions are the single source and display() just walks them.

import { type App, Plugin } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, JsonEditorSettingsTab } from "../../src/obsidian/SettingsTab";

class FakePlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  async saveSettings() {
    await this.saveData(this.settings);
  }
}

type Def = { control?: { key?: string }; items?: Def[] };
// Groups hold their controls one level down; searchability needs the leaves.
function keysOf(items: unknown[]): string[] {
  return (items as Def[]).flatMap((i) => (i.items ? keysOf(i.items) : [i.control?.key ?? ""]));
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
    // The endpoint and request rows are render-only (kit blocks); their leaves carry no key.
    const keys = keysOf(tab.getSettingDefinitions()).filter((k) => k !== "");
    expect(keys.sort()).toEqual(
      [
        "autoCollapseDepth",
        "companionSchemaSuffix",
        "defaultMode",
        "indent",
        "markerStyle",
        "timeoutSec",
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

  it("puts the help row first, with the documentation index and the issue tracker of this repo", () => {
    const first = tab.getSettingDefinitions()[0] as {
      name: string;
      render?: (setting: unknown) => void;
    };
    expect(first.name).toBe("Help");
    expect(typeof first.render).toBe("function");

    const handlers: Array<() => void> = [];
    const chain = {
      setName: () => chain,
      setDesc: () => chain,
      addButton: (cb: (b: unknown) => void) => {
        const b = {
          setButtonText: () => b,
          onClick: (h: () => void) => {
            handlers.push(h);
            return b;
          },
        };
        cb(b);
        return chain;
      },
      addExtraButton: (cb: (b: unknown) => void) => {
        const b = {
          setIcon: () => b,
          setTooltip: () => b,
          onClick: (h: () => void) => {
            handlers.push(h);
            return b;
          },
        };
        cb(b);
        return chain;
      },
    };
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    first.render?.(chain);
    for (const h of handlers) h();
    expect(open.mock.calls.map((c) => c[0])).toEqual([
      "https://github.com/johannes-kaindl/json-editor/blob/main/docs/README.md",
      "https://github.com/johannes-kaindl/json-editor/issues",
    ]);
    open.mockRestore();
  });
});
