import { type JsonType, computeInsertionIndex, editValue, jsonTypeOf } from "../core/edit";
import { pathToString } from "../core/path";
import { renderTree } from "../core/render";
import { findMatches } from "../core/search";
import type { JsonPath, JsonValue, MarkerStyle } from "../core/types";
import { createAddAffordance } from "./AddAffordance";
import { createCopyButton } from "./CopyButton";
import { createRowActions } from "./RowActions";
import { openTypeMenu } from "./TypeMenu";
import { activeDoc } from "./dom";

export interface TreeViewOptions {
  readonly?: boolean;
  markerStyle?: MarkerStyle;
  autoCollapseDepth?: number;
  onChange?: (newValue: JsonValue) => void;
  onPathClick?: (path: JsonPath) => void;
  onValueHover?: (target: HTMLElement, path: JsonPath, value: JsonValue) => void;
  onBeforeRender?: () => void;
  /**
   * Called when the user requests a structural mutation. The callback is
   * responsible for invoking the core edit op, pushing onto history, and
   * (eventually) calling treeView.setValue() with the result. Errors thrown
   * from the core op will be surfaced via the optional onError callback.
   */
  onAddKey?: (parentPath: JsonPath, key: string) => void;
  onAddItem?: (parentPath: JsonPath) => void;
  onDelete?: (path: JsonPath) => void;
  onRenameKey?: (path: JsonPath, newKey: string) => void;
  onMoveItem?: (parentPath: JsonPath, fromIdx: number, toIdx: number) => void;
  onMoveKey?: (parentPath: JsonPath, key: string, toPos: number) => void;
  onChangeType?: (path: JsonPath, newType: JsonType) => void;
  onError?: (err: Error) => void;
  /**
   * When true (Obsidian mobile), suppress hover/DnD affordances; actions come
   * from a long-press menu instead. Injected from JsonFileView's Platform.isMobile.
   */
  touchMode?: boolean;
  /**
   * Touch-mode only: fired on long-press (contextmenu) of a row. The host opens
   * the consolidated RowMenu. Receives the originating event and the row path.
   */
  onContextMenu?: (evt: MouseEvent, path: JsonPath) => void;
}

const FLASH_MS = 600;

export class TreeView {
  private current: JsonValue = null;
  private editing = false;
  private activeRow: HTMLElement | null = null;
  private dragSourcePath: JsonPath | null = null;
  private validationErrors: Map<string, string> = new Map();

  constructor(
    private container: HTMLElement,
    private opts: TreeViewOptions,
  ) {}

  setValidationErrors(errors: Map<string, string>): void {
    this.validationErrors = errors;
    const treeRoot = this.container.querySelector<HTMLElement>(".json-tree-root");
    if (treeRoot) this.applyValidationMarkers(treeRoot);
  }

  private applyValidationMarkers(treeRoot: HTMLElement): void {
    treeRoot.querySelectorAll<HTMLElement>(".json-row.json-row-error").forEach((row) => {
      row.classList.remove("json-row-error");
      row.removeAttribute("title");
    });
    if (this.validationErrors.size === 0) return;
    for (const [pathStr, message] of this.validationErrors) {
      const row = treeRoot.querySelector<HTMLElement>(
        `.json-row[data-path="${cssEscapeAttr(pathStr)}"]`,
      );
      if (row) {
        row.classList.add("json-row-error");
        row.setAttribute("title", message);
      }
    }
  }

  setValue(value: JsonValue): void {
    this.current = value;
    this.render();
  }

  getValue(): JsonValue {
    return this.current;
  }

  scrollToPath(path: JsonPath): void {
    const selector = `.json-row[data-path="${cssEscapeAttr(pathToString(path))}"]`;
    const row = this.container.querySelector<HTMLElement>(selector);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("json-row-flash");
    window.setTimeout(() => row.classList.remove("json-row-flash"), FLASH_MS);
  }

  applyFilter(query: string): { matchCount: number } {
    const treeRoot = this.container.querySelector<HTMLElement>(".json-tree-root");
    if (!treeRoot) return { matchCount: 0 };

    treeRoot.classList.remove("json-filter-active");
    treeRoot.querySelectorAll(".json-match, .json-on-path").forEach((el) => {
      el.classList.remove("json-match", "json-on-path");
    });

    if (query.trim() === "") return { matchCount: 0 };

    const result = findMatches(this.current, query, { matchKeys: true, matchValues: true });

    for (const pathStr of result.matches) {
      if (pathStr === "root") continue;
      const row = treeRoot.querySelector<HTMLElement>(`[data-path="${cssEscapeAttr(pathStr)}"]`);
      row?.classList.add("json-match");
    }

    for (const pathStr of result.onPath) {
      if (pathStr === "root") continue;
      const row = treeRoot.querySelector<HTMLElement>(`[data-path="${cssEscapeAttr(pathStr)}"]`);
      row?.classList.add("json-on-path");
    }

    treeRoot.classList.add("json-filter-active");
    this.openContainersWithMatches(treeRoot);

    return { matchCount: result.matches.size };
  }

  private openContainersWithMatches(treeRoot: HTMLElement): void {
    treeRoot
      .querySelectorAll<HTMLElement>(
        ".json-on-path .json-container.is-collapsed, .json-match .json-container.is-collapsed",
      )
      .forEach((container) => {
        const content = container.querySelector<HTMLElement>(":scope > .json-content");
        const toggle = container.querySelector<HTMLElement>(":scope > .json-collapse-toggle");
        content?.classList.remove("collapsed");
        container.classList.remove("is-collapsed");
        toggle?.classList.add("is-open");
      });
  }

  private render(): void {
    this.opts.onBeforeRender?.();
    // Capture state that the full re-render would otherwise drop (blocker 1.8):
    // the active row, a delete fallback, whether focus was inside the tree,
    // scroll position, and which containers diverge from the depth default.
    const previousPathStr = this.activeRow?.getAttribute("data-path") ?? null;
    const fallbackPathStr = this.siblingFallbackPathStr(this.activeRow);
    const hadFocus = this.container.contains(activeDoc().activeElement);
    const scroller = this.scrollParent();
    const prevScroll = scroller.scrollTop;
    const prevCollapsed = this.collectCollapseState();
    this.container.replaceChildren();
    this.activeRow = null;
    const el = renderTree(this.current, {
      doc: this.container.ownerDocument,
      readonly: this.opts.readonly,
      markerStyle: this.opts.markerStyle ?? "modern",
      autoCollapseDepth: this.opts.autoCollapseDepth,
      onValueClick: (path, value) => this.openEditor(path, value),
      onPathClick: (path) => this.opts.onPathClick?.(path),
      onValueHover: (target, path, value) => {
        if (this.editing) return;
        this.opts.onValueHover?.(target, path, value);
      },
    });
    this.attachCopyButtons(el);
    if (!this.opts.readonly) {
      this.attachStructuralActions(el);
    }
    this.container.appendChild(el);
    this.applyValidationMarkers(el);
    this.reapplyCollapseState(el, prevCollapsed);
    scroller.scrollTop = prevScroll;
    this.setupKeyboardNav(el, previousPathStr, fallbackPathStr, hadFocus);
  }

  /**
   * The element that actually scrolls. In Obsidian the tree's own container is
   * not the scroller — an ancestor (e.g. .view-content) is — so restoring
   * scrollTop on this.container would be a no-op in production. Walk up to the
   * nearest scrollable ancestor; fall back to the container (also the happy-dom
   * test case, where layout has no scroll height).
   */
  private scrollParent(): HTMLElement {
    let el: HTMLElement | null = this.container;
    while (el) {
      const oy = el.ownerDocument?.defaultView?.getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return this.container;
  }

  /** Snapshot each container's collapsed flag keyed by its data-path. */
  private collectCollapseState(): Map<string, boolean> {
    const map = new Map<string, boolean>();
    const treeRoot = this.container.querySelector<HTMLElement>(".json-tree-root");
    if (!treeRoot) return map;
    treeRoot.querySelectorAll<HTMLElement>(".json-container").forEach((c) => {
      const key = pathToString(this.detectContainerPath(c, treeRoot));
      map.set(key, c.classList.contains("is-collapsed"));
    });
    return map;
  }

  /** Re-apply a snapshot, flipping only containers that diverge from it. */
  private reapplyCollapseState(treeRoot: HTMLElement, prev: Map<string, boolean>): void {
    treeRoot.querySelectorAll<HTMLElement>(".json-container").forEach((c) => {
      const key = pathToString(this.detectContainerPath(c, treeRoot));
      const wanted = prev.get(key);
      if (wanted === undefined) return; // newly-added container — keep render default
      if (wanted !== c.classList.contains("is-collapsed")) {
        this.toggleContainer(c, !wanted); // expand = not collapsed
      }
    });
  }

  /**
   * The path of the row to focus when the active row no longer exists after a
   * re-render (e.g. it was deleted): next sibling, else previous sibling, else
   * the parent row.
   */
  private siblingFallbackPathStr(row: HTMLElement | null): string | null {
    if (!row) return null;
    const content = row.parentElement;
    if (content) {
      const sibs = Array.from(content.children).filter(
        (c): c is HTMLElement => c.instanceOf(HTMLElement) && c.classList.contains("json-row"),
      );
      const idx = sibs.indexOf(row);
      const sibling = sibs[idx + 1] ?? sibs[idx - 1] ?? null;
      if (sibling) return sibling.getAttribute("data-path");
    }
    return this.parentRowOf(row)?.getAttribute("data-path") ?? null;
  }

  private attachStructuralActions(treeRoot: HTMLElement): void {
    // Attach drag-handle + RowActions to every row.
    const rows = treeRoot.querySelectorAll<HTMLElement>('.json-row[role="treeitem"]');
    rows.forEach((row) => {
      const pathStr = row.getAttribute("data-path");
      if (pathStr === null) return;
      const path = this.parsePathStrSafe(pathStr);
      const lastSeg = path[path.length - 1];
      const canRename = typeof lastSeg === "string";

      if (this.opts.touchMode) {
        // Touch: no hover/DnD affordances — a long-press opens the RowMenu.
        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.opts.onContextMenu?.(e, path);
        });
        return;
      }

      const handle = activeDoc().createElement("span");
      handle.className = "json-drag-handle";
      handle.setAttribute("aria-hidden", "true");
      handle.textContent = "⋮⋮";
      row.insertBefore(handle, row.firstChild);
      row.setAttribute("draggable", "true");
      this.wireDragEvents(row, path);

      const value = locateValueByPathStr(this.current, pathStr);
      const actions = createRowActions({
        canRename,
        onRename: () => this.startRename(row, path, String(lastSeg)),
        onDelete: () => this.opts.onDelete?.(path),
        onChangeType: this.opts.onChangeType
          ? () => this.openTypeMenuFor(row, path, value)
          : undefined,
      });
      row.appendChild(actions);
    });

    // Attach AddAffordance to every container's content.
    const containers = treeRoot.querySelectorAll<HTMLElement>(".json-container");
    containers.forEach((container) => {
      const content = this.directChildWithClass(container, "json-content");
      if (!content) return;
      const kind = this.detectContainerKind(container);
      const containerPath = this.detectContainerPath(container, treeRoot);
      const aff = createAddAffordance({
        kind,
        onAdd: (key) => {
          if (kind === "object") {
            if (key !== undefined) this.opts.onAddKey?.(containerPath, key);
          } else {
            this.opts.onAddItem?.(containerPath);
          }
        },
      });
      content.appendChild(aff);
    });
  }

  private openTypeMenuFor(row: HTMLElement, path: JsonPath, value: JsonValue): void {
    if (!this.opts.onChangeType) return;
    const current = jsonTypeOf(value);
    openTypeMenu(row, {
      currentType: current,
      onPick: (newType) => this.opts.onChangeType?.(path, newType),
    });
  }

  private wireDragEvents(row: HTMLElement, path: JsonPath): void {
    row.addEventListener("dragstart", (e) => {
      // Stop the event from bubbling to ancestor row listeners, otherwise they
      // would overwrite `dragSourcePath` with their own path during bubble-phase.
      e.stopPropagation();
      this.dragSourcePath = path;
      row.classList.add("json-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("application/x-json-path", pathToString(path));
        } catch {
          // happy-dom may not implement setData for arbitrary types; ignore.
        }
      }
    });

    row.addEventListener("dragend", (e) => {
      e.stopPropagation();
      row.classList.remove("json-dragging");
      this.clearDropTargets();
      this.dragSourcePath = null;
    });

    row.addEventListener("dragover", (e) => {
      if (!this.dragSourcePath) return;
      if (!this.isSameParent(this.dragSourcePath, path)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      this.clearDropTargets();
      const pos = this.dropPosition(row, e.clientY);
      row.classList.add(pos === "before" ? "json-drop-target-before" : "json-drop-target-after");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("json-drop-target-before", "json-drop-target-after");
    });

    row.addEventListener("drop", (e) => {
      const src = this.dragSourcePath;
      if (!src) return;
      if (!this.isSameParent(src, path)) return;
      e.preventDefault();
      e.stopPropagation();
      this.clearDropTargets();

      const srcLast = src[src.length - 1];
      const dstLast = path[path.length - 1];
      const parentPath = path.slice(0, -1);

      if (typeof srcLast === "number" && typeof dstLast === "number") {
        const pos = this.dropPosition(row, e.clientY);
        const toIdx = computeInsertionIndex(srcLast, dstLast, pos);
        if (toIdx !== srcLast) {
          this.opts.onMoveItem?.(parentPath, srcLast, toIdx);
        }
      } else if (typeof srcLast === "string" && typeof dstLast === "string") {
        const parentObj = this.getValueAt(parentPath);
        if (parentObj === null || typeof parentObj !== "object" || Array.isArray(parentObj)) {
          return;
        }
        const keys = Object.keys(parentObj);
        const fromPos = keys.indexOf(srcLast);
        const toPosTarget = keys.indexOf(dstLast);
        if (fromPos === -1 || toPosTarget === -1) return;
        const pos = this.dropPosition(row, e.clientY);
        const toPos = computeInsertionIndex(fromPos, toPosTarget, pos);
        if (toPos !== fromPos) {
          this.opts.onMoveKey?.(parentPath, srcLast, toPos);
        }
      }

      this.dragSourcePath = null;
    });
  }

  private isSameParent(a: JsonPath, b: JsonPath): boolean {
    if (a.length !== b.length) return false;
    if (a.length === 0) return false;
    for (let i = 0; i < a.length - 1; i++) {
      if (a[i] !== b[i]) return false;
    }
    // Last segment must be same kind (both numeric or both string).
    const aLast = a[a.length - 1];
    const bLast = b[b.length - 1];
    return typeof aLast === typeof bLast;
  }

  private dropPosition(row: HTMLElement, clientY: number): "before" | "after" {
    const rect = row.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  private clearDropTargets(): void {
    this.container
      .querySelectorAll(".json-drop-target-before, .json-drop-target-after")
      .forEach((el) => el.classList.remove("json-drop-target-before", "json-drop-target-after"));
  }

  private getValueAt(path: JsonPath): JsonValue {
    let cur: JsonValue = this.current;
    for (const seg of path) {
      if (Array.isArray(cur) && typeof seg === "number") {
        cur = cur[seg];
      } else if (cur !== null && typeof cur === "object" && typeof seg === "string") {
        cur = (cur as { [k: string]: JsonValue })[seg];
      } else {
        return null;
      }
    }
    return cur;
  }

  private detectContainerKind(container: HTMLElement): "object" | "array" {
    const bracket = this.directChildWithClass(container, "json-bracket");
    return bracket?.textContent === "{" ? "object" : "array";
  }

  private detectContainerPath(container: HTMLElement, treeRoot: HTMLElement): JsonPath {
    const parent = container.parentElement;
    if (!parent || parent === treeRoot) return [];
    if (parent.classList.contains("json-row")) {
      const ps = parent.getAttribute("data-path");
      return ps ? this.parsePathStrSafe(ps) : [];
    }
    return [];
  }

  private parsePathStrSafe(pathStr: string): JsonPath {
    return parsePathStr(pathStr);
  }

  /**
   * Public seam: start inline rename for the row at `path` (used by the touch
   * RowMenu's "Rename key"). No-op for array indices or missing rows.
   */
  startRenameAt(path: JsonPath): void {
    const lastSeg = path[path.length - 1];
    if (typeof lastSeg !== "string") return;
    const pathStr = pathToString(path);
    const row = this.container.querySelector<HTMLElement>(
      `.json-row[data-path="${cssEscapeAttr(pathStr)}"]`,
    );
    if (row) this.startRename(row, path, lastSeg);
  }

  private startRename(row: HTMLElement, path: JsonPath, currentKey: string): void {
    const keyEl = row.querySelector<HTMLElement>(".json-key");
    if (!keyEl) return;
    this.editing = true;

    const input = activeDoc().createElement("input");
    input.type = "text";
    input.className = "json-inline-edit json-key-rename";
    input.value = currentKey;
    keyEl.replaceWith(input);
    input.focus();
    input.select();

    let resolved = false;
    const finish = (newKey: string | undefined) => {
      if (resolved) return;
      resolved = true;
      this.editing = false;
      if (newKey !== undefined && newKey !== "" && newKey !== currentKey) {
        this.opts.onRenameKey?.(path, newKey);
      } else {
        // No mutation; restore via re-render
        this.render();
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(input.value.trim());
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(undefined);
      }
    });
    input.addEventListener("blur", () => finish(input.value.trim()));
  }

  private setupKeyboardNav(
    treeRoot: HTMLElement,
    previousPathStr: string | null,
    fallbackPathStr: string | null,
    hadFocus: boolean,
  ): void {
    const rows = Array.from(treeRoot.querySelectorAll<HTMLElement>('.json-row[role="treeitem"]'));
    rows.forEach((r) => r.setAttribute("tabindex", "-1"));

    // Restore the active row by path; if it's gone (deleted), use the sibling
    // fallback; otherwise the first row.
    let restored: HTMLElement | null = null;
    if (previousPathStr) {
      restored = rows.find((r) => r.getAttribute("data-path") === previousPathStr) ?? null;
    }
    if (!restored && fallbackPathStr) {
      restored = rows.find((r) => r.getAttribute("data-path") === fallbackPathStr) ?? null;
    }
    const initial = restored ?? rows[0] ?? null;
    if (initial) {
      initial.setAttribute("tabindex", "0");
      this.activeRow = initial;
      // Only pull focus back into the tree if it was there before the
      // re-render — otherwise we'd steal focus from elsewhere in the app.
      if (hadFocus) initial.focus();
    }

    treeRoot.addEventListener("keydown", (e) => this.handleKeydown(e));
  }

  private setActiveRow(row: HTMLElement): void {
    if (this.activeRow === row) {
      row.focus();
      return;
    }
    this.activeRow?.setAttribute("tabindex", "-1");
    row.setAttribute("tabindex", "0");
    this.activeRow = row;
    row.focus();
  }

  private isRowVisible(row: HTMLElement): boolean {
    let el: HTMLElement | null = row.parentElement;
    while (el && !el.classList.contains("json-tree-root")) {
      if (el.classList.contains("json-content") && el.classList.contains("collapsed")) {
        return false;
      }
      el = el.parentElement;
    }
    const treeRoot = el;
    if (treeRoot?.classList.contains("json-filter-active")) {
      return row.classList.contains("json-match") || row.classList.contains("json-on-path");
    }
    return true;
  }

  private visibleRows(): HTMLElement[] {
    const treeRoot = this.container.querySelector(".json-tree-root");
    if (!treeRoot) return [];
    return Array.from(treeRoot.querySelectorAll<HTMLElement>('.json-row[role="treeitem"]')).filter(
      (r) => this.isRowVisible(r),
    );
  }

  private directChildWithClass(parent: HTMLElement, cls: string): HTMLElement | null {
    for (const child of Array.from(parent.children)) {
      if (child.instanceOf(HTMLElement) && child.classList.contains(cls)) {
        return child;
      }
    }
    return null;
  }

  private containerInRow(row: HTMLElement): HTMLElement | null {
    return this.directChildWithClass(row, "json-container");
  }

  private parentRowOf(row: HTMLElement): HTMLElement | null {
    let el: HTMLElement | null = row.parentElement;
    while (el && !el.classList.contains("json-tree-root")) {
      if (el.classList.contains("json-row") && el.getAttribute("role") === "treeitem") {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  private firstChildRowOf(row: HTMLElement): HTMLElement | null {
    const container = this.containerInRow(row);
    if (!container) return null;
    const content = this.directChildWithClass(container, "json-content");
    if (!content) return null;
    return this.directChildWithClass(content, "json-row");
  }

  private toggleContainer(container: HTMLElement, expand?: boolean): void {
    const isCollapsed = container.classList.contains("is-collapsed");
    const targetCollapsed = expand !== undefined ? !expand : !isCollapsed;
    if (targetCollapsed === isCollapsed) return;

    const content = this.directChildWithClass(container, "json-content");
    const toggle = this.directChildWithClass(container, "json-collapse-toggle");
    if (targetCollapsed) {
      content?.classList.add("collapsed");
      container.classList.add("is-collapsed");
      toggle?.classList.remove("is-open");
      container.setAttribute("aria-expanded", "false");
    } else {
      content?.classList.remove("collapsed");
      container.classList.remove("is-collapsed");
      toggle?.classList.add("is-open");
      container.setAttribute("aria-expanded", "true");
    }
  }

  /**
   * Reorder the active row within its parent by `dir` (-1 up / +1 down). Shared
   * by Alt+Arrow keyboard reorder (and conceptually mirrors the touch RowMenu's
   * Move up/down). No-op at the bounds or in read-only mode.
   */
  private moveActive(row: HTMLElement, dir: -1 | 1): void {
    if (this.opts.readonly) return;
    const pathStr = row.getAttribute("data-path");
    if (!pathStr) return;
    const path = this.parsePathStrSafe(pathStr);
    const lastSeg = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const parent = this.getValueAt(parentPath);
    if (typeof lastSeg === "number" && Array.isArray(parent)) {
      const toIdx = lastSeg + dir;
      if (toIdx < 0 || toIdx >= parent.length) return;
      this.opts.onMoveItem?.(parentPath, lastSeg, toIdx);
    } else if (typeof lastSeg === "string" && parent !== null && typeof parent === "object") {
      const keys = Object.keys(parent);
      const pos = keys.indexOf(lastSeg);
      const toPos = pos + dir;
      if (pos === -1 || toPos < 0 || toPos >= keys.length) return;
      this.opts.onMoveKey?.(parentPath, lastSeg, toPos);
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (this.editing) return;
    const active = this.activeRow;
    if (!active) return;
    const rows = this.visibleRows();
    if (rows.length === 0) return;
    const idx = rows.indexOf(active);
    if (idx === -1) {
      // Filter changed and active row is no longer visible — jump to first visible.
      e.preventDefault();
      this.setActiveRow(rows[0]);
      return;
    }

    switch (e.key) {
      case "ArrowDown": {
        if (e.altKey) {
          e.preventDefault();
          this.moveActive(active, +1);
          return;
        }
        const next = rows[idx + 1];
        if (next) {
          e.preventDefault();
          this.setActiveRow(next);
        }
        return;
      }
      case "ArrowUp": {
        if (e.altKey) {
          e.preventDefault();
          this.moveActive(active, -1);
          return;
        }
        const prev = rows[idx - 1];
        if (prev) {
          e.preventDefault();
          this.setActiveRow(prev);
        }
        return;
      }
      case "ArrowRight": {
        const container = this.containerInRow(active);
        if (!container) return;
        e.preventDefault();
        if (container.classList.contains("is-collapsed")) {
          this.toggleContainer(container, true);
        } else {
          const firstChild = this.firstChildRowOf(active);
          if (firstChild) this.setActiveRow(firstChild);
        }
        return;
      }
      case "ArrowLeft": {
        const container = this.containerInRow(active);
        if (container && !container.classList.contains("is-collapsed")) {
          e.preventDefault();
          this.toggleContainer(container, false);
          return;
        }
        const parent = this.parentRowOf(active);
        if (parent) {
          e.preventDefault();
          this.setActiveRow(parent);
        }
        return;
      }
      case "Home": {
        e.preventDefault();
        this.setActiveRow(rows[0]);
        return;
      }
      case "End": {
        e.preventDefault();
        this.setActiveRow(rows[rows.length - 1]);
        return;
      }
      case "Enter":
      case "F2": {
        const editable = this.directChildWithClass(active, "json-editable");
        if (editable) {
          e.preventDefault();
          editable.click();
        }
        return;
      }
      case "Backspace":
      case "Delete": {
        if (this.opts.readonly) return;
        const pathStr = active.getAttribute("data-path");
        if (!pathStr) return;
        e.preventDefault();
        const path = this.parsePathStrSafe(pathStr);
        this.opts.onDelete?.(path);
        return;
      }
    }
  }

  private attachCopyButtons(treeRoot: HTMLElement): void {
    if (this.opts.touchMode) return;
    const rows = treeRoot.querySelectorAll<HTMLElement>(".json-row");
    rows.forEach((row) => {
      const pathStr = row.getAttribute("data-path");
      if (pathStr === null) return;
      const value = locateValueByPathStr(this.current, pathStr);
      const path = parsePathStr(pathStr);
      const btn = createCopyButton(value, path);
      row.appendChild(btn);
    });
  }

  private openEditor(path: JsonPath, value: JsonValue): void {
    if (this.opts.readonly) return;
    if (value === null) return;
    const valueEl = this.findElementForPath(path);
    if (!valueEl) return;

    this.editing = true;
    const finish = (newVal: JsonValue | undefined) => {
      this.editing = false;
      if (newVal !== undefined) {
        const updated = editValue(this.current, path, newVal);
        this.current = updated;
        this.opts.onChange?.(updated);
      }
      this.render();
    };

    if (typeof value === "string") {
      replaceWithInput(valueEl, "text", value, (raw, committed) => {
        finish(committed ? raw : undefined);
      });
    } else if (typeof value === "number") {
      replaceWithInput(valueEl, "number", String(value), (raw, committed) => {
        if (!committed) return finish(undefined);
        const n = Number(raw);
        if (!Number.isFinite(n)) return finish(undefined);
        // Reject integers JS can't hold exactly rather than silently
        // truncating (e.g. 9007199254740993 -> ...992). Source mode handles
        // big integers losslessly.
        if (Number.isInteger(n) && !Number.isSafeInteger(n)) {
          this.opts.onError?.(
            new Error(
              "Number too large to edit in tree mode without losing precision — use Source mode.",
            ),
          );
          return finish(undefined);
        }
        finish(n);
      });
    } else if (typeof value === "boolean") {
      replaceWithCheckbox(valueEl, value, (newVal, committed) => {
        finish(committed ? newVal : undefined);
      });
    }
  }

  private findElementForPath(path: JsonPath): HTMLElement | null {
    let current: HTMLElement | null = this.container.querySelector(".json-tree-root");
    if (!current) return null;
    for (const seg of path) {
      if (!current) return null;
      current = locateChildForSegment(current, seg);
    }
    if (!current) return null;
    const primitive = current.querySelector<HTMLElement>(
      ".json-string, .json-number, .json-boolean, .json-null",
    );
    return primitive ?? current;
  }
}

function locateChildForSegment(parent: HTMLElement, segment: string | number): HTMLElement | null {
  const content = parent.querySelector<HTMLElement>(".json-content");
  if (!content) return null;
  const rows = Array.from(content.children).filter(
    (el): el is HTMLElement => el.instanceOf(HTMLElement) && el.classList.contains("json-row"),
  );
  if (typeof segment === "string") {
    for (const row of rows) {
      const key = row.querySelector(".json-key");
      if (key && key.textContent === `"${segment}"`) return row;
    }
    return null;
  }
  return rows[segment] ?? null;
}

function locateValueByPathStr(root: JsonValue, pathStr: string): JsonValue {
  const path = parsePathStr(pathStr);
  let current: JsonValue = root;
  for (const seg of path) {
    if (current === null) return null;
    if (Array.isArray(current) && typeof seg === "number") {
      current = current[seg];
    } else if (typeof current === "object" && typeof seg === "string") {
      current = (current as { [k: string]: JsonValue })[seg];
    } else {
      return null;
    }
  }
  return current;
}

function parsePathStr(pathStr: string): JsonPath {
  if (pathStr === "root") return [];
  const segments: JsonPath = [];
  let i = 0;
  let buf = "";
  const flushString = () => {
    if (buf.length > 0) {
      segments.push(buf);
      buf = "";
    }
  };
  while (i < pathStr.length) {
    const c = pathStr[i];
    if (c === ".") {
      flushString();
      i++;
    } else if (c === "[") {
      flushString();
      // Quoted-key form: ["..."]. Scan for the closing `"]` and respect
      // escaped quotes (\"). A bare `]` inside the key value would otherwise
      // be misread as the structural close and corrupt the segment.
      if (pathStr[i + 1] === '"') {
        let j = i + 2;
        let raw = "";
        while (j < pathStr.length) {
          if (pathStr[j] === "\\" && pathStr[j + 1] === '"') {
            raw += '"';
            j += 2;
          } else if (pathStr[j] === '"' && pathStr[j + 1] === "]") {
            break;
          } else {
            raw += pathStr[j];
            j++;
          }
        }
        segments.push(raw);
        i = j + 2; // skip `"]`
      } else {
        const close = pathStr.indexOf("]", i);
        const inner = pathStr.slice(i + 1, close);
        segments.push(Number.parseInt(inner, 10));
        i = close + 1;
      }
    } else {
      buf += c;
      i++;
    }
  }
  flushString();
  return segments;
}

function cssEscapeAttr(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function replaceWithInput(
  target: HTMLElement,
  type: "text" | "number",
  initial: string,
  onDone: (rawValue: string, committed: boolean) => void,
): void {
  const input = activeDoc().createElement("input");
  input.type = type;
  input.value = initial;
  input.className = "json-inline-edit";
  target.replaceWith(input);
  input.focus();
  input.select();
  let resolved = false;
  const commit = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.value, true);
  };
  const cancel = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.value, false);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", () => commit());
}

function replaceWithCheckbox(
  target: HTMLElement,
  initial: boolean,
  onDone: (newValue: boolean, committed: boolean) => void,
): void {
  const input = activeDoc().createElement("input");
  input.type = "checkbox";
  input.checked = initial;
  input.className = "json-inline-edit";
  target.replaceWith(input);
  input.focus();
  let resolved = false;
  const commit = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.checked, true);
  };
  const cancel = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.checked, false);
  };
  input.addEventListener("change", () => commit());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", () => commit());
}
