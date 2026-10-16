// Blocker 1.6: registerExtensions throws hard when another plugin already
// claimed .json. An uncaught throw in onload kills the WHOLE plugin (codeblock
// processor, settings, commands). The claim must be guarded and the
// non-critical registrations must run regardless.

import { type App, Notice, type PluginManifest } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import JsonEditorPlugin from "../../src/main";
import { JSON_VIEW_TYPE } from "../../src/obsidian/JsonFileView";
import type { Notice as MockNotice, Plugin as MockPlugin } from "../__mocks__/obsidian";

// Vitest resolves "obsidian" to the mock, which records notices, commands and registrations; the real typings do not know them.
const NoticeStatics = Notice as unknown as typeof MockNotice;
const mock = (p: JsonEditorPlugin): MockPlugin => p as unknown as MockPlugin;

const MANIFEST: PluginManifest = {
  id: "x",
  name: "x",
  version: "0.1.0",
  author: "x",
  minAppVersion: "1.8.7",
  description: "x",
};
// onload reads loadData(); a minimal app stub is enough (commands gate on
// workspace only when invoked, not at registration time).
// onLayoutReady would start an endpoint probe; the stub never fires it.
const appStub = (): App => ({ workspace: { onLayoutReady: () => {} } }) as unknown as App;

describe("JsonEditorPlugin.onload (blocker 1.6)", () => {
  beforeEach(() => {
    NoticeStatics.instances = [];
  });

  it("survives a .json extension collision and still registers everything else", async () => {
    class CollidingPlugin extends JsonEditorPlugin {
      override registerExtensions(exts: string[]): void {
        if (exts.includes("json"))
          throw new Error('Attempting to register an existing file extension "json"');
      }
    }
    const plugin = new CollidingPlugin(appStub(), MANIFEST);

    await expect(plugin.onload()).resolves.toBeUndefined();

    expect(mock(plugin).postprocessors.json).toBeDefined(); // codeblock processor survived
    expect(mock(plugin).postprocessors.jsonc).toBeDefined(); // jsonc codeblock survived too
    expect(mock(plugin).settingTabs.length).toBe(1);
    expect(mock(plugin).commands.length).toBe(9);
  });

  it("shows an explanatory Notice naming the .json conflict on collision", async () => {
    class CollidingPlugin extends JsonEditorPlugin {
      override registerExtensions(exts: string[]): void {
        if (exts.includes("json")) throw new Error("collision");
      }
    }
    await new CollidingPlugin(appStub(), MANIFEST).onload();

    expect(NoticeStatics.instances.length).toBe(1);
    expect(NoticeStatics.instances[0].message.toLowerCase()).toMatch(/\.json|json/);
    expect(NoticeStatics.instances[0].message.toLowerCase()).toMatch(/disabled|code.?block|still/);
  });

  it("happy path: claims the json + jsonc extensions and shows no Notice", async () => {
    const calls: Array<[string[], string]> = [];
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(exts: string[], viewType: string): void {
        calls.push([exts, viewType]);
      }
    }
    await new OkPlugin(appStub(), MANIFEST).onload();

    expect(calls).toEqual([
      [["json"], JSON_VIEW_TYPE],
      [["jsonc"], JSON_VIEW_TYPE],
    ]);
    expect(NoticeStatics.instances.length).toBe(0);
  });

  it("registers the post-processor that renders ![[file.json]] embeds", async () => {
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {}
    }
    const plugin = new OkPlugin(appStub(), MANIFEST);
    await plugin.onload();
    expect(
      (plugin as unknown as { markdownPostProcessors: unknown[] }).markdownPostProcessors.length,
    ).toBe(1);
  });

  it("a .jsonc collision alone still registers .json and warns only about .jsonc", async () => {
    class JsoncCollides extends JsonEditorPlugin {
      override registerExtensions(exts: string[]): void {
        if (exts.includes("jsonc")) throw new Error("collision");
      }
    }
    await new JsoncCollides(appStub(), MANIFEST).onload();
    expect(NoticeStatics.instances.length).toBe(1);
    expect(NoticeStatics.instances[0].message.toLowerCase()).toMatch(/\.jsonc/);
  });

  it("registers no default hotkey on any command (audit 2.1)", async () => {
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {}
    }
    const plugin = new OkPlugin(appStub(), MANIFEST);
    await plugin.onload();
    for (const cmd of mock(plugin).commands as Array<{ hotkeys?: unknown }>) {
      expect(cmd.hotkeys).toBeUndefined();
    }
  });

  it("uses sentence-case command names without redundant 'JSON' (audit 2.23)", async () => {
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {}
    }
    const plugin = new OkPlugin(appStub(), MANIFEST);
    await plugin.onload();
    const names = (mock(plugin).commands as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain("Focus search");
    expect(names).toContain("Undo edit");
    expect(names).toContain("Redo edit");
  });

  it("registers a toggle-tree-source command with no default hotkey (audit 3.1)", async () => {
    class OkPlugin extends JsonEditorPlugin {
      override registerExtensions(): void {}
    }
    const plugin = new OkPlugin(appStub(), MANIFEST);
    await plugin.onload();
    const toggle = (
      mock(plugin).commands as Array<{ id: string; name: string; hotkeys?: unknown }>
    ).find((c) => c.id === "toggle-tree-source");
    expect(toggle).toBeTruthy();
    expect(toggle?.hotkeys).toBeUndefined();
    expect(toggle?.name).toBe("Toggle tree/source view");
  });
});
