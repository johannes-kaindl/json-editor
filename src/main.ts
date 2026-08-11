import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { type CollapseStates, capStates, recordFileState } from "./core/collapse-state";
import { renderJsonCodeblock } from "./obsidian/CodeblockProcessor";
import { JSON_VIEW_TYPE, JsonFileView } from "./obsidian/JsonFileView";
import {
  DEFAULT_SETTINGS,
  type JsonEditorSettings,
  JsonEditorSettingsTab,
} from "./obsidian/SettingsTab";
import { mergeSettings } from "./vendor/kit/settings";

export default class JsonEditorPlugin extends Plugin {
  settings: JsonEditorSettings = { ...DEFAULT_SETTINGS };
  private collapseStates: CollapseStates = {};

  async onload() {
    // One read, two consumers: mergeSettings only picks up known setting keys,
    // so the collapse state has to be pulled out of the same payload by hand.
    const stored = (await this.loadData()) as { collapseState?: CollapseStates } | null;
    this.settings = mergeSettings(DEFAULT_SETTINGS, stored);
    this.collapseStates = capStates(stored?.collapseState ?? {});

    this.registerView(
      JSON_VIEW_TYPE,
      (leaf: WorkspaceLeaf) =>
        new JsonFileView(leaf, this.settings, {
          get: (filePath) => this.collapseStates[filePath]?.collapsed,
          set: (filePath, collapsedPaths) => {
            this.collapseStates = capStates(
              recordFileState(this.collapseStates, filePath, collapsedPaths, Date.now()),
            );
            void this.persist();
          },
        }),
    );

    this.registerMarkdownCodeBlockProcessor("json", (src, el, ctx) =>
      renderJsonCodeblock(src, el, ctx, this.settings, "json"),
    );

    this.registerMarkdownCodeBlockProcessor("jsonc", (src, el, ctx) =>
      renderJsonCodeblock(src, el, ctx, this.settings, "jsonc"),
    );

    this.addSettingTab(new JsonEditorSettingsTab(this.app, this));

    this.addCommand({
      id: "focus-search",
      name: "Focus search",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view) return false;
        if (!checking) view.focusSearch();
        return true;
      },
    });

    this.addCommand({
      id: "undo-edit",
      name: "Undo edit",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view || !view.canUndo()) return false;
        if (!checking) view.undo();
        return true;
      },
    });

    this.addCommand({
      id: "redo-edit",
      name: "Redo edit",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view || !view.canRedo()) return false;
        if (!checking) view.redo();
        return true;
      },
    });

    this.addCommand({
      id: "toggle-tree-source",
      name: "Toggle tree/source view",
      // No default *command* hotkey (those are global and would shadow the core
      // "Toggle reading view"). Mod+E is instead handled by the view-local Scope
      // in JsonFileView (active only in JSON views, so it never overrides the
      // core binding elsewhere). This command stays for the palette + custom rebinding.
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view) return false;
        if (!checking) view.toggleMode();
        return true;
      },
    });

    // No default hotkeys (audit 2.1) — these stay palette-only until the user
    // binds them, so they never shadow a core Obsidian binding.
    this.addCommand({
      id: "collapse-all",
      name: "Collapse all",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view) return false;
        if (!checking) view.collapseAll();
        return true;
      },
    });

    this.addCommand({
      id: "expand-all",
      name: "Expand all",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view) return false;
        if (!checking) view.expandAll();
        return true;
      },
    });

    this.addCommand({
      id: "collapse-to-default-depth",
      name: "Collapse to default depth",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(JsonFileView);
        if (!view) return false;
        if (!checking) view.collapseToDefaultDepth();
        return true;
      },
    });

    // Claim the .json file extension LAST and guard it: registerExtensions
    // throws hard if another plugin already handles .json. An uncaught throw
    // would abort onload and take down everything registered above, so we
    // degrade gracefully — the view + code-block rendering keep working.
    try {
      this.registerExtensions(["json"], JSON_VIEW_TYPE);
    } catch {
      new Notice(
        "JSON editor: another plugin already handles .json — file view disabled, code-block rendering still active.",
      );
    }
    // Separate try/catch so a .jsonc collision doesn't skip the .json claim
    // (and vice versa) — each extension degrades independently.
    try {
      this.registerExtensions(["jsonc"], JSON_VIEW_TYPE);
    } catch {
      new Notice(
        "JSON editor: another plugin already handles .jsonc — file view disabled, code-block rendering still active.",
      );
    }
  }

  /**
   * The ONE place that writes data.json. saveData() replaces the whole file, so
   * settings and collapse state must always be written together — writing either
   * one alone would silently drop the other.
   */
  private async persist(): Promise<void> {
    await this.saveData({ ...this.settings, collapseState: this.collapseStates });
  }

  async saveSettings(): Promise<void> {
    await this.persist();
  }
}
