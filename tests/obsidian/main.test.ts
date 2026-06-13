// Blocker 1.6: registerExtensions throws hard when another plugin already
// claimed .json. An uncaught throw in onload kills the WHOLE plugin (codeblock
// processor, settings, commands). The claim must be guarded and the
// non-critical registrations must run regardless.

import { Notice, type PluginManifest } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import JsonEditorPlugin from "../../src/main";
import { JSON_VIEW_TYPE } from "../../src/obsidian/JsonFileView";

const MANIFEST: PluginManifest = { id: "x", name: "x", version: "0.1.0" };
// onload reads loadData(); a minimal app stub is enough (commands gate on
// workspace only when invoked, not at registration time).
const appStub = () => ({}) as Record<string, unknown>;

describe("JsonEditorPlugin.onload (blocker 1.6)", () => {
  beforeEach(() => {
    Notice.instances = [];
  });

  it("survives a .json extension collision and still registers everything else", async () => {
    class CollidingPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {
        throw new Error('Attempting to register an existing file extension "json"');
      }
    }
    const plugin = new CollidingPlugin(appStub(), MANIFEST);

    await expect(plugin.onload()).resolves.toBeUndefined();

    expect(plugin.postprocessors.json).toBeDefined(); // codeblock processor survived
    expect(plugin.settingTabs.length).toBe(1);
    expect(plugin.commands.length).toBe(3);
  });

  it("shows an explanatory Notice naming the .json conflict on collision", async () => {
    class CollidingPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {
        throw new Error("collision");
      }
    }
    await new CollidingPlugin(appStub(), MANIFEST).onload();

    expect(Notice.instances.length).toBe(1);
    expect(Notice.instances[0].message.toLowerCase()).toMatch(/\.json|json/);
    expect(Notice.instances[0].message.toLowerCase()).toMatch(/disabled|code.?block|still/);
  });

  it("happy path: claims the json extension once and shows no Notice", async () => {
    const calls: Array<[string[], string]> = [];
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(exts: string[], viewType: string): void {
        calls.push([exts, viewType]);
      }
    }
    await new OkPlugin(appStub(), MANIFEST).onload();

    expect(calls).toEqual([[["json"], JSON_VIEW_TYPE]]);
    expect(Notice.instances.length).toBe(0);
  });

  it("registers no default hotkey on any command (audit 2.1)", async () => {
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {}
    }
    const plugin = new OkPlugin(appStub(), MANIFEST);
    await plugin.onload();
    for (const cmd of plugin.commands as Array<{ hotkeys?: unknown }>) {
      expect(cmd.hotkeys).toBeUndefined();
    }
  });

  it("uses sentence-case command names without redundant 'JSON' (audit 2.23)", async () => {
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {}
    }
    const plugin = new OkPlugin(appStub(), MANIFEST);
    await plugin.onload();
    const names = (plugin.commands as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain("Focus search");
    expect(names).toContain("Undo edit");
    expect(names).toContain("Redo edit");
  });
});
