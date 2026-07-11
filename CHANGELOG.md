# Changelog

All notable changes to **JSON Editor** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions follow Obsidian's plugin convention of no `v` prefix on git tags (e.g. `0.1.1`, not `v0.1.1`).

## [Unreleased]

### Added
- **`.jsonc` file support with comment-preserving tree editing.** JSONC files (JSON with `//` and `/* */` comments and trailing commas) now open in the same Tree/Source editor. Every structural edit in the tree — edit value, add/delete, rename, change type, reorder — is applied as a targeted text edit on the source (via Microsoft's [`jsonc-parser`](https://github.com/microsoft/node-jsonc-parser)), so **comments and formatting survive editing and saving**. Opening and saving an unedited `.jsonc` file is byte-for-byte identical. `.json` files are unchanged — they stay strict (a comment is still a parse error).
- **`` ```jsonc `` code blocks** in Markdown notes render as a read-only tree, tolerating comments (analogous to the existing `` ```json `` block).

### Known limitations
- Reordering rows in a `.jsonc` file moves each element with its same-line trailing comment; a free-standing comment line keeps its absolute position, so after a reorder it may sit next to a different element. No comment is ever lost — full positional fidelity on reorder is a future improvement.

## [1.9.1] — 2026-07-11

**Maintenance release.** No user-facing behavior changes — internal robustness and release tooling only.

### Changed
- Settings are now loaded through a small shared `mergeSettings` helper (vendored from `obsidian-kit`). It shallow-merges stored settings over the defaults exactly as before, with added reference-safety (default array/object values are cloned so a later mutation can't reach back into the defaults). Every setting in this plugin is a primitive, so the observable behavior is identical; this is a maintenance alignment with the other Obsidian plugins in the family.

### Internal
- Adopted the unified one-command release toolkit (`npm run release` / `scripts/release.mjs`): version bump → CHANGELOG → tag → Codeberg release → GitHub dual-push mirror, replacing the retired Woodpecker mirror config.
- Documentation path/reference updates for the `obsidian-plugins/` umbrella repository layout.

## [1.9.0] — 2026-06-16

**Eval-free JSON Schema validation + a clean community-review report.** Replaces the Ajv validator with the eval-free [`@cfworker/json-schema`](https://github.com/cfworker/cfworker), and drives the type-aware ESLint findings from the `community.obsidian.md` review to zero. The plugin bundle is ~52% smaller.

### Changed
- **JSON Schema validation now uses `@cfworker/json-schema` instead of Ajv.** It is an eval-free, tree-walking validator (no `new Function` / no `eval`), so the automated review's "dynamic code execution" disclosure no longer applies. The bundle drops from ~176 KB to ~85 KB. Supported drafts are a superset of before (draft-04/07/2019-09/2020-12 vs. draft-07-only); the public validation contract (inline row errors + the error-count banner) is unchanged.
- **`format` keywords are now enforced.** The previous Ajv build ran without `ajv-formats`, so `format` (`email`, `uri`, `date-time`, …) was a no-op annotation. The new validator enforces formats in draft-07 mode, so a value that violates a `format` constraint in an (opt-in) companion schema now reports an error. A structurally malformed companion schema (e.g. `{"type": 123}`) is still rejected via draft-07 meta-validation; a merely cosmetic, non-URI `$id` no longer disables validation for the whole file.

### Fixed
- **The community-review ESLint warnings are now zero.** The review's type-aware linter resolved `obsidian` to the Vitest mock (via a `tsconfig.json` `paths` alias), so every Obsidian-typed expression was flagged as `no-unsafe-*` and one assertion as `no-unnecessary-type-assertion`. The mock alias is gone from `tsconfig.json` (real Obsidian types now resolve), the Vitest mock moved to `tests/__mocks__/`, and the redundant assertions were removed. None of this changes runtime behavior. A committed `npm run lint:portal` guard now mirrors the review so the warnings cannot silently come back.

### Internal
- Added `tsconfig.test.json` (editor typing of tests against the mock), `eslint.portal.config.mjs` + `npm run lint:portal`, and `src/core/draft07-meta-schema.ts`. The Vitest suite (601 tests) pins the new validator's error granularity and format behavior.

## [1.8.2] — 2026-06-16

**Lint follow-up.** Fixes a regression in 1.8.1's review cleanup.

### Fixed
- 1.8.1 silenced the `prefer-active-doc` warnings by using the `activeDocument` global, but the community-review's type-aware linter sees `activeDocument` as `any` (it doesn't load Obsidian's ambient global declarations), which cascaded into many `no-unsafe-*` warnings across the UI components. DOM access now goes through a typed `activeDoc(): Document` helper, so call sites stay type-safe (`prefer-active-doc` remains satisfied). Functionally identical; our own `tsc` against the real Obsidian types was clean throughout.

## [1.8.1] — 2026-06-16

**Review cleanup.** Addresses the recommendations and warnings from the Obsidian Community automated review (which had passed with no errors). No user-facing behavior changes — pop-out windows aside.

### Fixed
- **Pop-out window correctness (audit §2.11).** All DOM creation now uses Obsidian's `activeDocument` (or, in the pure `core/render`, a `Document` injected by the adapter) instead of the global `document`, and element type checks use Obsidian's cross-window-safe `Node.instanceOf`. Rendering a JSON view in a detached window now works correctly. (Resolves ~70 `prefer-active-doc` + 3 `instanceof` review warnings.)

### Changed
- Replaced the `builtin-modules` build dependency with Node's built-in `module.builtinModules` (one fewer dependency).
- Removed `!important` from the stylesheet (uses selector specificity instead); made Settings `onChange` handlers non-async (`no-misused-promises`); dropped redundant type assertions.

### Added
- **Build-provenance attestations** for the release assets (`actions/attest-build-provenance`), so users can cryptographically verify the assets were built from this repo.

### Documentation
- `SECURITY.md` discloses Ajv's `new Function` schema-compilation (opt-in only; no plugin code uses `eval`/`new Function`) and the clipboard copy behavior.

## [1.8.0] — 2026-06-15

**Mobile interaction model.** Tree-mode editing is now fully usable on touch devices, with no dead or invisible affordances. No desktop behavior changes beyond two additive improvements (keyboard reorder, focus-revealed copy button).

### Added
- **<kbd>Cmd/Ctrl</kbd>+<kbd>E</kbd> toggles Tree/Source** while a JSON view is focused. It's handled by the view-local keymap scope (not a global command hotkey), so it never shadows the core "Toggle reading view" binding in Markdown — and the *Toggle tree/source view* command remains for custom rebinding. (Same scope mechanism that already powers <kbd>Cmd/Ctrl</kbd>+<kbd>F</kbd>/<kbd>Z</kbd>/<kbd>Shift</kbd>+<kbd>Z</kbd> inside JSON views.)
- **Long-press action menu (mobile).** On Obsidian mobile, long-pressing a tree row opens a consolidated menu with *Copy value · Copy path · Rename key · Change type · Move up/down · Delete* — replacing the hover-only inline buttons and drag-and-drop, which don't work on touch (audit §4.2, §4.3, §6.10).
- **`Alt+ArrowUp` / `Alt+ArrowDown` reorder** the focused row within its parent — a keyboard path for reordering on every platform (previously only mouse drag-and-drop; audit §4.2).
- **Undo/Redo toolbar buttons on mobile**, with a live disabled state, since there is no hardware `Mod+Z` on touch (audit §4.5).

### Changed
- On mobile, the hover-revealed inline row actions, copy button and drag handle are no longer rendered (they were invisible-but-tappable — a stray tap could fire an unconfirmed delete) and rows are not marked `draggable` (which collided with touch scroll/long-press); all actions come from the long-press menu instead (audit §4.3, §4.4, §4.8).
- ≥44px touch targets on mobile across the UI (audit §4.4): the collapse toggle, toolbar icon buttons (undo/redo), search-clear, mode pills, and the value-editing controls (inline text/number/key-rename field, the boolean checkbox, and the "+ Add key/item" button). The undo/redo buttons use Obsidian's native `clickable-icon` class for consistent sizing/theming.

### Fixed
- The copy button is now revealed on `:focus-within`, not just `:hover` (keyboard / touch-laptop access; audit §4.3.1).
- The type-change menu now also closes on `pointerdown` outside, not only `mousedown`, so it can't get stuck open on touch.
- **`hidden`-toggled elements stayed visible.** The large-file banner, schema banner, search bar, match-count and search-clear (×) set a `display` value on their class, which overrode the UA `[hidden] { display: none }` (equal specificity) — so `el.hidden = true` didn't hide them (the "Load tree anyway" button showed on every file, including small ones; the × showed with an empty query). Added explicit `[hidden]` overrides (the fix already present for the tooltip).
- The large-file banner's "Load tree anyway" button rendered in the wrong (UA-default) font because it set no `font-family`, and read as unstyled/unclear; it now uses the interface font + native Obsidian button styling (comfortable label padding + button shadow), carries an explanatory tooltip, and the banner wraps gracefully on narrow screens. The `+ Add` affordance gained matching padding.

### Toolbar polish (audit §6.1)
- Removed the redundant Tree/Source **view-header action** — the labeled toolbar toggle and the `toggle-tree-source` command remain the toggle paths.
- The breadcrumb's current segment is now emphasized by font weight instead of a filled accent chip, so it reads as a path location rather than a button.

### Accessibility & polish (pre-publish pass)
- Breadcrumb segments are now real `<button>`s — Tab-focusable and Enter/Space-operable with a visible focus ring (WCAG 2.1.1); previously they were `<span>`s with click-only handlers.
- The copy button and tree row-action buttons now use the interface font (parity with the rest of the chrome), and the copy button gained an `aria-label`.

### Notes
- `isDesktopOnly` stays `false` (the plugin uses no Node/Electron APIs). Real pointer-events touch-drag and the broader mobile/perf items (virtualization, source-mode debounce) remain deferred to a later release.

## [1.7.0] — 2026-06-13

**Rename & submission-prep release.** No functional changes to the editor — this renames the plugin for the Community Plugin Directory and completes the documentation/attribution pass.

### Changed
- **Plugin ID renamed `obsidian-json-editor` → `json-editor`.** The Obsidian guidelines disallow an `obsidian-`-prefixed plugin id; the manifest `id` and the on-disk plugin folder change accordingly. The internal view type is unchanged, so existing layouts are unaffected. **After updating, move/rename your plugin folder to `.obsidian/plugins/json-editor/`.**
- Manifest/package description tightened to *"View and edit JSON files with a Tree/Source toggle. Renders JSON code blocks in Markdown notes."*

### Added
- `THIRD-PARTY-NOTICES.md` — full license texts for the bundled dependencies (ajv + transitive fast-uri **(BSD-3-Clause)** / fast-deep-equal / json-schema-traverse, plus @codemirror/lang-json and @lezer/json, all MIT). Attribution is also carried in the `main.js` banner.

### Documentation
- README aligned to the actual 1.6.0 feature set (status, unified undo, tree-mode structural editing, schema validation, drag-drop, type-switching, large-file guard, all six settings, a *Known conflicts* section, shipped-vs-2.x roadmap), the dependency-license note corrected, and a documented tree-edit limitation (numeric-string object keys may reorder on save — audit 1.4).
- SECURITY.md threat model updated — prototype-pollution fixed; ReDoS opt-in + heuristic guard + honest residual surface.
- AGENTS.md submission path rewritten to the `community.obsidian.md` portal flow.

## [1.6.0] — 2026-06-13

**Guideline & UX release.** Aligns with the Obsidian plugin guidelines and ships the high-value editing/UX gaps from the pre-submission audit.

> **Heads-up:** `minAppVersion` is now **1.5.7** (the new view-scoped keymap needs it).

### Added
- **Tree/Source toggle command** (`Toggle tree/source view`) plus a view-header icon — the mode toggle is now keyboard- and command-bindable (bind your own hotkey; no default is set to avoid clashing with the core *Toggle reading view*).
- **Search in Source mode** — `Cmd/Ctrl+F` (focus-search) now opens CodeMirror's find panel when you're in source mode instead of yanking you to tree; tree mode still focuses the tree search bar.
- **Large-file guard** — files above a render budget (~1 MB or ~15k nodes) open in Source mode with a *Load tree anyway* banner, so a multi-MB file no longer freezes the UI on open.

### Changed
- **No more default hotkeys on commands.** `Focus search`, `Undo edit`, `Redo edit` (renamed, sentence-case) carry no default hotkey, per the guidelines; a view-local keymap still handles `Mod+F/Mod+Z/Mod+Shift+Z` while the JSON view is focused — and now correctly falls through to native input undo while you're typing in an inline editor.
- `minAppVersion` raised to **1.5.7** for the view-scoped keymap and view-header action APIs.
- Various UI strings corrected to sentence case.

### Fixed
- **Source-mode undo/redo** no longer destroys and rebuilds the CodeMirror editor on every step — it dispatches a minimal change, preserving cursor, scroll, and focus.
- **Silent data loss / prototype reassignment** when an object had a `__proto__` (or other prototype-name) key and you deleted/renamed/reordered another key. Such keys are now preserved (and addable).
- **Pop-out windows**: tooltips and the type-switch menu now resolve their document/window correctly instead of binding to the main window.
- **Lifecycle leaks**: the Source editor and the type menu are now torn down on view unload.
- Clipboard copy no longer throws (and now reports failure) on platforms without `navigator.clipboard`; companion-schema paths are normalized; window-bound timers; no hard-coded inline styles.

### Internal
- Added the official `eslint-plugin-obsidianmd` as a CI guideline gate (`npm run lint:obsidian`); Biome stays the formatter. Test count 478 → 537.

## [1.5.0] — 2026-06-13

**Stability & data-integrity release.** Fixes the data-loss and crash blockers found in a pre-submission audit. No new user-facing features — every change here protects your files.

### Fixed
- **Cross-file undo data loss (critical).** The undo history was not reset when you switched files in the same pane, so `Cmd/Ctrl+Z` in file B could restore — and save — file A's content over it. The same path silently reverted external/sync changes. History (and the schema, search query, and forced source mode) is now reset per file.
- **Large trees were clipped.** A `.json-content { max-height: 5000px }` cap hid everything past roughly 200–250 expanded rows with no scrollbar. Removed.
- **Plugin death on `.json` conflict.** If another plugin already handled `.json`, `registerExtensions` threw and the whole plugin failed to load (losing code-block rendering, settings, and commands). The claim is now guarded; on conflict you get a notice and code-block rendering keeps working.
- **Lost place after every edit.** Re-rendering the tree reset manual expand/collapse, scroll position, and keyboard focus. These are now preserved across edits; after a delete, focus moves to the next sibling.
- **Big-integer corruption.** Editing a number to a value beyond 2^53 silently truncated it; the tree editor now rejects such input (use source mode for big integers).

### Changed
- **Schema validation is now opt-in** (`validateAgainstSchema` defaults to `false`). A companion `*.schema.json` was previously auto-loaded and compiled on every file open; a malicious schema in a shared/synced vault could freeze Obsidian via a catastrophic-backtracking regex (ReDoS). Enable it explicitly if you trust your schema files. `compileSchema` now also rejects oversized schemas and obvious nested-quantifier patterns, and a stale companion-schema load can no longer apply to the wrong file.

### Added
- **Lossy-number warning.** When a file contains integers JSON can't represent exactly (e.g. 64-bit IDs > 2^53), a banner appears and the tree opens read-only so a tree edit can't silently rewrite them; source mode stays editable.

### Internal
- All `innerHTML = ""` DOM clears replaced with `replaceChildren()` (Community-Hub submission-gate requirement); a regression test enforces it across the source tree.
- Test count 402 → 478 (+76), all green; build and Biome lint clean.

## [1.4.0] — 2026-06-07

### Changed
- **Relicensed from GPL-3.0-or-later to AGPL-3.0-or-later.** Documentation is now licensed separately under CC BY-SA 4.0 (see `LICENSE-DOCS`). Part of adopting the shared workspace conventions.
- Adopted **Biome** for linting/formatting; added `lint` and `typecheck` npm scripts.
- Convention alignment: shields.io badge row, `AGENTS.md` now committed with the standard section skeleton, `.claude/` gitignored.

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

[Unreleased]: https://codeberg.org/jkaindl/json-editor/compare/1.7.0...HEAD
[1.7.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.7.0
[1.6.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.6.0
[1.5.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.5.0
[1.4.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.4.0
[1.3.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.3.0
[1.2.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.2.0
[1.1.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.1.0
[1.0.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/1.0.0
[0.3.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.3.0
[0.2.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.2.0
[0.1.2]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.2
[0.1.1]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.1
[0.1.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.0
