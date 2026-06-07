# Obsidian JSON Editor

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/json-editor?gitea_url=https%3A%2F%2Fcodeberg.org&label=release)](https://codeberg.org/jkaindl/json-editor/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.4%2B-purple)](https://obsidian.md)

View and edit `.json` files in Obsidian with a Tree↔Source toggle. Renders `` ```json `` code blocks inside Markdown notes as collapsible, theme-aware trees.

**Target platform:** Obsidian 1.4+ on desktop and mobile. No external services, no remote resources, no telemetry.

> **Status: 1.0.0 released.** Tree mode is now a full editor: add / delete / rename keys, add / delete items, plus tree-mode undo/redo (`Cmd/Ctrl+Z`). See [`CHANGELOG.md`](CHANGELOG.md) for the full per-release log.

---

## About

JSON inside Obsidian — without losing the editing affordances you'd expect from a real editor. Open a `.json` file and it opens in a dedicated view with two modes:

- **Tree mode** — fold and inline-edit values, with a breadcrumb that follows the cursor.
- **Source mode** — CodeMirror 6 with JSON syntax highlighting and a parse-error banner.

The plugin also renders `` ```json `` fences inside regular Markdown notes as read-only collapsible trees, so your config snippets and API examples stop being unreadable walls of text.

Everything stays inside your vault. The plugin uses Obsidian's own CSS variables, so it follows whichever theme you're using — light, dark, minimal, anything.

---

## Features

- **`.json` file view** with a Tree↔Source mode toggle in a unified top toolbar.
- **Inline editing** of strings, numbers, and booleans in tree mode — click a value, press Enter to commit, Escape to cancel.
- **Structural editing** — add keys to objects (`+ Add key` affordance at the bottom of each container), append items to arrays, rename object keys (✎ hover button), delete any row (✕ hover button or `Backspace` / `Delete` on focused row).
- **Undo / redo** — `Cmd/Ctrl+Z` reverts the last structural or value edit; `Cmd/Ctrl+Shift+Z` redoes. Tree-mode only; source mode keeps its native CodeMirror history.
- **Search & filter** — `Cmd/Ctrl+F` opens a live search that strict-filters the tree to matching keys and primitive values (case-insensitive substring). Ancestors stay visible, everything else is hidden. ESC clears or blurs.
- **Keyboard navigation** — Tab focuses the tree; `↓` / `↑` walk visible rows; `→` / `←` expand-collapse or jump children / parent; `Home` / `End` jump to first / last visible row; `Enter` / `F2` open inline-edit on a primitive. WAI-ARIA tree roles (`role="tree"`, `role="treeitem"`, `aria-expanded`) for screen-reader support.
- **Breadcrumb** showing the current path; clicking a segment scrolls back up the tree.
- **Copy buttons** on hover — click copies the value, Alt-click copies the JSON path.
- **Theme-aware styling** via Obsidian CSS variables — no hardcoded colors, no theme breakage.
- **Embedded code blocks** — `` ```json `` fences in any Markdown note render as a titled card with a collapsible tree. Blocks over 20 lines auto-collapse. Invalid JSON renders as a styled error card with line/column info, not a crash.
- **Settings** — default open mode, indent style (2 / 4 / tab), tree marker style (modern / classic), auto-collapse depth.
- **No telemetry, no remote resources.** All assets ship with the plugin.

---

## Install

### Manually (current)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/johannes-kaindl/json-editor/releases/latest).
2. Drop the three files into your vault's `.obsidian/plugins/obsidian-json-editor/` directory.
3. In Obsidian: **Settings → Community plugins → Installed → Enable "JSON Editor"**.

### From source

```bash
git clone https://codeberg.org/jkaindl/json-editor.git
cd json-editor
npm install
npm run build
# copy main.js, manifest.json, styles.css to <vault>/.obsidian/plugins/obsidian-json-editor/
```

### Community Plugin Directory

Submission to the official Obsidian Community Plugin Directory is pending — see [Project status](#project-status). Once accepted, install via **Settings → Community plugins → Browse → "JSON Editor"**.

---

## Usage

- **Open a `.json` file** — the plugin's view is registered as the default opener for that extension.
- **Switch mode** with the **Tree / Source** pills on the right of the toolbar.
- **Edit values** in tree mode by clicking them. Strings get an `<input>`, numbers get numeric validation, booleans get a toggle. Press <kbd>Enter</kbd> to commit, <kbd>Esc</kbd> to cancel.
- **Edit structure** (add / rename / remove keys, change types) in source mode. Switching back to tree re-renders from the current text.
- **Copy** any value with the hover button — plain click = value, <kbd>Alt</kbd>-click = JSON path (e.g. `$.users[2].address.city`).
- **Inside Markdown notes**, write a JSON code block and it renders as a collapsible tree:
  ````markdown
  ```json
  { "feature": "tree-rendered", "collapsible": true }
  ```
  ````

---

## Settings

| Setting | Default | Effect |
|---|---|---|
| Default open mode | `tree` | Mode `.json` files open in. |
| Indent style | `2 spaces` | Serialization indent (`2 spaces` / `4 spaces` / `tab`). |
| Tree marker style | `modern` | Visual style of the tree connectors (`modern` / `classic`). |
| Auto-collapse depth | `2` | Tree nodes deeper than this start collapsed. |

Settings live under **Settings → Community plugins → JSON Editor**.

---

## Development

```bash
npm install                                # use --legacy-peer-deps if needed; .npmrc handles it
npm test                                   # 133 Vitest tests, ~1s
npm run dev                                # esbuild watch mode
npm run build                              # production build (tsc-check + esbuild)
npx vitest run tests/core/parse.test.ts    # single test file
npx vitest                                 # watch mode
```

The codebase is strict TDD — every change in `src/core/` and `src/obsidian/` is backed by a failing test first. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow.

---

## Project layout

```
obsidian-json-editor/
├── src/
│   ├── core/                  pure TS, no Obsidian imports — fully unit-testable
│   │   ├── types.ts           JsonValue, JsonPath, ParseResult, RenderOptions
│   │   ├── parse.ts           parse(text) → ParseResult (line/col errors)
│   │   ├── serialize.ts       serialize(value, opts) → string
│   │   ├── edit.ts            editValue(value, path, newVal) → immutable JsonValue
│   │   ├── render.ts          renderTree(value, opts) → HTMLElement
│   │   └── path.ts            pathToString utility
│   ├── obsidian/              adapter layer — imports core/ + obsidian API
│   │   ├── JsonFileView.ts    TextFileView; owns mode toggle, breadcrumb, error banner
│   │   ├── TreeView.ts        wraps core/render + inline edit + copy buttons
│   │   ├── SourceView.ts      CodeMirror 6 wrapper with @codemirror/lang-json
│   │   ├── CodeblockProcessor.ts  read-only tree for ```json blocks in notes
│   │   ├── SettingsTab.ts     default mode, indent, marker style, auto-collapse depth
│   │   ├── Breadcrumb.ts      path display, segment-click → scrollToPath
│   │   ├── CopyButton.ts      hover-only buttons; click=value, Alt+click=path
│   │   └── Tooltip.ts         singleton hover-tooltip
│   ├── main.ts                plugin entry — registers view, codeblock processor, settings
│   └── __mocks__/obsidian.ts  Vitest-only mock (not bundled into production)
├── tests/
│   ├── core/                  parse, serialize, edit, render, path tests
│   └── obsidian/              adapter tests against the obsidian mock
├── docs/superpowers/          design specs and implementation plans (one per release)
├── .github/workflows/         release.yml — tag-triggered build + GitHub release
├── manifest.json              Obsidian plugin manifest
├── styles.css                 token-based theme-aware stylesheet (Direction B redesign)
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

**Roadmap (rough, in priority order):**
1. **1.1.0 — Polish** — drag-and-drop reorder, type-switching (string ↔ number ↔ boolean ↔ null ↔ object ↔ array).
2. **1.2.0 — Cross-mode undo/redo** — unify the tree-mode and source-mode (CodeMirror) undo stacks.
3. **1.3.0 — JSON Schema validation** — optional, via `ajv`.
4. **Community Plugin Directory submission** — PR against `obsidianmd/obsidian-releases`.

---

## License

- **Open source (default):** GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later) — see [LICENSE](LICENSE). This applies to everyone by default.
- **Commercial license (on request):** If the AGPL's copyleft does not fit your use case — for example a **proprietary/closed-source product or an Apple App Store build** (App Store terms are incompatible with the AGPL) — a separate commercial license is available. See [`LICENSING.md`](LICENSING.md).
- **Contributing:** external contributions are accepted under the [Contributor License Agreement](CLA.md), which keeps the dual-licensing model possible.
- **Documentation/text:** Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) — see [`LICENSE-DOCS`](LICENSE-DOCS).

**Dependency licenses:** All runtime dependencies (`@codemirror/*`) are MIT — AGPL-3.0-compatible. The Obsidian plugin API itself is consumed via TypeScript declarations only and is not bundled.

---

Copyright © 2026 Johannes Kaindl. Code: AGPL-3.0-or-later · Docs: CC BY-SA 4.0.
