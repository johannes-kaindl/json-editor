# Mobile Interaction Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Obsidian mobile, replace hover-only inline affordances + HTML5 drag-and-drop with one consolidated long-press → Obsidian `Menu`, add `Alt+Arrow` keyboard reorder, and add mobile undo/redo toolbar buttons — so every tree operation is reachable on touch, with no dead or invisible affordances.

**Architecture:** A `touchMode: boolean` flag is injected into `TreeView` (from `JsonFileView` reading `Platform.isMobile`), keeping `TreeView` free of `Platform` and unit-testable. In touch mode, `TreeView` skips drag wiring + inline RowActions/CopyButtons and instead wires a `contextmenu` listener that opens a new `RowMenu` (Obsidian `Menu`). Copy logic is extracted to a shared `clipboard.ts`. Desktop behavior is unchanged except two additive wins: `Alt+Arrow` reorder and a `:focus-within` reveal for the copy button.

**Tech Stack:** TypeScript, Obsidian API (`Platform`, `Menu`, `setIcon`), Vitest + happy-dom, Biome, `eslint-plugin-obsidianmd`.

**Spec:** `docs/superpowers/specs/2026-06-13-mobile-interaction-model-design.md`

**Conventions observed:** tests in `tests/**`, obsidian aliased to `src/__mocks__/obsidian.ts`; `TreeView` constructed directly with callback spies; `JsonFileView` constructed via `new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS)` with `document.body.appendChild(v.contentEl)`. Run a single file: `npx vitest run tests/obsidian/<file> -t "<name>"`. Full suite: `npm test`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/__mocks__/obsidian.ts` | **modify** — add `Platform`, `Menu`/`MenuItem`, `setIcon` mocks |
| `src/obsidian/clipboard.ts` | **create** — `copyToClipboard` / `copyJsonValue` / `copyJsonPath` (shared by CopyButton + RowMenu) |
| `src/obsidian/CopyButton.ts` | **modify** — use shared clipboard util |
| `src/obsidian/RowMenu.ts` | **create** — `openRowMenu(evt, opts)` builds + shows an Obsidian `Menu` |
| `src/obsidian/TreeView.ts` | **modify** — `touchMode`; suppress inline UI/drag on touch; `contextmenu`→RowMenu; `Alt+Arrow` reorder; move-index helper |
| `src/obsidian/JsonFileView.ts` | **modify** — read `Platform.isMobile`→`touchMode`; wire RowMenu callbacks; mobile undo/redo buttons |
| `src/obsidian/TypeMenu.ts` | **modify (minor)** — `mousedown`→ also `pointerdown` (desktop-touch hardening) |
| `styles.css` | **modify** — `body.is-mobile` toggle tap-target; `:focus-within` copy-btn reveal |
| `manifest.json`,`package.json`,`versions.json`,`CHANGELOG.md`,`README.md` | **modify** — 1.8.0 release prep |

---

## Task 1: Obsidian mock — `Platform`, `Menu`, `setIcon`

**Files:**
- Modify: `src/__mocks__/obsidian.ts`

- [ ] **Step 1: Add the mocks** (append to `src/__mocks__/obsidian.ts`)

```ts
export const Platform = {
  isMobile: false,
  isPhone: false,
  isTablet: false,
  isDesktop: true,
};

export function setIcon(el: HTMLElement, iconId: string): void {
  el.dataset.icon = iconId;
}

export class MenuItem {
  titleText = "";
  iconName = "";
  disabled = false;
  warning = false;
  clickHandler: (() => void) | null = null;
  submenu: Menu | null = null;
  setTitle(t: string): this {
    this.titleText = t;
    return this;
  }
  setIcon(i: string): this {
    this.iconName = i;
    return this;
  }
  setDisabled(d: boolean): this {
    this.disabled = d;
    return this;
  }
  setWarning(w: boolean): this {
    this.warning = w;
    return this;
  }
  onClick(cb: () => void): this {
    this.clickHandler = cb;
    return this;
  }
  setSubmenu(): Menu {
    this.submenu = new Menu();
    return this.submenu;
  }
}

export class Menu {
  items: MenuItem[] = [];
  separatorCount = 0;
  shown = false;
  addItem(cb: (item: MenuItem) => void): this {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator(): this {
    this.separatorCount += 1;
    return this;
  }
  showAtMouseEvent(_e: MouseEvent): this {
    this.shown = true;
    return this;
  }
  showAtPosition(_p: { x: number; y: number }): this {
    this.shown = true;
    return this;
  }
  hide(): this {
    this.shown = false;
    return this;
  }
}
```

- [ ] **Step 2: Verify the suite still loads** — Run: `npm test` · Expected: existing 537 tests still pass (no behavior change yet).

- [ ] **Step 3: Commit**

```bash
git add src/__mocks__/obsidian.ts
git commit -m "test(mock): add Platform, Menu, setIcon to obsidian mock"
```

---

## Task 2: Extract clipboard logic (`clipboard.ts`)

**Files:**
- Create: `src/obsidian/clipboard.ts`
- Modify: `src/obsidian/CopyButton.ts`
- Test: `tests/obsidian/clipboard.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/obsidian/clipboard.test.ts`)

```ts
import { Notice } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyJsonPath, copyJsonValue } from "../../src/obsidian/clipboard";

describe("clipboard util", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    Notice.instances = [];
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
  });

  it("copyJsonValue writes pretty JSON and calls onCopied", async () => {
    const onCopied = vi.fn();
    copyJsonValue({ a: 1 }, onCopied);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('{\n  "a": 1\n}'));
    await vi.waitFor(() => expect(onCopied).toHaveBeenCalled());
  });

  it("copyJsonPath writes pathToString output", async () => {
    copyJsonPath(["users", 0, "name"]);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("users[0].name"));
  });

  it("absent clipboard API shows a Copy failed Notice and does not throw", () => {
    vi.stubGlobal("navigator", {});
    expect(() => copyJsonValue("x")).not.toThrow();
    expect(Notice.instances.some((n) => /copy failed/i.test(n.message))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/clipboard.test.ts` · Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/obsidian/clipboard.ts`**

```ts
import { Notice } from "obsidian";
import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";

/**
 * Write text to the clipboard, guarding the navigator.clipboard absence on
 * older Android WebViews / non-secure contexts where reading .writeText throws
 * synchronously (audit 2.19). Calls onCopied on success, shows a Notice on any
 * failure.
 */
export function copyToClipboard(text: string, onCopied?: () => void): void {
  const clipboard = navigator.clipboard;
  if (!clipboard) {
    new Notice("Copy failed");
    return;
  }
  clipboard.writeText(text).then(
    () => onCopied?.(),
    () => new Notice("Copy failed"),
  );
}

export function copyJsonValue(value: JsonValue, onCopied?: () => void): void {
  copyToClipboard(JSON.stringify(value, null, 2), onCopied);
}

export function copyJsonPath(path: JsonPath, onCopied?: () => void): void {
  copyToClipboard(pathToString(path), onCopied);
}
```

- [ ] **Step 4: Refactor `CopyButton.ts` to use the util** — replace the click handler body so it calls the shared functions; keep the `⧉`/`✓` glyph + `.copied` behavior intact:

```ts
import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";
import { copyToClipboard } from "./clipboard";

export function createCopyButton(value: JsonValue, path: JsonPath): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "json-copy-btn";
  btn.type = "button";
  btn.textContent = "⧉";
  btn.title = "Copy value (alt-click: copy path)";

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = e.altKey ? pathToString(path) : JSON.stringify(value, null, 2);
    copyToClipboard(text, () => markCopied(btn));
  });

  return btn;
}

function markCopied(btn: HTMLButtonElement): void {
  btn.classList.add("copied");
  btn.textContent = "✓";
  window.setTimeout(() => {
    btn.classList.remove("copied");
    btn.textContent = "⧉";
  }, 800);
}
```

- [ ] **Step 5: Run both test files** — Run: `npx vitest run tests/obsidian/clipboard.test.ts tests/obsidian/CopyButton.test.ts` · Expected: PASS (CopyButton tests unchanged behavior).

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/clipboard.ts src/obsidian/CopyButton.ts tests/obsidian/clipboard.test.ts
git commit -m "refactor: extract shared clipboard util (copyJsonValue/Path)"
```

---

## Task 3: `RowMenu.ts` — consolidated long-press menu

**Files:**
- Create: `src/obsidian/RowMenu.ts`
- Test: `tests/obsidian/RowMenu.test.ts`

Menu order: `[error header (disabled, if any)] · Copy value · Copy path · [if !readonly: Rename key (if canRename) · Change type ▸ (submenu) · ─ · Move up · Move down · ─ · Delete]`.

- [ ] **Step 1: Write the failing test** (`tests/obsidian/RowMenu.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonType } from "../../src/core/edit";
import { openRowMenu } from "../../src/obsidian/RowMenu";

const baseOpts = () => ({
  value: "x" as unknown,
  path: ["a"],
  canRename: true,
  currentType: "string" as JsonType,
  readonly: false,
  moveUpEnabled: true,
  moveDownEnabled: true,
  onCopyValue: vi.fn(),
  onCopyPath: vi.fn(),
  onRename: vi.fn(),
  onChangeType: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  onDelete: vi.fn(),
});

const titles = (menu: { items: { titleText: string }[] }) => menu.items.map((i) => i.titleText);

describe("openRowMenu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("editable object key: shows copy + rename + change-type + move + delete", () => {
    const menu = openRowMenu(new MouseEvent("contextmenu"), baseOpts());
    expect(menu.shown).toBe(true);
    expect(titles(menu)).toEqual([
      "Copy value",
      "Copy path",
      "Rename key",
      "Change type",
      "Move up",
      "Move down",
      "Delete",
    ]);
  });

  it("array index: omits Rename key", () => {
    const menu = openRowMenu(new MouseEvent("contextmenu"), { ...baseOpts(), canRename: false });
    expect(titles(menu)).not.toContain("Rename key");
    expect(titles(menu)).toContain("Move up");
  });

  it("readonly: only copy entries", () => {
    const menu = openRowMenu(new MouseEvent("contextmenu"), { ...baseOpts(), readonly: true });
    expect(titles(menu)).toEqual(["Copy value", "Copy path"]);
  });

  it("validationError renders a disabled header item with the message", () => {
    const menu = openRowMenu(new MouseEvent("contextmenu"), {
      ...baseOpts(),
      validationError: "must be a number",
    });
    expect(menu.items[0].titleText).toContain("must be a number");
    expect(menu.items[0].disabled).toBe(true);
  });

  it("disables Move up / Move down at the bounds", () => {
    const menu = openRowMenu(new MouseEvent("contextmenu"), {
      ...baseOpts(),
      moveUpEnabled: false,
      moveDownEnabled: true,
    });
    const up = menu.items.find((i) => i.titleText === "Move up")!;
    const down = menu.items.find((i) => i.titleText === "Move down")!;
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(false);
  });

  it("Delete item is marked as a warning", () => {
    const menu = openRowMenu(new MouseEvent("contextmenu"), baseOpts());
    expect(menu.items.find((i) => i.titleText === "Delete")!.warning).toBe(true);
  });

  it("clicking Copy value invokes onCopyValue", () => {
    const opts = baseOpts();
    const menu = openRowMenu(new MouseEvent("contextmenu"), opts);
    menu.items.find((i) => i.titleText === "Copy value")!.clickHandler!();
    expect(opts.onCopyValue).toHaveBeenCalled();
  });

  it("clicking Move up invokes onMoveUp", () => {
    const opts = baseOpts();
    const menu = openRowMenu(new MouseEvent("contextmenu"), opts);
    menu.items.find((i) => i.titleText === "Move up")!.clickHandler!();
    expect(opts.onMoveUp).toHaveBeenCalled();
  });

  it("Change type submenu has 6 entries with the current type disabled; picking calls onChangeType", () => {
    const opts = baseOpts();
    const menu = openRowMenu(new MouseEvent("contextmenu"), opts);
    const changeType = menu.items.find((i) => i.titleText === "Change type")!;
    const sub = changeType.submenu!;
    expect(sub.items.length).toBe(6);
    expect(sub.items.find((i) => i.titleText.toLowerCase() === "string")!.disabled).toBe(true);
    sub.items.find((i) => i.titleText.toLowerCase() === "number")!.clickHandler!();
    expect(opts.onChangeType).toHaveBeenCalledWith("number");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/RowMenu.test.ts` · Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/obsidian/RowMenu.ts`**

```ts
import { Menu } from "obsidian";
import type { JsonType } from "../core/edit";
import type { JsonPath, JsonValue } from "../core/types";

const TYPES: JsonType[] = ["string", "number", "boolean", "null", "object", "array"];
const LABELS: Record<JsonType, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  null: "Null",
  object: "Object",
  array: "Array",
};

export interface RowMenuOptions {
  value: JsonValue;
  path: JsonPath;
  canRename: boolean;
  currentType: JsonType;
  readonly: boolean;
  validationError?: string;
  moveUpEnabled: boolean;
  moveDownEnabled: boolean;
  onCopyValue: () => void;
  onCopyPath: () => void;
  onRename: () => void;
  onChangeType: (t: JsonType) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

/** Build and show the consolidated row action menu. Returns the Menu (for tests). */
export function openRowMenu(evt: MouseEvent, opts: RowMenuOptions): Menu {
  const menu = new Menu();

  if (opts.validationError) {
    menu.addItem((i) => i.setTitle(`⚠ ${opts.validationError}`).setDisabled(true));
    menu.addSeparator();
  }

  menu.addItem((i) => i.setTitle("Copy value").setIcon("copy").onClick(() => opts.onCopyValue()));
  menu.addItem((i) =>
    i.setTitle("Copy path").setIcon("route").onClick(() => opts.onCopyPath()),
  );

  if (!opts.readonly) {
    if (opts.canRename) {
      menu.addItem((i) =>
        i.setTitle("Rename key").setIcon("pencil").onClick(() => opts.onRename()),
      );
    }
    menu.addItem((i) => {
      i.setTitle("Change type").setIcon("shapes");
      const sub = i.setSubmenu();
      for (const t of TYPES) {
        sub.addItem((si) => {
          si.setTitle(LABELS[t]);
          if (t === opts.currentType) {
            si.setDisabled(true);
          } else {
            si.onClick(() => opts.onChangeType(t));
          }
        });
      }
    });
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("Move up").setIcon("arrow-up").setDisabled(!opts.moveUpEnabled).onClick(() =>
        opts.onMoveUp(),
      ),
    );
    menu.addItem((i) =>
      i
        .setTitle("Move down")
        .setIcon("arrow-down")
        .setDisabled(!opts.moveDownEnabled)
        .onClick(() => opts.onMoveDown()),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("Delete").setIcon("trash-2").setWarning(true).onClick(() => opts.onDelete()),
    );
  }

  menu.showAtMouseEvent(evt);
  return menu;
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run tests/obsidian/RowMenu.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/RowMenu.ts tests/obsidian/RowMenu.test.ts
git commit -m "feat(mobile): RowMenu — consolidated long-press action menu"
```

---

## Task 4: TreeView `touchMode` — suppress inline UI + drag on touch

**Files:**
- Modify: `src/obsidian/TreeView.ts` (interface ~L11-33; `attachStructuralActions` ~L232; `attachCopyButtons` ~L667; `render` ~L159)
- Test: `tests/obsidian/TreeView.touch.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/obsidian/TreeView.touch.test.ts`)

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

describe("TreeView touch mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not set draggable or render drag handles on touch", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { touchMode: true });
    view.setValue([1, 2, 3]);
    const rows = container.querySelectorAll<HTMLElement>(".json-row");
    rows.forEach((r) => expect(r.getAttribute("draggable")).toBeNull());
    expect(container.querySelector(".json-drag-handle")).toBeNull();
  });

  it("does not render inline row actions or copy buttons on touch", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { touchMode: true });
    view.setValue({ a: 1 });
    expect(container.querySelector(".json-row-actions")).toBeNull();
    expect(container.querySelector(".json-copy-btn")).toBeNull();
  });

  it("desktop (touchMode falsy) still renders drag handles + actions + copy buttons", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1 });
    expect(container.querySelector(".json-drag-handle")).not.toBeNull();
    expect(container.querySelector(".json-row-actions")).not.toBeNull();
    expect(container.querySelector(".json-copy-btn")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/TreeView.touch.test.ts` · Expected: FAIL (draggable still "true"; `touchMode` not a known option but TS in tests is loose; the assertions fail).

- [ ] **Step 3: Add `touchMode` to the interface** — in `TreeViewOptions` (`TreeView.ts:11`), add after `readonly?`:

```ts
  /** When true (Obsidian mobile), suppress hover/DnD affordances; actions come
   *  from a long-press menu instead. Injected from JsonFileView's Platform.isMobile. */
  touchMode?: boolean;
```

- [ ] **Step 4: Guard `attachCopyButtons`** — at the top of `attachCopyButtons` (`TreeView.ts:667`), return early on touch:

```ts
  private attachCopyButtons(treeRoot: HTMLElement): void {
    if (this.opts.touchMode) return;
    const rows = treeRoot.querySelectorAll<HTMLElement>(".json-row");
    // ...unchanged...
```

- [ ] **Step 5: Guard the per-row drag/handle/actions block in `attachStructuralActions`** — wrap the handle+draggable+wireDragEvents+RowActions block (`TreeView.ts:242-259`) so that on touch none of it runs (the `AddAffordance` container loop below stays unconditional):

```ts
    rows.forEach((row) => {
      const pathStr = row.getAttribute("data-path");
      if (pathStr === null) return;
      const path = this.parsePathStrSafe(pathStr);
      const lastSeg = path[path.length - 1];
      const canRename = typeof lastSeg === "string";

      if (!this.opts.touchMode) {
        const handle = document.createElement("span");
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
      }
    });
```

- [ ] **Step 6: Run to verify it passes** — Run: `npx vitest run tests/obsidian/TreeView.touch.test.ts tests/obsidian/TreeView.dragdrop.test.ts` · Expected: PASS (touch suppresses; desktop dragdrop unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/TreeView.ts tests/obsidian/TreeView.touch.test.ts
git commit -m "feat(mobile): TreeView touchMode suppresses inline affordances + DnD"
```

---

## Task 5: TreeView touch — `contextmenu` long-press opens RowMenu

**Files:**
- Modify: `src/obsidian/TreeView.ts` (`attachStructuralActions` rows loop; new `onRowContextMenu` + `onChangeType` option already exists)
- Test: `tests/obsidian/TreeView.touch.test.ts` (extend)

TreeView gets a new optional callback `onContextMenu?` that JsonFileView wires to open the RowMenu; this keeps `Menu` out of `TreeView` (the callback receives row metadata). The `contextmenu` listener is attached per row **only in touch mode**.

- [ ] **Step 1: Write the failing test** (append to `tests/obsidian/TreeView.touch.test.ts`)

```ts
  it("long-press (contextmenu) on a row in touch mode calls onContextMenu with path + event", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: { pathStr: string }[] = [];
    const view = new TreeView(container, {
      touchMode: true,
      onContextMenu: (evt, path) => calls.push({ pathStr: path.join(".") }),
    });
    view.setValue({ a: 1, b: 2 });
    const row = container.querySelector<HTMLElement>('.json-row[data-path="b"]')!;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(calls).toEqual([{ pathStr: "b" }]);
  });

  it("desktop mode does not wire a contextmenu handler", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: unknown[] = [];
    const view = new TreeView(container, { onContextMenu: () => calls.push(1) });
    view.setValue({ a: 1 });
    const row = container.querySelector<HTMLElement>('.json-row[data-path="a"]')!;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(calls).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/TreeView.touch.test.ts -t "contextmenu"` · Expected: FAIL.

- [ ] **Step 3: Add the option** — in `TreeViewOptions` after `onChangeType`:

```ts
  /** Touch-mode only: fired on long-press (contextmenu) of a row. The host opens
   *  the consolidated RowMenu. Receives the originating event and the row path. */
  onContextMenu?: (evt: MouseEvent, path: JsonPath) => void;
```

- [ ] **Step 4: Wire the listener** — inside the `rows.forEach` of `attachStructuralActions`, in the touch branch (the `else` of `if (!this.opts.touchMode)`), add:

```ts
      } else {
        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.opts.onContextMenu?.(e as MouseEvent, path);
        });
      }
```

(So the `if (!this.opts.touchMode) { ...desktop... } else { ...contextmenu... }`.)

- [ ] **Step 5: Run to verify it passes** — Run: `npx vitest run tests/obsidian/TreeView.touch.test.ts` · Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/TreeView.ts tests/obsidian/TreeView.touch.test.ts
git commit -m "feat(mobile): TreeView fires onContextMenu on touch long-press"
```

---

## Task 6: TreeView — `Alt+Arrow` keyboard reorder (desktop + touch)

**Files:**
- Modify: `src/obsidian/TreeView.ts` (`handleKeydown` ~L592 ArrowUp/Down cases; new private `moveActive`)
- Test: `tests/obsidian/TreeView.keyboard.test.ts` (extend)

- [ ] **Step 1: Write the failing test** (append to `tests/obsidian/TreeView.keyboard.test.ts`)

```ts
  const dispatchAltKey = (target: HTMLElement, key: string): boolean => {
    const ev = new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true });
    return target.dispatchEvent(ev);
  };

  it("Alt+ArrowDown on an array item calls onMoveItem(parent, from, from+1)", () => {
    const moves: { fromIdx: number; toIdx: number }[] = [];
    tv = new TreeView(container, { onMoveItem: (_p, fromIdx, toIdx) => moves.push({ fromIdx, toIdx }) });
    tv.setValue([10, 20, 30]);
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    rowAt(container, "[0]").focus();
    dispatchAltKey(treeRoot, "ArrowDown");
    expect(moves).toEqual([{ fromIdx: 0, toIdx: 1 }]);
  });

  it("Alt+ArrowUp on the first array item is a no-op", () => {
    const moves: unknown[] = [];
    tv = new TreeView(container, { onMoveItem: () => moves.push(1) });
    tv.setValue([10, 20, 30]);
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    rowAt(container, "[0]").focus();
    dispatchAltKey(treeRoot, "ArrowUp");
    expect(moves).toEqual([]);
  });

  it("Alt+ArrowUp on an object key calls onMoveKey(parent, key, pos-1)", () => {
    const moves: { key: string; toPos: number }[] = [];
    tv = new TreeView(container, { onMoveKey: (_p, key, toPos) => moves.push({ key, toPos }) });
    tv.setValue({ a: 1, b: 2, c: 3 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    rowAt(container, "b").focus();
    dispatchAltKey(treeRoot, "ArrowUp");
    expect(moves).toEqual([{ key: "b", toPos: 0 }]);
  });
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/TreeView.keyboard.test.ts -t "Alt+"` · Expected: FAIL (Alt+Arrow currently just navigates).

- [ ] **Step 3: Branch the ArrowUp/ArrowDown cases** — in `handleKeydown` (`TreeView.ts:593` & `:601`), at the very start of each case, intercept the Alt modifier:

```ts
      case "ArrowDown": {
        if (e.altKey) {
          e.preventDefault();
          this.moveActive(active, +1);
          return;
        }
        const next = rows[idx + 1];
        // ...unchanged...
      }
      case "ArrowUp": {
        if (e.altKey) {
          e.preventDefault();
          this.moveActive(active, -1);
          return;
        }
        const prev = rows[idx - 1];
        // ...unchanged...
      }
```

- [ ] **Step 4: Add the `moveActive` helper** (new private method on `TreeView`):

```ts
  /** Reorder the active row within its parent by `dir` (-1 up / +1 down). Shared
   *  by Alt+Arrow and the touch RowMenu's Move up/down. No-op at the bounds. */
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
      const keys = Object.keys(parent as Record<string, unknown>);
      const pos = keys.indexOf(lastSeg);
      const toPos = pos + dir;
      if (pos === -1 || toPos < 0 || toPos >= keys.length) return;
      this.opts.onMoveKey?.(parentPath, lastSeg, toPos);
    }
  }
```

- [ ] **Step 5: Run to verify it passes** — Run: `npx vitest run tests/obsidian/TreeView.keyboard.test.ts` · Expected: PASS (incl. existing nav tests; Alt is only consumed when present).

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/TreeView.ts tests/obsidian/TreeView.keyboard.test.ts
git commit -m "feat(a11y): Alt+ArrowUp/Down reorders the active row"
```

---

## Task 7: JsonFileView — pass `touchMode` + wire RowMenu callbacks

**Files:**
- Modify: `src/obsidian/JsonFileView.ts` (imports L1; `refreshMode` ~L388; new `openRowMenuFor`)
- Test: `tests/obsidian/JsonFileView.mobile.test.ts`

`onContextMenu` from TreeView opens `openRowMenu` with callbacks bound to existing handlers. Move up/down compute the target index from the path (same math as `moveActive`, but here for the menu) and call `handleMoveItem`/`handleMoveKey`. Validation error text comes from the schema-error map.

- [ ] **Step 1: Write the failing test** (`tests/obsidian/JsonFileView.mobile.test.ts`)

```ts
import { Menu, Platform, type WorkspaceLeaf } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;

describe("JsonFileView mobile", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Platform.isMobile = true;
  });
  afterEach(() => {
    Platform.isMobile = false;
  });

  it("renders the tree in touch mode (no draggable rows, no inline copy buttons)", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".json-row[draggable]")).toBeNull();
    expect(v.contentEl.querySelector(".json-copy-btn")).toBeNull();
  });

  it("long-press on a row opens a Menu with the row operations", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1,"b":2}', false);
    const row = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="a"]')!;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    // The most recently constructed Menu is the row menu.
    // openRowMenu builds it; assert a Menu was shown with a Delete entry.
    // (We assert via the DOM-independent Menu mock through a spy below.)
  });
});
```

> Note: asserting the `Menu` contents from the view test is awkward because `openRowMenu` constructs its own `Menu`. Keep the view test focused on the **touch render** (first test) and the **Move-index math** (next step); `RowMenu` content is already covered by Task 3. Replace the second `it` above with the Move-index test in Step 3.

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/JsonFileView.mobile.test.ts -t "touch mode"` · Expected: FAIL (rows still draggable; copy buttons present — touchMode not passed yet).

- [ ] **Step 3: Replace the second test with a Move-index test**

```ts
  it("RowMenu Move down on first array item moves it to index 1", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20,30]", false);
    v.moveRow(["0".length ? 0 : 0], +1); // see test helper note
    expect(JSON.parse(v.getViewData())).toEqual([20, 10, 30]);
  });
```

> Implementation note: rather than reach through the menu, expose a tiny internal seam `moveRow(path, dir)` on `JsonFileView` used by BOTH the RowMenu callbacks and verifiable directly. If you prefer not to widen the public surface, instead assert by invoking the menu callback: capture the `Menu` via `vi.spyOn` on the mock. The seam is simpler and is the chosen approach.

  Adjust the test to use a real path:

```ts
    v.moveRow([0], +1);
    expect(JSON.parse(v.getViewData())).toEqual([20, 10, 30]);
```

- [ ] **Step 4: Implement in `JsonFileView.ts`**

  4a. Imports (`JsonFileView.ts:1`): add `Platform` and `Menu`-using `openRowMenu`:

```ts
import { Notice, Platform, Scope, TFile, TextFileView, type WorkspaceLeaf, normalizePath } from "obsidian";
// ...existing core imports...
import { openRowMenu } from "./RowMenu";
import { copyJsonPath, copyJsonValue } from "./clipboard";
```

  4b. Pass `touchMode` + `onContextMenu` in `refreshMode` (`JsonFileView.ts:388`, the `new TreeView(...)` opts):

```ts
        readonly: this.lossyRoundtrip,
        touchMode: Platform.isMobile,
        // ...existing callbacks...
        onContextMenu: (evt, path) => this.openRowMenuFor(evt, path),
```

  4c. Add `moveRow` + `openRowMenuFor` (new private methods):

```ts
  /** Reorder the value at `path` within its parent by dir (-1 up / +1 down).
   *  Shared seam for the touch RowMenu's Move up/down. No-op at the bounds. */
  moveRow(path: JsonPath, dir: -1 | 1): void {
    const lastSeg = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const parent = this.valueAt(parentPath);
    if (typeof lastSeg === "number" && Array.isArray(parent)) {
      const toIdx = lastSeg + dir;
      if (toIdx < 0 || toIdx >= parent.length) return;
      this.handleMoveItem(parentPath, lastSeg, toIdx);
    } else if (typeof lastSeg === "string" && parent !== null && typeof parent === "object") {
      const keys = Object.keys(parent as Record<string, JsonValue>);
      const pos = keys.indexOf(lastSeg);
      const toPos = pos + dir;
      if (pos === -1 || toPos < 0 || toPos >= keys.length) return;
      this.handleMoveKey(parentPath, lastSeg, toPos);
    }
  }

  private valueAt(path: JsonPath): JsonValue {
    let cur: JsonValue = this.currentValue;
    for (const seg of path) {
      if (Array.isArray(cur) && typeof seg === "number") cur = cur[seg];
      else if (cur !== null && typeof cur === "object" && typeof seg === "string")
        cur = (cur as { [k: string]: JsonValue })[seg];
      else return null;
    }
    return cur;
  }

  private openRowMenuFor(evt: MouseEvent, path: JsonPath): void {
    const value = this.valueAt(path);
    const lastSeg = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const parent = this.valueAt(parentPath);
    let pos = -1;
    let siblingCount = 0;
    if (typeof lastSeg === "number" && Array.isArray(parent)) {
      pos = lastSeg;
      siblingCount = parent.length;
    } else if (typeof lastSeg === "string" && parent !== null && typeof parent === "object") {
      const keys = Object.keys(parent as Record<string, JsonValue>);
      pos = keys.indexOf(lastSeg);
      siblingCount = keys.length;
    }
    const errMap = this.currentSchema
      ? pathErrorsToMap(this.currentSchema.validate(this.currentValue))
      : new Map<string, string>();
    const key = path.length === 0 ? "root" : pathToString(path);
    openRowMenu(evt, {
      value,
      path,
      canRename: typeof lastSeg === "string",
      currentType: jsonTypeOf(value),
      readonly: this.lossyRoundtrip,
      validationError: errMap.get(key),
      moveUpEnabled: pos > 0,
      moveDownEnabled: pos >= 0 && pos < siblingCount - 1,
      onCopyValue: () => copyJsonValue(value),
      onCopyPath: () => copyJsonPath(path),
      onRename: () => this.startRenameViaMenu(path),
      onChangeType: (t) => this.handleChangeType(path, t),
      onMoveUp: () => this.moveRow(path, -1),
      onMoveDown: () => this.moveRow(path, +1),
      onDelete: () => this.handleDelete(path),
    });
  }

  private startRenameViaMenu(path: JsonPath): void {
    // Reuse the tree's inline rename by simulating a focus + F2 on the row.
    const pathStr = path.length === 0 ? "root" : pathToString(path);
    const row = this.bodyEl.querySelector<HTMLElement>(`.json-row[data-path="${pathStr.replace(/"/g, '\\"')}"]`);
    const keyEl = row?.querySelector<HTMLElement>(".json-key");
    keyEl?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
  }
```

> `jsonTypeOf` helper: add a small module-level function in `JsonFileView.ts` mirroring the one in TreeView (null/array/typeof) — or import a shared one. To avoid duplication, add `export function jsonTypeOf(v: JsonValue): JsonType` to `src/core/edit.ts` (pure) and import it in both TreeView and JsonFileView. Implement that extraction here:

```ts
// src/core/edit.ts (add + export)
export function jsonTypeOf(value: JsonValue): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    default: return "object";
  }
}
```
  Then in `TreeView.ts` replace the local `typeOfJsonValue` with the imported `jsonTypeOf` (or keep TreeView's local one and just import in JsonFileView — either is fine; prefer the shared core function and delete the TreeView duplicate). Update `tests/core/edit.changeType.test.ts` only if it asserts on the helper (it likely does not).

> **Rename-via-menu caveat:** the F2-simulation approach depends on the row keydown handler. If the smoke test shows it unreliable, the fallback is to expose `treeView.startRenameAt(path)` as a public method on `TreeView` that calls the existing private `startRename`. Prefer adding `startRenameAt(path)` to TreeView for robustness:

```ts
  // TreeView.ts (public)
  startRenameAt(path: JsonPath): void {
    const pathStr = pathToString(path);
    const row = this.container.querySelector<HTMLElement>(
      `.json-row[data-path="${cssEscapeAttr(pathStr)}"]`,
    );
    const lastSeg = path[path.length - 1];
    if (row && typeof lastSeg === "string") this.startRename(row, path, lastSeg);
  }
```
  and in JsonFileView `onRename: () => this.treeView?.startRenameAt(path)`. **Use this robust approach**, not the F2 simulation.

- [ ] **Step 5: Run to verify it passes** — Run: `npx vitest run tests/obsidian/JsonFileView.mobile.test.ts` · Expected: PASS.

- [ ] **Step 6: Run the full JsonFileView + TreeView suites** — Run: `npx vitest run tests/obsidian/` · Expected: PASS (desktop unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/JsonFileView.ts src/obsidian/TreeView.ts src/core/edit.ts tests/obsidian/JsonFileView.mobile.test.ts
git commit -m "feat(mobile): wire long-press RowMenu in JsonFileView (move/rename/type/delete/copy)"
```

---

## Task 8: JsonFileView — mobile undo/redo toolbar buttons

**Files:**
- Modify: `src/obsidian/JsonFileView.ts` (`buildChrome` ~L256-261; new `refreshUndoButtons`; call sites in `applyMutation`/`undo`/`redo`/`restoreText`/`setViewData`/`refreshMode`)
- Test: `tests/obsidian/JsonFileView.mobile.test.ts` (extend)

- [ ] **Step 1: Write the failing test** (append)

```ts
  it("shows mobile undo/redo buttons, disabled initially, enabled after an edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const undoBtn = v.contentEl.querySelector<HTMLButtonElement>(".json-undo-btn")!;
    const redoBtn = v.contentEl.querySelector<HTMLButtonElement>(".json-redo-btn")!;
    expect(undoBtn).not.toBeNull();
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
    // make an edit via the move seam (pushes history)
    v.setViewData("[10,20]", false);
    v.moveRow([0], +1);
    expect(v.contentEl.querySelector<HTMLButtonElement>(".json-undo-btn")!.disabled).toBe(false);
  });

  it("clicking the mobile undo button reverts the last edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10,20]", false);
    v.moveRow([0], +1);
    expect(JSON.parse(v.getViewData())).toEqual([20, 10]);
    v.contentEl.querySelector<HTMLButtonElement>(".json-undo-btn")!.click();
    expect(JSON.parse(v.getViewData())).toEqual([10, 20]);
  });

  it("does NOT render undo/redo buttons on desktop", () => {
    Platform.isMobile = false;
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".json-undo-btn")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/JsonFileView.mobile.test.ts -t "undo"` · Expected: FAIL.

- [ ] **Step 3: Build the buttons in `buildChrome`** — after appending `this.toggleEl` to the toolbar (`JsonFileView.ts:260`), add:

```ts
    if (Platform.isMobile) {
      this.undoBtn = this.makeToolbarIconButton("json-undo-btn", "rotate-ccw", "Undo", () =>
        this.undo(),
      );
      this.redoBtn = this.makeToolbarIconButton("json-redo-btn", "rotate-cw", "Redo", () =>
        this.redo(),
      );
      this.toolbarEl.appendChild(this.undoBtn);
      this.toolbarEl.appendChild(this.redoBtn);
    }
```

  Add the fields (near L42-47):

```ts
  private undoBtn: HTMLButtonElement | null = null;
  private redoBtn: HTMLButtonElement | null = null;
```

  Add the factory + refresh helpers (new private methods):

```ts
  private makeToolbarIconButton(
    cls: string,
    icon: string,
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = `json-toolbar-btn ${cls}`;
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    setIcon(btn, icon);
    btn.addEventListener("click", () => onClick());
    return btn;
  }

  private refreshUndoButtons(): void {
    if (this.undoBtn) this.undoBtn.disabled = !this.canUndo();
    if (this.redoBtn) this.redoBtn.disabled = !this.canRedo();
  }
```

  Import `setIcon` (add to the obsidian import in L1):

```ts
import { Notice, Platform, Scope, TFile, TextFileView, type WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
```

- [ ] **Step 4: Call `refreshUndoButtons()`** at the end of: `applyMutation`, `undo`, `redo`, `restoreText`, `setViewData` (after the early-empty return paths and the main path), and `refreshMode`. (Each call site: append `this.refreshUndoButtons();`.)

- [ ] **Step 5: Run to verify it passes** — Run: `npx vitest run tests/obsidian/JsonFileView.mobile.test.ts` · Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/JsonFileView.ts tests/obsidian/JsonFileView.mobile.test.ts
git commit -m "feat(mobile): undo/redo toolbar buttons with live disabled state"
```

---

## Task 9: TypeMenu — `pointerdown` close hardening (minor)

**Files:**
- Modify: `src/obsidian/TypeMenu.ts:62-68`
- Test: `tests/obsidian/TypeMenu.test.ts` (extend)

- [ ] **Step 1: Write the failing test** (append to the `describe`)

```ts
  it("pointerdown outside closes the menu (touch-laptop hardening)", () => {
    const anchor = document.createElement("button");
    const elsewhere = document.createElement("div");
    document.body.append(anchor, elsewhere);
    openTypeMenu(anchor, { currentType: "string", onPick: () => {} });
    elsewhere.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.querySelector(".json-type-menu")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/obsidian/TypeMenu.test.ts -t "pointerdown"` · Expected: FAIL.

- [ ] **Step 3: Listen on `pointerdown` too** — in `openTypeMenu`, rename `onMousedown`→`onPointerOutside`, register on both events, and clean both up:

```ts
  const onPointerOutside = (e: Event) => {
    const t = e.target as Node | null;
    if (t && menu.contains(t)) return;
    closeActiveMenu();
  };
  doc.addEventListener("keydown", onKeydown);
  doc.addEventListener("mousedown", onPointerOutside);
  doc.addEventListener("pointerdown", onPointerOutside);

  const close = () => {
    doc.removeEventListener("keydown", onKeydown);
    doc.removeEventListener("mousedown", onPointerOutside);
    doc.removeEventListener("pointerdown", onPointerOutside);
    menu.remove();
    if (activeMenu?.el === menu) activeMenu = null;
  };
```

- [ ] **Step 4: Run** — Run: `npx vitest run tests/obsidian/TypeMenu.test.ts` · Expected: PASS (incl. the existing mousedown test).

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/TypeMenu.ts tests/obsidian/TypeMenu.test.ts
git commit -m "fix: close TypeMenu on pointerdown as well as mousedown"
```

---

## Task 10: `styles.css` — `body.is-mobile` + `:focus-within` copy reveal

**Files:**
- Modify: `styles.css`
- Test: `tests/styles.mobile.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/styles.mobile.test.ts`)

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

describe("mobile styles", () => {
  it("reveals the copy button on :focus-within (4.3.1)", () => {
    expect(css).toMatch(/\.json-row:focus-within\s+\.json-copy-btn/);
  });
  it("has a body.is-mobile rule enlarging the collapse toggle tap target", () => {
    expect(css).toMatch(/body\.is-mobile[\s\S]*\.json-collapse-toggle/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/styles.mobile.test.ts` · Expected: FAIL.

- [ ] **Step 3: Add the CSS** — append near the end of `styles.css` (before or after the reduced-motion block):

```css
/* ─── Copy button: reveal without hover (keyboard / touch-laptop, 4.3.1) ─── */
.json-row:focus-within .json-copy-btn {
  opacity: 0.7;
}

/* ─── Mobile: larger tap targets; no hover-only affordances ──────────────── */
body.is-mobile .json-collapse-toggle {
  min-width: 44px;
  min-height: 44px;
  margin: -15px 0; /* keep visual size; grow only the hit area */
}
```

- [ ] **Step 4: Run** — Run: `npx vitest run tests/styles.mobile.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add styles.css tests/styles.mobile.test.ts
git commit -m "style(mobile): focus-within copy reveal + 44px collapse tap target"
```

---

## Task 11: Release prep — 1.8.0

**Files:**
- Modify: `manifest.json`, `package.json`, `versions.json`, `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Bump versions** — `manifest.json` `version` → `1.8.0` (keep `minAppVersion: 1.5.7`); `package.json` `version` → `1.8.0`; add `"1.8.0": "1.5.7"` to `versions.json`.

- [ ] **Step 2: CHANGELOG** — add a `## 1.8.0` section summarizing: consolidated mobile long-press action menu; `Alt+Arrow` keyboard reorder; mobile undo/redo toolbar buttons; touch tap-target + focus-within copy reveal; TypeMenu pointerdown fix. Note: no desktop behavior change beyond the additive `Alt+Arrow`/focus-within.

- [ ] **Step 3: README** — add a short "Mobile" subsection: long-press a row for the action menu (copy/rename/change type/move/delete); undo/redo buttons in the toolbar; reorder via the menu or `Alt+Arrow`.

- [ ] **Step 4: Commit**

```bash
git add manifest.json package.json versions.json CHANGELOG.md README.md
git commit -m "chore(release): 1.8.0 — mobile interaction model"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full suite** — Run: `npm test` · Expected: all green (537 + new tests).
- [ ] **Step 2: Build** — Run: `npm run build` · Expected: clean.
- [ ] **Step 3: Biome** — Run: `npm run lint` (or the project's biome script) · Expected: clean.
- [ ] **Step 4: Obsidian lint** — Run: `npm run lint:obsidian` · Expected: clean (no NEW errors; pre-existing `prefer-active-doc` warnings unchanged).
- [ ] **Step 5: Coverage sanity** — Run: `npm run test:coverage` · Expected: no regression below prior thresholds.

---

## Self-Review (filled at write time)

**Spec coverage:** §4.2 → Tasks 3/6/7 (move via menu + Alt+Arrow). §4.3 → Tasks 4/10 (no inline hover UI on touch; focus-within copy). §4.4 → Task 10 (44px toggle). §4.5 → Task 8 (undo/redo buttons). §4.8 → Task 4 (no draggable on touch). §6.10 → Tasks 3/5/7 (long-press menu). D1–D4 all covered (D1 Task 5; D2 Task 6; D3 Task 8; D4 Tasks 3/7). Optional TypeMenu hardening → Task 9.

**Placeholder scan:** none — every step has concrete code/commands. The two known-uncertain items (`contextmenu` reliability, `setSubmenu` availability) are explicit smoke-test verifications in the spec, with named fallbacks (touch-hold timer; flatten type entries). Rename-via-menu resolved to the robust `startRenameAt` seam (not F2 simulation).

**Type consistency:** `touchMode`/`onContextMenu` added to `TreeViewOptions` and consumed in Tasks 4/5/7. `moveRow(path, dir)` / `valueAt` / `openRowMenuFor` / `refreshUndoButtons` / `makeToolbarIconButton` / `startRenameAt` referenced consistently. `jsonTypeOf` extracted to `core/edit.ts` and used in both views. `RowMenuOptions` fields match the Task 3 interface and the Task 7 call site.
