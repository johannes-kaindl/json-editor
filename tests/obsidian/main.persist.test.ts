// data.json is written wholesale by saveData(), so settings and the per-file
// collapse state must always go out together. Writing either one on its own
// silently drops the other — this file nails that down.

import type { PluginManifest } from "obsidian";
import { describe, expect, it } from "vitest";
import JsonEditorPlugin from "../../src/main";

const MANIFEST: PluginManifest = { id: "x", name: "x", version: "0.1.0" };
const appStub = () => ({}) as Record<string, unknown>;

type Stored = { collapseState?: Record<string, { collapsed: string[]; touched: number }> } & Record<
  string,
  unknown
>;

describe("JsonEditorPlugin persistence", () => {
  it("keeps the collapse state when settings are saved", async () => {
    const plugin = new JsonEditorPlugin(appStub(), MANIFEST);
    (plugin as unknown as { storedData: unknown }).storedData = {
      indent: 4,
      collapseState: { "a.json": { collapsed: ["x"], touched: 1 } },
    };
    await plugin.onload();

    plugin.settings.indent = 2;
    await plugin.saveSettings();

    const written = (plugin as unknown as { storedData: Stored }).storedData;
    expect(written.indent).toBe(2);
    expect(written.collapseState).toEqual({ "a.json": { collapsed: ["x"], touched: 1 } });
  });

  it("keeps the settings when the collapse state is saved", () => {
    const plugin = new JsonEditorPlugin(appStub(), MANIFEST);
    (plugin as unknown as { storedData: unknown }).storedData = { indent: 4 };
    return plugin.onload().then(() => {
      // The view gets its store from the registered factory — go through the same
      // door rather than reaching into the plugin's internals.
      const factory = (plugin as unknown as { views: Record<string, (l: unknown) => unknown> })
        .views["json-editor-view"];
      const view = factory({ app: {} }) as unknown as {
        collapseStore: { set(p: string, paths: string[]): void };
      };

      view.collapseStore.set("b.json", ["y"]);

      const written = (plugin as unknown as { storedData: Stored }).storedData;
      expect(written.indent).toBe(4);
      expect(written.collapseState?.["b.json"]?.collapsed).toEqual(["y"]);
    });
  });
});
