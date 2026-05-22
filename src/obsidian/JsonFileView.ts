import { TextFileView, type WorkspaceLeaf } from "obsidian";
import { parse } from "../core/parse";
import { serialize } from "../core/serialize";
import type { JsonValue } from "../core/types";
import { TreeView } from "./TreeView";
import { SourceView } from "./SourceView";
import type { JsonEditorSettings } from "./SettingsTab";
import { Breadcrumb } from "./Breadcrumb";
import { Tooltip, tooltipContentForValue } from "./Tooltip";

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
  private tooltip!: Tooltip;

  constructor(leaf: WorkspaceLeaf, private settings: JsonEditorSettings) {
    super(leaf);
    this.mode = settings.defaultMode;
    this.buildChrome();
  }

  getViewType(): string {
    return JSON_VIEW_TYPE;
  }

  override getViewData(): string {
    return this.data;
  }

  override setViewData(data: string, _clear: boolean): void {
    this.data = data;
    if (data.trim() === "") {
      this.invalid = false;
      this.currentValue = null;
      this.clearBanner();
      this.treePillEl.disabled = false;
      this.renderEmptyState();
      return;
    }
    const parsed = parse(data);
    if (parsed.ok) {
      this.invalid = false;
      this.currentValue = parsed.value;
      this.clearBanner();
      this.treePillEl.disabled = false;
    } else {
      this.invalid = true;
      this.currentValue = null;
      this.mode = "source";
      this.showBanner(`Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`);
      this.treePillEl.disabled = true;
    }
    this.refreshMode();
  }

  override clear(): void {
    this.data = "";
    this.currentValue = null;
    this.invalid = false;
    this.clearBanner();
    this.bodyEl.innerHTML = "";
    this.breadcrumb.setPath([]);
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

    this.toolbarEl = document.createElement("div");
    this.toolbarEl.className = "json-toolbar";
    this.toolbarEl.appendChild(this.breadcrumb.getElement());
    this.toolbarEl.appendChild(this.toggleEl);
    this.contentEl.appendChild(this.toolbarEl);

    this.tooltip = new Tooltip();

    this.contentEl.appendChild(this.bodyEl);
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
        this.showBanner(`Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`);
        this.treePillEl.disabled = true;
        return;
      }
    }
    this.mode = target;
    this.refreshMode();
  }

  private refreshMode(): void {
    this.sourceView?.destroy();
    this.bodyEl.innerHTML = "";
    this.treeView = null;
    this.sourceView = null;

    this.treePillEl.classList.toggle("active", this.mode === "tree");
    this.sourcePillEl.classList.toggle("active", this.mode === "source");

    if (this.mode === "tree" && this.currentValue !== null) {
      this.treeView = new TreeView(this.bodyEl, {
        markerStyle: this.settings.markerStyle,
        autoCollapseDepth: this.settings.autoCollapseDepth,
        onChange: (newValue) => this.handleTreeChange(newValue),
        onPathClick: (path) => this.breadcrumb.setPath(path),
        onBeforeRender: () => this.tooltip.hide(),
        onValueHover: (target, path, value) => {
          this.tooltip.show(target, tooltipContentForValue(value, path));
          target.addEventListener("mouseleave", () => this.tooltip.hide(), { once: true });
        },
      });
      this.treeView.setValue(this.currentValue);
    } else {
      this.sourceView = new SourceView(this.bodyEl, {
        onChange: (text) => this.handleSourceChange(text),
      });
      this.sourceView.setValue(this.data);
    }
  }

  private renderEmptyState(): void {
    this.sourceView?.destroy();
    this.bodyEl.innerHTML = "";
    this.treeView = null;
    this.sourceView = null;
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
    this.currentValue = newValue;
    this.data = serialize(newValue, { indent: this.settings.indent });
    this.requestSave();
  }

  private handleSourceChange(text: string): void {
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
    this.requestSave();
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
  }
}
