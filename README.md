# JSON Editor for Obsidian

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/json-editor?gitea_url=https%3A%2F%2Fcodeberg.org&label=release)](https://codeberg.org/jkaindl/json-editor/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.5.7%2B-purple)](https://obsidian.md)

View and edit `.json` files in Obsidian with a Tree↔Source toggle. Renders `` ```json `` code blocks inside Markdown notes as collapsible, theme-aware trees.

**Target platform:** Obsidian 1.5.7+ on desktop and mobile. No external services, no remote resources, no telemetry.

> **Status: 1.6.0 released.** Tree mode is a full structural editor — add / delete / rename keys, add / delete items, reorder rows by drag-and-drop, and switch a value's JSON type. Undo/redo (`Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`) is unified across tree and source modes. Optional JSON Schema validation (opt-in) and a large-file guard round out the editor. See [`CHANGELOG.md`](CHANGELOG.md) for the full per-release log.

---

## About

JSON inside Obsidian — without losing the editing affordances you'd expect from a real editor. Open a `.json` file and it opens in a dedicated view with two modes:

- **Tree mode** — fold and inline-edit values, restructure with add/rename/delete/reorder/type-switch, with a breadcrumb that follows the cursor.
- **Source mode** — CodeMirror 6 with JSON syntax highlighting, a parse-error banner, and `Cmd/Ctrl+F` find.
- **Schema-aware (optional)** — opt-in JSON Schema validation flags invalid rows in real time against a companion `*.schema.json` file.

The plugin also renders `` ```json `` fences inside regular Markdown notes as read-only collapsible trees, so your config snippets and API examples stop being unreadable walls of text.

Everything stays inside your vault. The plugin uses Obsidian's own CSS variables, so it follows whichever theme you're using — light, dark, minimal, anything.

---

## Features

- **`.json` file view** with a Tree↔Source mode toggle in a unified top toolbar.
- **Inline editing** of strings, numbers, and booleans in tree mode — click a value, press Enter to commit, Escape to cancel.
- **Structural editing** — add keys to objects (`+ Add key` affordance at the bottom of each container), append items to arrays, rename object keys (✎ hover button), delete any row (✕ hover button or `Backspace` / `Delete` on focused row).
- **Drag-and-drop reorder** — hover a row to reveal a `⋮⋮` handle; drag it up/down within its container (array items or object keys). Same-parent only; undoable.
- **Type-switching** — every row has a `T` button to switch a value's JSON type (string / number / boolean / null / object / array). Destructive but undoable.
- **Undo / redo** — `Cmd/Ctrl+Z` reverts the last edit; `Cmd/Ctrl+Shift+Z` redoes. The history is **unified across tree and source mode** (a single 100-deep text-based stack since 1.2.0); switching modes no longer wipes it. While you're typing in an inline editor, undo falls through to the native input. The undo/redo and focus-search commands ship with **no default hotkeys** — a view-local keymap handles `Cmd/Ctrl+Z` / `Shift+Z` / `F` while the JSON view is focused; bind your own in Settings if you prefer.
- **Search & filter** — `Cmd/Ctrl+F` opens a live search that strict-filters the tree to matching keys and primitive values (case-insensitive substring); in source mode it opens CodeMirror's find panel instead. ESC clears or blurs.
- **JSON Schema validation (opt-in)** — enable in settings to auto-load a companion `data.schema.json` next to `data.json`; a banner shows the error count and offending rows get a red outline + hover message. Off by default — auto-loading schema files from a shared vault is a trust decision.
- **Large-file guard** — files past a render budget (~1 MB or ~15k nodes) open in source mode with a *Load tree anyway* banner, so a multi-MB file never freezes the UI on open.
- **Big-integer / lossy-number safety** — files containing integers JSON can't represent exactly (> 2^53) open the tree read-only with a banner; source mode stays editable, so an edit can't silently corrupt 64-bit IDs.
- **Keyboard navigation** — Tab focuses the tree; `↓` / `↑` walk visible rows; `→` / `←` expand-collapse or jump children / parent; `Home` / `End` jump to first / last visible row; `Enter` / `F2` open inline-edit on a primitive. WAI-ARIA tree roles (`role="tree"`, `role="treeitem"`, `aria-expanded`) for screen-reader support.
- **Breadcrumb** showing the current path; clicking a segment scrolls back up the tree.
- **Copy buttons** on hover — click copies the value, Alt-click copies the JSON path.
- **Theme-aware styling** via Obsidian CSS variables — no hardcoded colors, no theme breakage.
- **Embedded code blocks** — `` ```json `` fences in any Markdown note render as a titled card with a collapsible tree. Blocks over 20 lines auto-collapse. Invalid JSON renders as a styled error card with line/column info, not a crash.
- **Settings** — default mode, indent (2 / 4 / tab), tree marker style (modern / classic), auto-collapse depth, JSON Schema validation (opt-in), companion-schema suffix.
- **No telemetry, no remote resources.** All assets ship with the plugin.

---

## Install

### Manually (current)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/johannes-kaindl/json-editor/releases/latest).
2. Drop the three files into your vault's `.obsidian/plugins/json-editor/` directory.
3. In Obsidian: **Settings → Community plugins → Installed → Enable "JSON Editor"**.

### From source

```bash
git clone https://codeberg.org/jkaindl/json-editor.git
cd json-editor
npm install
npm run build
# copy main.js, manifest.json, styles.css to <vault>/.obsidian/plugins/json-editor/
```

### Community Plugin Directory

Submission to the official Obsidian Community Plugin Directory is pending — see [Project status](#project-status). Once accepted, install via **Settings → Community plugins → Browse → "JSON Editor"**.

---

## Usage

- **Open a `.json` file** — the plugin's view is registered as the default opener for that extension.
- **Switch mode** with the **Tree / Source** pills on the right of the toolbar.
- **Edit values** in tree mode by clicking them. Strings get an `<input>`, numbers get numeric validation, booleans get a toggle. Press <kbd>Enter</kbd> to commit, <kbd>Esc</kbd> to cancel.
- **Edit structure in tree mode** — `+ Add key` / `+ Add item` at the bottom of each container; hover a row for ✎ (rename key), ✕ (delete), `⋮⋮` (drag to reorder), and `T` (switch JSON type). `Backspace` / `Delete` removes the focused row.
- **Edit free-text in source mode** — full CodeMirror editing with `Cmd/Ctrl+F` find. Switching back to tree re-renders from the current text.
- **Copy** any value with the hover button — plain click = value, <kbd>Alt</kbd>-click = JSON path (e.g. `$.users[2].address.city`).
- **Inside Markdown notes**, write a JSON code block and it renders as a collapsible tree:
  ````markdown
  ```json
  { "feature": "tree-rendered", "collapsible": true }
  ```
  ````
- **Reorder** a row with <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd> (keyboard), or drag the `⋮⋮` handle (mouse).

### On mobile

Hover and drag-and-drop don't exist on touch, so the row actions are consolidated into a menu:

- **Long-press a tree row** to open its action menu: *Copy value · Copy path · Rename key · Change type · Move up / Move down · Delete*.
- **Single-tap** a value to edit it; tap the chevron to collapse/expand.
- **Undo / Redo** buttons appear in the toolbar (no hardware <kbd>Cmd/Ctrl+Z</kbd> on touch).

---

## Settings

| Setting | Default | Effect |
|---|---|---|
| Default mode | `tree` | Mode `.json` files open in. |
| Indent | `Two spaces` | Serialization indent (`Two spaces` / `Four spaces` / `Tab`). |
| Tree marker style | `modern` | Visual style of the tree connectors (`modern` / `classic`). |
| Auto-collapse depth | `2` | Tree nodes deeper than this start collapsed. |
| Validate against JSON schema | `off` | When enabled, auto-loads a companion `*.schema.json` next to the open file and flags validation errors live. Off by default (auto-loading vault files is a trust decision). |
| Companion schema suffix | `.schema.json` | Suffix used to locate the sibling schema (`data.json` → `data.schema.json`). |

Settings live under **Settings → Community plugins → JSON Editor**.

---

## Known conflicts / Compatibility

This plugin registers itself as the editor for the `.json` file extension. Obsidian allows only **one** plugin to own a given extension, so installing it alongside another plugin that also claims `.json` will conflict. Known examples: **JSON Viewer** (read-only viewer), **JSON Collapsible**, and **Data Files Editor**.

**What happens on conflict (since 1.5.0):** whichever plugin loads second fails to claim the extension. Rather than crashing, JSON Editor catches the error and shows a notice — *"another plugin already handles .json — file view disabled, code-block rendering still active."* The dedicated `.json` **file view is disabled**, but everything else keeps working: settings, the toggle / undo / redo / search commands, and `` ```json `` **code-block rendering inside Markdown notes**.

**To use JSON Editor as your `.json` editor:** disable the other `.json` plugin and reload Obsidian. Load order is not user-controllable, so two `.json` editors enabled at once is unsupported by design.

**Tree-edit limitation — object key order:** a tree edit re-serializes the whole document, and JavaScript reorders integer-like object keys (e.g. `"10"` before `"2"`). So editing an object whose keys are numeric strings may reorder them on save. Files with **big integers** (> 2^53) are already protected — they open read-only (edit them in source mode). For numeric-string *keys* where order matters, prefer source mode.

---

## Development

```bash
npm install                                # use --legacy-peer-deps if needed; .npmrc handles it
npm test                                   # 537 Vitest tests, ~3s
npm run dev                                # esbuild watch mode
npm run build                              # production build (tsc-check + esbuild)
npm run lint                               # Biome (format + general lint)
npm run lint:obsidian                      # eslint-plugin-obsidianmd guideline gate
npx vitest run tests/core/parse.test.ts    # single test file
npx vitest                                 # watch mode
```

The codebase is strict TDD — every change in `src/core/` and `src/obsidian/` is backed by a failing test first. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow.

---

## Project layout

```
json-editor/
├── src/
│   ├── core/                  pure TS, no Obsidian imports — fully unit-testable
│   │   ├── types.ts           JsonValue, JsonPath, ParseResult, RenderOptions
│   │   ├── parse.ts           parse(text) → ParseResult (line/col errors)
│   │   ├── serialize.ts       serialize(value, opts) → string
│   │   ├── edit.ts            structural ops (add/delete/rename/move/changeType), immutable
│   │   ├── history.ts         generic undo/redo stack (unified text history)
│   │   ├── render.ts          renderTree(value, opts) → HTMLElement
│   │   ├── search.ts          findMatches(value, query) for the tree filter
│   │   ├── schema.ts          compileSchema (Ajv) + Ajv→JsonPath + ReDoS guards
│   │   ├── roundtrip.ts       detects lossy number literals (> 2^53, format)
│   │   ├── render-budget.ts   large-file guard (byte + node budget)
│   │   ├── textdiff.ts        minimal-span diff for source-mode undo
│   │   └── path.ts            pathToString utility
│   ├── obsidian/              adapter layer — imports core/ + obsidian API
│   │   ├── JsonFileView.ts    TextFileView; mode toggle, view Scope, banners, per-file reset
│   │   ├── TreeView.ts        wraps core/render + inline edit + copy/row actions + drag
│   │   ├── SourceView.ts      CodeMirror 6 wrapper (@codemirror/lang-json + search)
│   │   ├── CodeblockProcessor.ts  read-only tree for ```json blocks in notes
│   │   ├── SettingsTab.ts     the six settings
│   │   ├── Breadcrumb.ts      path display, segment-click → scrollToPath
│   │   ├── SearchBar.ts       tree-filter input + match count
│   │   ├── RowActions.ts      ✎ / ✕ / T hover buttons per row
│   │   ├── AddAffordance.ts   + Add key / + Add item per container
│   │   ├── TypeMenu.ts        JSON-type picker popover
│   │   ├── SchemaBanner.ts    schema-error count banner
│   │   ├── LossBanner.ts      lossy-number warn banner
│   │   ├── LargeFileBanner.ts large-file banner + "Load tree anyway"
│   │   ├── CopyButton.ts      hover-only buttons; click=value, Alt+click=path
│   │   └── Tooltip.ts         singleton hover-tooltip
│   ├── main.ts                plugin entry — registers view (guarded .json claim),
│   │                          codeblock processor, settings, and commands
│   └── __mocks__/obsidian.ts  Vitest-only mock (not bundled into production)
├── tests/                     core/ + obsidian/ + toolchain/ (537 tests)
├── docs/superpowers/          design specs and implementation plans (one per release)
├── .github/workflows/         release.yml + test.yml (CI: tests, lint:obsidian, build)
├── eslint.config.mjs          eslint-plugin-obsidianmd guideline gate
├── manifest.json              Obsidian plugin manifest
├── styles.css                 token-based theme-aware stylesheet
├── THIRD-PARTY-NOTICES.md      bundled-dependency license texts
├── CHANGELOG.md               Keep-A-Changelog release notes
├── CONTRIBUTING.md            bug reports, PRs, TDD workflow
└── SECURITY.md                security-reporting policy
```

**Two tsconfigs:**
- `tsconfig.json` — IDE + Vitest, with `paths` alias `obsidian` → mock.
- `tsconfig.build.json` — production `tsc` check, no paths alias (validates against real `obsidian.d.ts`).

---

## Documentation

- [`CHANGELOG.md`](CHANGELOG.md) — per-release notes (Keep-A-Changelog format).
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — bug reports, pull requests, commit conventions, TDD workflow.
- [`SECURITY.md`](SECURITY.md) — how to report a security issue.
- [`docs/superpowers/specs/`](docs/superpowers/specs) — design specs (one per release, brainstormed before implementation).
- [`docs/superpowers/plans/`](docs/superpowers/plans) — checkbox implementation plans (one per release, task-by-task with TDD steps).

---

## Hosting

This project is mirrored across two forges:

| Remote | URL | Role |
|---|---|---|
| Codeberg | <https://codeberg.org/jkaindl/json-editor> | **Primary** — source development, issues, PRs |
| GitHub | <https://github.com/johannes-kaindl/json-editor> | Release mirror for Obsidian Community Plugin submission |

Issues and pull requests are preferred on **Codeberg**. GitHub exists because the Obsidian Community Plugin Directory only links to GitHub releases.

---

## Contributing

Bug reports and pull requests are welcome on Codeberg. For larger changes, please open an issue first to discuss the approach. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full workflow — commit conventions, branch naming, TDD requirements, and review notes.

---

## Project status

Actively maintained by a single maintainer ([@jkaindl](https://codeberg.org/jkaindl) / [@johannes-kaindl](https://github.com/johannes-kaindl)). Built for personal use, released because it might be useful to others.

**Shipped** (see [`CHANGELOG.md`](CHANGELOG.md)): structural tree editing & undo/redo (1.0.0), drag-and-drop reorder + type-switching (1.1.0), unified cross-mode undo/redo (1.2.0), JSON Schema validation (1.3.0, opt-in since 1.5.0), data-integrity & crash hardening (1.5.0), guideline alignment + large-file guard + source-mode search (1.6.0).

**Roadmap (rough, 2.x ideas):**
1. **Community Plugin Directory submission** — via the Developer Dashboard at `community.obsidian.md` (the old `obsidianmd/obsidian-releases` PR flow was retired May 2026).
2. **Consolidated mobile interaction model** — long-press context menu replacing hover / Alt-click / drag.
3. **Tree search match navigation** — next/prev jumps and match highlighting, beyond the current strict filter.

---

## License

- **Open source (default):** GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later) — see [LICENSE](LICENSE). This applies to everyone by default.
- **Commercial license (on request):** If the AGPL's copyleft does not fit your use case — for example a **proprietary/closed-source product or an Apple App Store build** (App Store terms are incompatible with the AGPL) — a separate commercial license is available. See [`LICENSING.md`](LICENSING.md).
- **Contributing:** external contributions are accepted under the [Contributor License Agreement](CLA.md), which keeps the dual-licensing model possible.
- **Documentation/text:** Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) — see [`LICENSE-DOCS`](LICENSE-DOCS).

**Dependency licenses (bundled in `main.js`):** This plugin statically bundles [ajv](https://github.com/ajv-validator/ajv) (MIT) for JSON Schema validation, together with its dependencies [fast-uri](https://github.com/fastify/fast-uri) (**BSD-3-Clause**), [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal) (MIT) and [json-schema-traverse](https://github.com/epoberezkin/json-schema-traverse) (MIT), plus the source-mode JSON grammar [@codemirror/lang-json](https://github.com/codemirror/lang-json) (MIT) and [@lezer/json](https://github.com/lezer-parser/json) (MIT). All are AGPL-3.0-compatible. Full license texts and copyright notices are in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). The remaining `@codemirror/*` and `@lezer/{common,highlight,lr}` packages, and the Obsidian plugin API, are **not bundled** — they are provided by Obsidian at runtime (marked `external` in `esbuild.config.mjs`).

---

Copyright © 2026 Johannes Kaindl. Code: AGPL-3.0-or-later · Docs: CC BY-SA 4.0.
