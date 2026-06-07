# Changelog

All notable changes to **Obsidian JSON Editor** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions follow Obsidian's plugin convention of no `v` prefix on git tags (e.g. `0.1.1`, not `v0.1.1`).

## [Unreleased]

### Changed
- **Relicensed from GPL-3.0-or-later to AGPL-3.0-or-later.** Documentation is now licensed separately under CC BY-SA 4.0 (see `LICENSE-DOCS`). Part of adopting the shared workspace conventions.
- Adopted **Biome** for linting/formatting; added `lint` and `typecheck` npm scripts.

## [1.3.0] — 2026-05-27

**JSON Schema validation in real time.** Drop a companion schema file next to any `.json` you edit, and the plugin highlights validation errors as you type. Closes the 1.x roadmap.

### Added
- **JSON Schema validation** via [Ajv](https://ajv.js.org/) (v8). Default behavior: when you open `data.json`, the plugin looks for `data.schema.json` in the same folder; if found, every change in tree or source mode is validated against the schema.
- **Schema banner** above the editor body shows the current error count (`"3 schema errors — hover the red rows for details"`). Hidden when the document is valid; switches to a yellow "schema not loaded" variant if the schema file itself is malformed.
- **Inline row markers** — every tree row corresponding to a validation error gets a red outline + a hover-tooltip with the human-readable message.
- **Two new settings**:
  - `validateAgainstSchema` (default `true`) — master switch.
  - `companionSchemaSuffix` (default `.schema.json`) — change to e.g. `.json-schema` if your conventions differ.
- **New runtime dependency**: `ajv@8`.

### Internal
- New pure module `src/core/schema.ts` — `compileSchema(text)` returns a discriminated union (`{ok, schema}` | `{ok: false, error}`); the compiled schema has a `validate(value): PathError[]` that converts Ajv's `instancePath` JSON-Pointer to our `JsonPath` segment array (including `~0`/`~1` decoding).
- New `src/obsidian/SchemaBanner.ts` UI component with `setErrors(n)` + `setSchemaParseError(msg)` + `hide()`.
- `TreeView.setValidationErrors(map)` adds `.json-row-error` class + `title` attribute on offending rows; persists across re-renders.
- `JsonFileView` gains `setSchema(text)` (public for tests/manual) and an async `tryLoadCompanionSchema()` that reads the sibling via `app.vault.cachedRead` on file open. Best-effort: silent failure if the vault is unavailable.
- 33 new tests (12 schema core, 6 SchemaBanner, 5 TreeView row-marker, 6 JsonFileView integration, +4 settings extension). Total: 373 → 402.

### Notes
- **Bundle size**: `main.js` grows from ~37 KB to ~163 KB. The vast majority is Ajv; that is the cost of "real" JSON Schema. If you prefer the older lightweight bundle and don't need validation, turn the setting off — the validator code is still bundled but never runs.
- **`$schema` URL fetching is out of scope.** The plugin treats `$schema` inside your data as metadata; it does not fetch remote schemas. Companion-file pattern is the canonical wire-up.

## [1.2.0] — 2026-05-27

**Unified cross-mode undo/redo.** Tree mode and source mode now share a single 100-deep text-based history. `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` work in both modes; switching between tree and source no longer wipes the undo stack.

### Changed
- **Unified history**: every change — tree-mode mutation or source-mode text edit — pushes the pre-state TEXT onto a single shared stack. Undo/redo restore that text and refresh the active mode.
- Mode-switch no longer clears the undo history.
- Source mode no longer keeps a separate CodeMirror-local undo stack; the unified history captures every doc change. Trade-off: `Cmd+Z` in source mode now undoes per `onChange` event (roughly per keystroke) rather than via CodeMirror's character-grouping heuristic. In practice this is similar granularity.

### Internal
- `History` is now generic (`History<T>`). `JsonFileView` uses `History<string>` instead of the previous tree-only `History<HistoryState>`. The old `HistoryState` interface is gone; the new API takes and returns the raw `T`.
- Plugin command IDs renamed: `undo-tree-edit` → `undo-edit`, `redo-tree-edit` → `redo-edit`. Hotkey bindings are unchanged.
- 4 new integration tests in `JsonFileView.undo.test.ts` covering source-mode undo, source→tree cross-mode undo, tree→source cross-mode undo, and the canUndo / canRedo mode-independence guarantee.
- Test count: 369 → 373 (existing tree-history tests reused as-is via generic typing).

## [1.1.0] — 2026-05-27

**Reorder and retype.** 1.0.0 made tree mode CRUD-capable. 1.1.0 closes the polish gap: drag any row to a new position in its container, and switch any value to a different JSON type from a single button.

### Added
- **Drag-and-drop reorder** — hover any row to reveal a `⋮⋮` drag-handle. Drag the row up or down within the same container; a colored line indicates the drop position. Works for both array items and object keys. Cross-container moves are intentionally out of scope.
- **Type-switching** — every row gets a `T` action button (alongside ✎ + ✕). Click → small inline menu lists all six JSON types (`String`, `Number`, `Boolean`, `Null`, `Object`, `Array`). The current type is shown disabled; picking another type replaces the value with a sensible default (`""`, `0`, `false`, `null`, `{}`, `[]`). Type changes are destructive but undoable — use `Cmd/Ctrl+Z` to revert.
- **Pure-core ops** — `moveArrayItem`, `moveObjectKey`, `changeType`, and `computeInsertionIndex` in `src/core/edit.ts`, plus the `JsonType` export. All fully unit-tested in isolation.

### Changed
- Test count: 262 → 369 (+107: 79 core edit, 8 TypeMenu, 4 RowActions extension, 11 TreeView dragdrop, 5 JsonFileView reorder integration).

### Notes
- Drag-drop is **same-parent only** by design — moving a row from one container into another is deferred (it raises path-validation and type-mismatch questions that warrant a separate spec).
- Type changes do not preserve content across the change. Converting `{a: 1, b: 2}` to `array` produces `[]`, not `[1, 2]`. This is intentional and consistent: the type-menu is a destructive shortcut, not a data-migration tool.

## [1.0.0] — 2026-05-27

**1.0.0 marks the point where the tree view becomes a real editor.** You can now do every basic structural edit (add / delete / rename keys, add / delete items) directly in tree mode, with full undo/redo support — no round-trip through source mode required for routine work.

### Added
- **Add object keys** — every container has a "+ Add key" affordance at the bottom of its content. Click → inline input → Enter to commit (empty value `null`).
- **Add array items** — same affordance, labeled "+ Add item" for arrays; click immediately appends a `null`.
- **Delete rows** — hover any row to reveal a ✕ button (also `Backspace` / `Delete` on the focused row). Undo restores it.
- **Rename keys** — hover any object-key row to reveal a ✎ button. Click → key span becomes an inline input → Enter commits, Esc cancels. Validates against empty + duplicate keys (shown as a Notice).
- **Undo / Redo** — `Cmd/Ctrl+Z` undoes the last structural or value edit; `Cmd/Ctrl+Shift+Z` redoes. Tree-mode only — source mode keeps CodeMirror's native history (cross-mode unified undo is deferred to 1.2.0). Capacity 100 entries.
- **Pure-core mutation API** — `addObjectKey`, `addArrayItem`, `deleteAt`, `renameKey` in `src/core/edit.ts` and a `History` class in `src/core/history.ts`, both fully unit-tested without DOM.
- **Empty containers now render with full container scaffolding** (toggle + brackets + chip + content slot + close) instead of a single `{}` / `[]` span. Lets you `+ Add` to an empty container without first switching to source.

### Changed
- Switching mode (tree ⇄ source) clears the tree-mode undo history. The source mode has its own CodeMirror history; mixing the two would be confusing in this iteration.
- `RenderOptions` gains nothing — render.ts stays pure. All structural actions are attached post-render in `TreeView.attachStructuralActions()` (same pattern as `attachCopyButtons`).
- Test count: 205 → 262 (+57: 24 core edit, 10 history, 6 RowActions, 7 AddAffordance, 10 undo integration; existing tests stay green).

### Notes — explicitly NOT in 1.0.0 (deferred)
- **Drag-and-drop reorder** → 1.1.0
- **Type-switching** (string ↔ number ↔ boolean ↔ null ↔ object ↔ array) → 1.1.0
- **Cross-mode unified undo/redo** (Source + Tree shared stack) → 1.2.0
- **JSON Schema validation** via ajv → 1.3.0 (or could ship as a separate plugin)

The original 1.0.0 roadmap conflated all five into one release. Scope-decomposed into focused milestones; each gets its own spec when picked up.

## [0.3.0] — 2026-05-27

### Added
- **Keyboard navigation** through the tree (WAI-ARIA tree pattern):
  - `Tab` focuses the active row (roving tabindex).
  - `↓` / `↑` move between visible rows.
  - `→` expands a collapsed container, or jumps to the first child row inside an expanded one.
  - `←` collapses an expanded container, or jumps to the parent row.
  - `Home` / `End` jump to the first / last visible row.
  - `Enter` / `F2` trigger inline-edit on a row's primitive value.
- **ARIA roles**: tree-root carries `role="tree"` + `aria-label="JSON content"`; containers carry `role="treeitem"` + `aria-expanded` synced with collapse state; child wrappers carry `role="group"`; every row carries `role="treeitem"`.
- **Coverage tooling**: `@vitest/coverage-v8` and a new `npm run test:coverage` script. Baseline: 92.9% statements, 87.1% branches, 91.8% functions.

### Changed
- **Render refactor**: `renderObject` and `renderArray` collapsed into a single `renderContainer(parent, items, path, depth, opts, kind)` plus three small helpers (`bracketsFor`, `keyOrIndexElement`, `collapseChipLabel`). `src/core/render.ts` lost ~50 LOC of duplicated scaffolding; structural parity verified by a new test.
- Tree filter skipping is now keyboard-aware: arrow nav walks only visible rows (honours `.json-filter-active` and ancestor `.collapsed`).
- Test count: 181 → 205 (+24: 9 ARIA, 14 keyboard nav, +1 render parity).

### Notes
- No visible UX change for mouse users. The only thing they may notice is that the tree now gets a Tab stop.
- Out of scope (deferred): screen-reader-specific `aria-live` announcements, multi-select, type-ahead key-search, keyboard-shortcut help overlay.

## [0.2.0] — 2026-05-27

### Added
- **Search & Filter** — live search bar in the tree-view toolbar that strict-filters the tree to keys and primitive values matching the query (case-insensitive substring). Ancestors of matches stay visible; non-matching siblings are hidden. Auto-expands collapsed containers that contain a match. Match count displayed next to the input ("3 matches" / "no matches").
- **`Cmd/Ctrl+F` hotkey** in any JSON view focuses the search bar (switches to tree mode first if you're in source).
- **ESC behavior** in the search input: clears the query if non-empty; blurs the input if already empty.
- **Clear button (×)** in the search input.
- **`findMatches()`** pure function in `src/core/search.ts` — value-walks the tree and returns match + on-path path sets with key/value counts.
- **`TreeView.applyFilter(query)`** API — applies CSS classes to the existing DOM via `data-path` attribute lookup; renderer is not touched.

### Changed
- Toolbar layout now hosts `Breadcrumb | SearchBar | mode toggle`. Breadcrumb stops claiming all flex space; SearchBar grows to fill (capped at 32em).
- `--jv-match-bg` and `--jv-match-fg` design tokens added, theme-aware via `--text-highlight-bg`.
- Test count: 133 → 181 (+48: 22 in `core/search`, 12 in `SearchBar`, 7 in `TreeView.applyFilter`, 6 in `JsonFileView` SearchBar integration, +1 selector hygiene fix).

### Notes
- Out of scope for this release (deferred to later): regex/case-toggle, substring highlighting inside matched text, match navigation (Cmd+G next/prev), filter inside code-block embeds, filter in source mode (CodeMirror has native Cmd+F), persistent query across file switches.

## [0.1.2] — 2026-05-27

### Added
- **Visual redesign (Direction B)** — full token-based theme-aware stylesheet (`--jv-*` CSS variables), nested tinted blocks for object/array depth, collapse chips with item counts, SVG chevron icons, and a unified top toolbar combining the breadcrumb and mode toggle.
- **Embedded code-block polish** — `` ```json `` blocks in Markdown notes render as a titled card; blocks over 20 lines auto-collapse; invalid JSON renders as a styled error card with line/column info instead of crashing.
- **Empty-state title and hint** for the `.json` file view when the file is empty.
- **Public documentation surface** — full README rewrite, CHANGELOG (Keep-A-Changelog), CONTRIBUTING, SECURITY, issue + PR templates for Codeberg (`.forgejo/`) and GitHub (`.github/ISSUE_TEMPLATE/`), `.editorconfig`, `versions.json`.
- **CI: PR-time test workflow** (`npm ci → npm test → npm run build` on every push to `main` and every PR).
- **package.json metadata** — `repository`, `bugs`, `homepage`, expanded `keywords`, GPL-3.0-or-later SPDX.

### Changed
- Stylesheet rewritten from scratch around design tokens; no hardcoded colors anywhere, theme-aware end to end.
- Test count: 122 → 133.
- Release workflow now extracts release notes from the matching `## [<tag>]` section in `CHANGELOG.md` instead of using a placeholder.

### Fixed
- Release notes are now passed to `gh release create` via env var rather than direct shell interpolation, so notes containing backticks or other shell-special characters no longer break the release job.

## [0.1.1] — 2026-05-21

### Added
- **Breadcrumb** showing the current JSON path; clicking a segment scrolls back up the tree.
- **Copy buttons** on hover — click copies the value, Alt-click copies the JSON path.
- **Tooltips** with a 500 ms hover delay (above/below position-flip based on viewport).
- **Animated collapse** transitions for tree nodes.
- **Typography polish** — consistent font sizing, spacing, and weight across tree and source modes.

## [0.1.0] — 2026-05-20

### Added
- Initial public release.
- **`.json` file view** with a Tree↔Source mode toggle.
- **Tree mode** with inline editing of strings, numbers, and booleans.
- **Source mode** built on CodeMirror 6 with `@codemirror/lang-json` syntax highlighting.
- **Code-block processor** — read-only tree rendering for `` ```json `` blocks inside Markdown notes.
- **Parse-error banner** with line/column info on invalid JSON.
- **Settings tab** — default open mode, indent style (2 / 4 / tab), tree marker style (modern / classic), auto-collapse depth.
- **GitHub Actions release workflow** — tag push triggers build, test, and GitHub release with `main.js`, `manifest.json`, and `styles.css` as assets.

[Unreleased]: https://codeberg.org/jkaindl/json-editor/compare/1.3.0...HEAD
[1.3.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.3.0
[1.2.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.2.0
[1.1.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.1.0
[1.0.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.0.0
[0.3.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.3.0
[0.2.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.2.0
[0.1.2]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.2
[0.1.1]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.1
[0.1.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.0
