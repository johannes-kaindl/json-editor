---
paths:
  - "src/core/render.ts"
  - "src/core/render-budget.ts"
  - "src/obsidian/TreeView.ts"
  - "src/obsidian/RowActions.ts"
  - "src/obsidian/RowMenu.ts"
  - "src/obsidian/AddAffordance.ts"
  - "src/obsidian/TypeMenu.ts"
  - "src/obsidian/Tooltip.ts"
  - "src/obsidian/Breadcrumb.ts"
  - "src/obsidian/CopyButton.ts"
  - "src/obsidian/*Banner.ts"
  - "src/obsidian/dom.ts"
  - "src/obsidian/SearchBar.ts"
  - "src/obsidian/GoToPathModal.ts"
  - "tests/obsidian/TreeView*.test.ts"
  - "tests/obsidian/RowMenu*.test.ts"
  - "tests/obsidian/RowActions*.test.ts"
  - "tests/obsidian/Tooltip*.test.ts"
  - "styles.css"
  - "tests/styles.*.test.ts"
  - "tests/core/render*.test.ts"
---

# Baum-Darstellung, Menüs und CSS — Gotchas

Gotchas zu Rendering, Zeilen-Bedienung und `styles.css`.

- **`Tooltip.ts`:** `ttHeight = 60` hardcoded for above/below position-flip; long previews can overflow. Candidate to measure dynamically.
- **`onPathClick`:** fires N times for nested clicks (once per ancestor row via capture-phase listener); callers must be idempotent. Current callers (`Breadcrumb.setPath`) are.
- **The separator comma is an element docked to its value** (`appendSeparatorComma()` in `core/render.ts`, `.json-comma`): inside the container for container values, where it follows the collapse chip (collapsed) or the closing bracket (expanded). A bare text node in the `display: flex` row floats free, placed after the value's whole box. `.json-content.collapsed` is `display: none`: with `max-height: 0` a collapsed subtree still reserves the intrinsic width of its hidden children, which pushed the comma right by a different amount on every row. Guarded by a CSS test. Truncated long values (`TRUNCATE_AT` = 120 in `core/render.ts`) put a show-more chip last in the row, so the comma must dock before it (`tests/core/render.comma-truncated.test.ts`).
- **`scrollToPath` must expand the target's ancestors** (`expandAncestorsOf` in `TreeView.ts`): with `display: none` on collapsed subtrees it was once a complete no-op and the breadcrumb was dead on collapsed branches for a month.
- **A full re-render keeps expand, scroll and focus state** (`tests/obsidian/TreeView.rerender-state.test.ts`).
- **The render budget is re-checked on every mode switch** (`exceedsRenderBudget` in `JsonFileView.ts`): a file that grew in-session must not bypass the large-file guard.
- **A class `display` beats the `hidden` attribute.** Elements that must be hideable need an explicit `[hidden] { display: none }` rule (the large-file "Load tree anyway" button and the search ✕ showed when they should not); `tests/styles.hidden.test.ts` guards it.
- **A tree edit must not leave focus on a detached element.** An inline editor that leaves focus on its own already-detached `<input>` makes the next `replaceChildren()` abort on the blur with `NotFoundError`, and the undo command then reports itself as "not applicable" (the first Ctrl/Cmd+Z after a tree edit did nothing, 1.11.3). happy-dom computes no layout and does not reproduce it; only the rename path is unit-tested.
- **`innerHTML` is banned** (Review gate): use `replaceChildren()`; a regression lint over `src/` enforces it. Create elements through the shorthand helpers or the injected element factory (`src/obsidian/dom.ts` `elementFactory`/`makeEl`; `core/render.ts` takes `RenderOptions.makeEl` and never calls `createElement`).
- **No `max-height` clipping** on tree content (the old `max-height: 5000px` clipped rows beyond ~200); `tests/styles.maxHeight.test.ts` guards it.
- **Touch targets are 44 px and mobile uses a long-press `Menu`** (`RowMenu.ts`) instead of hover affordances and drag-and-drop (`Platform.isMobile`); `touchMode` is injected into `TreeView`, which keeps it `Platform`-free and testable.
