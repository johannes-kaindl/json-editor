import { Notice, Scope, TFile, TextFileView, type WorkspaceLeaf, normalizePath } from "obsidian";
import {
  type JsonType,
  addArrayItem,
  addObjectKey,
  changeType,
  deleteAt,
  moveArrayItem,
  moveObjectKey,
  renameKey,
} from "../core/edit";
import { History } from "../core/history";
import { parse } from "../core/parse";
import { pathToString } from "../core/path";
import { hasNumberRoundtripLoss } from "../core/roundtrip";
import { type CompiledSchema, type PathError, compileSchema } from "../core/schema";
import { serialize } from "../core/serialize";
import type { JsonPath, JsonValue } from "../core/types";
import { Breadcrumb } from "./Breadcrumb";
import { LossBanner } from "./LossBanner";
import { SchemaBanner } from "./SchemaBanner";
import { SearchBar } from "./SearchBar";
import type { JsonEditorSettings } from "./SettingsTab";
import { SourceView } from "./SourceView";
import { Tooltip, tooltipContentForValue } from "./Tooltip";
import { TreeView } from "./TreeView";
import { closeActiveMenu } from "./TypeMenu";

export const JSON_VIEW_TYPE = "json-editor-view";

type Mode = "tree" | "source";

export class JsonFileView extends TextFileView {
  private mode: Mode;
  private treeView: TreeView | null = null;
  private sourceView: SourceView | null = null;
  private currentValue: JsonValue | null = null;
  private invalid = false;

  private toolbarEl!: HTMLDivElement;
  private toggleEl!: HTMLDivElement;
  private treePillEl!: HTMLButtonElement;
  private sourcePillEl!: HTMLButtonElement;
  private bodyEl!: HTMLDivElement;
  private bannerEl: HTMLDivElement | null = null;
  private breadcrumb!: Breadcrumb;
  private searchBar!: SearchBar;
  private currentQuery = "";
  private tooltip!: Tooltip;
  private schemaBanner!: SchemaBanner;
  private lossBanner!: LossBanner;
  private lossyRoundtrip = false;
  private currentSchema: CompiledSchema | null = null;
  // Bumped on every per-file reset so a fire-and-forget companion-schema load
  // can detect that the file changed while it was awaiting and bail out.
  private fileGeneration = 0;
  private history = new History<string>();

  constructor(
    leaf: WorkspaceLeaf,
    private settings: JsonEditorSettings,
  ) {
    super(leaf);
    this.mode = settings.defaultMode;
    this.buildChrome();
    this.registerKeymap();
  }

  /**
   * View-local key bindings (audit 2.1). The commands carry NO default
   * hotkeys (which violated the guideline and shadowed user bindings); instead
   * a view Scope handles Mod+F/Mod+Z/Mod+Shift+Z only while this view is
   * focused. Mod+Z/Mod+Shift+Z fall through (return undefined) when a text
   * input or the CodeMirror editor is focused, so native input undo works.
   */
  private registerKeymap(): void {
    this.scope = new Scope(this.app.scope);
    this.scope.register(["Mod"], "f", () => {
      this.focusSearch();
      return false;
    });
    this.scope.register(["Mod"], "z", () => {
      if (this.isTextInputFocused() || !this.canUndo()) return undefined;
      this.undo();
      return false;
    });
    this.scope.register(["Mod", "Shift"], "z", () => {
      if (this.isTextInputFocused() || !this.canRedo()) return undefined;
      this.redo();
      return false;
    });
  }

  private isTextInputFocused(): boolean {
    const active = this.contentEl.ownerDocument.activeElement as HTMLElement | null;
    if (!active) return false;
    if (active.tagName === "INPUT" || active.tagName === "TEXTAREA") return true;
    return active.closest(".cm-editor") !== null;
  }

  getViewType(): string {
    return JSON_VIEW_TYPE;
  }

  override getViewData(): string {
    return this.data;
  }

  override setViewData(data: string, clear: boolean): void {
    // A truthy `clear` flag means Obsidian is loading a *different* file into
    // this reused view (file switch or external reload) — per the TextFileView
    // contract, drop all per-file state. Internal undo/redo restores pass
    // clear=false so the unified history survives those.
    if (clear) this.resetPerFileState();
    this.data = data;
    if (data.trim() === "") {
      this.invalid = false;
      this.currentValue = null;
      this.clearBanner();
      this.updateLossyState();
      this.treePillEl.disabled = false;
      this.renderEmptyState();
      this.applyValidation();
      return;
    }
    if (!this.recomputeFromData()) this.mode = "source";
    this.updateLossyState();
    this.refreshMode();
    this.applyValidation();
    void this.tryLoadCompanionSchema();
  }

  /**
   * Re-parse this.data and refresh currentValue/invalid/parse-banner/tree-pill
   * WITHOUT touching the mode or rebuilding any view. Returns whether the parse
   * succeeded. Shared by setViewData and the source-mode undo/redo path (2.2).
   */
  private recomputeFromData(): boolean {
    const parsed = parse(this.data);
    if (parsed.ok) {
      this.invalid = false;
      this.currentValue = parsed.value;
      this.clearBanner();
      this.treePillEl.disabled = false;
      return true;
    }
    this.invalid = true;
    this.currentValue = null;
    this.showBanner(`Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`);
    this.treePillEl.disabled = true;
    return false;
  }

  /**
   * Recompute whether the current document holds numbers JSON cannot
   * round-trip (blocker 1.4) and drive the warn banner. Reads this.data /
   * this.currentValue, so call it after both are set. When lossy, the tree is
   * rendered read-only (see refreshMode) so a tree edit cannot silently
   * rewrite the untouched numbers; source mode stays editable.
   */
  private updateLossyState(): void {
    this.lossyRoundtrip = this.currentValue !== null && hasNumberRoundtripLoss(this.data);
    if (this.lossyRoundtrip) {
      this.lossBanner.show(
        "This file contains numbers JSON can't represent exactly (e.g. integers larger than 2^53). Tree editing is disabled to avoid silently rewriting them — switch to Source mode to edit.",
      );
    } else {
      this.lossBanner.hide();
    }
  }

  override clear(): void {
    this.resetPerFileState();
    this.data = "";
    this.currentValue = null;
    this.invalid = false;
    this.clearBanner();
    this.bodyEl.replaceChildren();
    this.breadcrumb.setPath([]);
  }

  /**
   * Drop all state that belongs to the previously-open file. Called from
   * clear() (file unload) and from setViewData() when Obsidian flags a
   * different file (clear=true). Bundles the history reset (blocker 1.2) with
   * the schema/query/mode reset (blocker 2.8) in one place.
   */
  private resetPerFileState(): void {
    this.fileGeneration++;
    this.history.clear();
    this.currentSchema = null;
    this.currentQuery = "";
    this.searchBar.clear();
    this.mode = this.settings.defaultMode;
    this.lossyRoundtrip = false;
    this.lossBanner.hide();
  }

  private buildChrome(): void {
    this.toggleEl = document.createElement("div");
    this.toggleEl.className = "json-mode-toggle";
    this.treePillEl = document.createElement("button");
    this.treePillEl.className = "json-mode-pill";
    this.treePillEl.textContent = "Tree";
    this.treePillEl.addEventListener("click", () => this.switchTo("tree"));
    this.sourcePillEl = document.createElement("button");
    this.sourcePillEl.className = "json-mode-pill";
    this.sourcePillEl.textContent = "Source";
    this.sourcePillEl.addEventListener("click", () => this.switchTo("source"));
    this.toggleEl.appendChild(this.treePillEl);
    this.toggleEl.appendChild(this.sourcePillEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "json-editor-body";

    this.breadcrumb = new Breadcrumb({
      onSegmentClick: (subPath) => this.treeView?.scrollToPath(subPath),
    });

    this.searchBar = new SearchBar({
      onQueryChange: (q) => this.onQueryChange(q),
    });

    this.toolbarEl = document.createElement("div");
    this.toolbarEl.className = "json-toolbar";
    this.toolbarEl.appendChild(this.breadcrumb.getElement());
    this.toolbarEl.appendChild(this.searchBar.getElement());
    this.toolbarEl.appendChild(this.toggleEl);
    this.contentEl.appendChild(this.toolbarEl);

    this.schemaBanner = new SchemaBanner();
    this.contentEl.appendChild(this.schemaBanner.getElement());

    this.lossBanner = new LossBanner();
    this.contentEl.appendChild(this.lossBanner.getElement());

    this.tooltip = new Tooltip(this.contentEl);

    this.contentEl.appendChild(this.bodyEl);
  }

  setSchema(schemaText: string): void {
    if (!this.settings.validateAgainstSchema) return;
    const result = compileSchema(schemaText);
    if (!result.ok) {
      this.currentSchema = null;
      this.schemaBanner.setSchemaParseError(result.error);
      return;
    }
    this.currentSchema = result.schema;
    this.applyValidation();
  }

  private applyValidation(): void {
    if (!this.settings.validateAgainstSchema || !this.currentSchema) {
      this.schemaBanner.hide();
      this.treeView?.setValidationErrors(new Map());
      return;
    }
    if (this.currentValue === null) {
      // Don't surface schema errors when the document doesn't parse — the
      // parse-banner already tells the user.
      this.schemaBanner.hide();
      this.treeView?.setValidationErrors(new Map());
      return;
    }
    const errors = this.currentSchema.validate(this.currentValue);
    this.schemaBanner.setErrors(errors.length);
    this.treeView?.setValidationErrors(pathErrorsToMap(errors));
  }

  private async tryLoadCompanionSchema(): Promise<void> {
    if (!this.settings.validateAgainstSchema) return;
    if (!this.file || !this.app?.vault) return;
    const path = this.file.path;
    if (!path.endsWith(".json")) return;
    const schemaPath = normalizePath(
      path.slice(0, -".json".length) + this.settings.companionSchemaSuffix,
    );
    const sibling = this.app.vault.getAbstractFileByPath(schemaPath);
    if (sibling instanceof TFile) {
      const generation = this.fileGeneration;
      try {
        const schemaText = await this.app.vault.cachedRead(sibling);
        // The view may have switched files while the read was in flight —
        // applying this schema now would validate the new file against the old
        // file's schema (review findings #5/#13).
        if (generation !== this.fileGeneration) return;
        this.setSchema(schemaText);
      } catch {
        // best-effort — ignore vault read errors silently
      }
    }
  }

  private switchTo(target: Mode): void {
    if (this.mode === target) return;
    if (target === "tree" && this.invalid) return;
    if (this.mode === "source" && this.sourceView) {
      this.data = this.sourceView.getValue();
      const parsed = parse(this.data);
      if (parsed.ok) {
        this.currentValue = parsed.value;
      } else {
        this.invalid = true;
        this.showBanner(
          `Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`,
        );
        this.treePillEl.disabled = true;
        return;
      }
    }
    // History persists across mode switches (unified 1.2.0+).
    this.mode = target;
    this.refreshMode();
    this.applyValidation();
  }

  /**
   * Public Tree↔Source toggle (audit 3.1) — the binding target for the
   * toggle-tree-source command and the view-header action. A no-op when the
   * target would be tree but the JSON is invalid (switchTo guards that).
   */
  toggleMode(): void {
    this.switchTo(this.mode === "tree" ? "source" : "tree");
  }

  override async onOpen(): Promise<void> {
    this.addAction("list-tree", "Toggle tree/source view", () => this.toggleMode());
  }

  private refreshMode(): void {
    this.sourceView?.destroy();
    this.bodyEl.replaceChildren();
    this.treeView = null;
    this.sourceView = null;

    this.treePillEl.classList.toggle("active", this.mode === "tree");
    this.sourcePillEl.classList.toggle("active", this.mode === "source");

    if (this.mode === "tree" && this.currentValue !== null) {
      this.treeView = new TreeView(this.bodyEl, {
        readonly: this.lossyRoundtrip,
        markerStyle: this.settings.markerStyle,
        autoCollapseDepth: this.settings.autoCollapseDepth,
        onChange: (newValue) => this.handleTreeChange(newValue),
        onPathClick: (path) => this.breadcrumb.setPath(path),
        onBeforeRender: () => this.tooltip.hide(),
        onValueHover: (target, path, value) => {
          this.tooltip.show(target, tooltipContentForValue(value, path));
          target.addEventListener("mouseleave", () => this.tooltip.hide(), { once: true });
        },
        onAddKey: (parentPath, key) => this.handleAddKey(parentPath, key),
        onAddItem: (parentPath) => this.handleAddItem(parentPath),
        onDelete: (path) => this.handleDelete(path),
        onRenameKey: (path, newKey) => this.handleRename(path, newKey),
        onMoveItem: (parentPath, fromIdx, toIdx) => this.handleMoveItem(parentPath, fromIdx, toIdx),
        onMoveKey: (parentPath, key, toPos) => this.handleMoveKey(parentPath, key, toPos),
        onChangeType: (path, newType) => this.handleChangeType(path, newType),
        onError: (err) => new Notice(err.message),
      });
      this.treeView.setValue(this.currentValue);
    } else {
      this.sourceView = new SourceView(this.bodyEl, {
        onChange: (text) => this.handleSourceChange(text),
      });
      this.sourceView.setValue(this.data);
    }

    this.searchBar.getElement().hidden = this.mode !== "tree";
    if (this.mode === "tree" && this.treeView && this.currentQuery !== "") {
      const result = this.treeView.applyFilter(this.currentQuery);
      this.searchBar.setMatchInfo({ matchCount: result.matchCount });
    } else if (this.mode !== "tree") {
      this.searchBar.setMatchInfo(null);
    }
  }

  private onQueryChange(query: string): void {
    this.currentQuery = query;
    if (this.treeView) {
      const result = this.treeView.applyFilter(query);
      this.searchBar.setMatchInfo(query.trim() === "" ? null : { matchCount: result.matchCount });
    }
  }

  focusSearch(): void {
    if (this.mode !== "tree") {
      this.switchTo("tree");
    }
    this.searchBar.focus();
  }

  private renderEmptyState(): void {
    this.sourceView?.destroy();
    this.bodyEl.replaceChildren();
    this.treeView = null;
    this.sourceView = null;
    this.searchBar.getElement().hidden = true;
    this.searchBar.setMatchInfo(null);
    const wrap = document.createElement("div");
    wrap.className = "json-empty-state";
    const title = document.createElement("div");
    title.className = "json-empty-state-title";
    title.textContent = "This file is empty";
    const hint = document.createElement("div");
    hint.className = "json-empty-state-hint";
    hint.textContent = "Create an empty object to get started.";
    const btn = document.createElement("button");
    btn.className = "json-empty-state-init";
    btn.textContent = "Create empty object";
    btn.addEventListener("click", () => {
      this.setViewData("{}", false);
      this.requestSave();
    });
    wrap.appendChild(title);
    wrap.appendChild(hint);
    wrap.appendChild(btn);
    this.bodyEl.appendChild(wrap);
  }

  private handleTreeChange(newValue: JsonValue): void {
    this.applyMutation(newValue, "Edit value");
  }

  private handleAddKey(parentPath: JsonPath, key: string): void {
    try {
      const next = addObjectKey(this.currentValue, parentPath, key, null);
      this.applyMutation(next, `Add key "${key}"`);
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  private handleAddItem(parentPath: JsonPath): void {
    try {
      const next = addArrayItem(this.currentValue, parentPath, null);
      this.applyMutation(next, "Add item");
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  private handleDelete(path: JsonPath): void {
    try {
      const next = deleteAt(this.currentValue, path);
      this.applyMutation(next, "Delete row");
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  private handleRename(path: JsonPath, newKey: string): void {
    try {
      const next = renameKey(this.currentValue, path, newKey);
      this.applyMutation(next, `Rename to "${newKey}"`);
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  private handleMoveItem(parentPath: JsonPath, fromIdx: number, toIdx: number): void {
    try {
      const next = moveArrayItem(this.currentValue, parentPath, fromIdx, toIdx);
      if (next === this.currentValue) return;
      this.applyMutation(next, "Reorder item");
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  private handleMoveKey(parentPath: JsonPath, key: string, toPos: number): void {
    try {
      const next = moveObjectKey(this.currentValue, parentPath, key, toPos);
      if (next === this.currentValue) return;
      this.applyMutation(next, `Reorder key "${key}"`);
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  private handleChangeType(path: JsonPath, newType: JsonType): void {
    try {
      const next = changeType(this.currentValue, path, newType);
      if (next === this.currentValue) return;
      this.applyMutation(next, `Change type to ${newType}`);
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  private applyMutation(newValue: JsonValue, _description: string): void {
    // Unified history (1.2.0): push the pre-edit TEXT, not the JsonValue.
    this.history.push(this.data);
    this.currentValue = newValue;
    this.data = serialize(newValue, { indent: this.settings.indent });
    this.requestSave();
    if (this.treeView) {
      this.treeView.setValue(newValue);
      if (this.currentQuery !== "") {
        const result = this.treeView.applyFilter(this.currentQuery);
        this.searchBar.setMatchInfo({ matchCount: result.matchCount });
      }
    }
    this.applyValidation();
  }

  undo(): void {
    const prev = this.history.undo(this.data);
    if (prev === null) return;
    this.restoreText(prev);
  }

  redo(): void {
    const next = this.history.redo(this.data);
    if (next === null) return;
    this.restoreText(next);
  }

  private restoreText(text: string): void {
    // In source mode, patch the existing CodeMirror editor with a minimal
    // change instead of rebuilding it via setViewData->refreshMode (audit
    // 2.2) — preserves the editor instance, cursor, scroll, and focus.
    if (this.mode === "source" && this.sourceView !== null) {
      this.data = text;
      this.recomputeFromData(); // source renders regardless of validity; don't change mode
      this.sourceView.applyExternalEdit(text);
      this.updateLossyState();
      this.applyValidation();
      this.requestSave();
      return;
    }
    // Tree mode (or no live source view): reuse the full parse + refresh path
    // so an undone state that is invalid JSON snaps back to source with a banner.
    this.setViewData(text, false);
    this.requestSave();
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  private handleSourceChange(text: string): void {
    // Push pre-state TEXT before applying the new text — keeps the unified
    // stack capturing source-mode edits the same way it captures tree edits.
    if (text !== this.data) {
      this.history.push(this.data);
    }
    this.data = text;
    const parsed = parse(text);
    if (parsed.ok) {
      this.currentValue = parsed.value;
      this.invalid = false;
      this.clearBanner();
      this.treePillEl.disabled = false;
    } else {
      this.currentValue = null;
      this.invalid = true;
      this.showBanner(`Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`);
      this.treePillEl.disabled = true;
    }
    this.updateLossyState();
    this.requestSave();
    this.applyValidation();
  }

  private showBanner(message: string): void {
    if (!this.bannerEl) {
      this.bannerEl = document.createElement("div");
      this.bannerEl.className = "json-error-banner";
      this.contentEl.insertBefore(this.bannerEl, this.bodyEl);
    }
    this.bannerEl.textContent = message;
  }

  private clearBanner(): void {
    this.bannerEl?.remove();
    this.bannerEl = null;
  }

  onunload(): void {
    this.tooltip.destroy();
    this.searchBar.destroy();
    this.sourceView?.destroy();
    this.sourceView = null;
    closeActiveMenu();
  }
}

function pathErrorsToMap(errors: PathError[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const err of errors) {
    const key = err.path.length === 0 ? "root" : pathToString(err.path);
    const existing = map.get(key);
    map.set(key, existing ? `${existing}; ${err.message}` : err.message);
  }
  return map;
}
