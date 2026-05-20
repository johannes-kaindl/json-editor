# Obsidian JSON Editor Plugin — Design

**Status:** Draft (awaiting user review)
**Date:** 2026-05-20
**Author:** Johannes Kaindl

## Context

The legacy project `jupyter-json-viewer` v0.1.5 (archived under `_archiv/`) renders read-only JSON trees inside Jupyter notebooks via Python/HTML/JS. The new project ports the same visual concept to an Obsidian plugin — extended with edit capability — so JSON files and JSON code blocks become first-class citizens in the vault.

What carries over from v0.1.5: **concepts** (tree markers, collapsibility, theme-aware coloring, depth-controlled display). What does not carry over: **code** — Obsidian plugins are TypeScript, run in Electron, and use the Obsidian API. This is a from-scratch implementation guided by the lessons of the old code.

## Goals

- Open `.json` files in Obsidian as interactive views with a Tree↔Source toggle (analogous to Markdown's Reading View vs. Source Mode).
- Edit primitive values (string/number/bool) inline in Tree view; structural changes and type changes happen in Source view.
- Render ```` ```json ```` code blocks inside Markdown notes as read-only trees that respect Obsidian's theme.
- Stay schlank and theme-consistent — use Obsidian's CSS variables, lean on its bundled CodeMirror 6.

## Non-Goals (v1.0)

- JSON Schema validation against user-defined schemas (only basic syntax validation).
- Structural editing via the Tree view (add/delete/rename/reorder nodes) — done in Source view.
- Diff/merge view between two JSON files.
- Virtualized tree rendering for very large (>10 MB) files.
- Cross-mode undo/redo (each mode keeps its own undo stack; switching resets the stack with explicit user-visible notice).
- Mobile-first touch interactions (plugin should work on mobile, but no special-case polish).

## Architecture

Layered: **pure `core/` + Obsidian-side adapter + bundled CodeMirror 6**.

```
┌─────────────────────────────────────────────────────────────────┐
│  main.ts — Plugin entry                                          │
│  • registerView("json", ...)        • addSettingTab(...)         │
│  • registerMarkdownCodeBlockProcessor("json", ...)               │
└────────────────────┬──────────────────────┬─────────────────────┘
                     │                      │
                     ▼                      ▼
   ┌────────────────────────────┐   ┌────────────────────────────┐
   │  obsidian/JsonFileView     │   │  obsidian/CodeblockProc    │
   │  extends TextFileView      │   │  MarkdownPostProcessor     │
   │  • Toggle Tree ↔ Source    │   │  • read-only Tree render   │
   │  • Inline value edits      │   │  • Obsidian theme          │
   │  • Persist via requestSave │   │                            │
   └─────────┬──────────────────┘   └────────────┬───────────────┘
             │                                   │
             │   ┌───────────────────────────────┘
             ▼   ▼
   ┌────────────────────────────┐
   │  core/  (pure TypeScript)  │   ← no Obsidian imports
   │  • parse, serialize        │      → vitest-testable
   │  • renderTree              │      → shared by both adapters
   │  • editValue (immutable)   │
   └────────────────────────────┘
             ▲
             │ uses (via SourceView wrapper)
             │
   ┌────────────────────────────┐
   │  CodeMirror 6 (built-in)   │   ← shipped with Obsidian,
   │  • @codemirror/lang-json   │      no bundle overhead
   │  • Syntax HL, Search, Undo │
   └────────────────────────────┘
```

**Source of truth:** the JSON text on disk. The Tree view is a projection. Tree edits → modify in-memory data → serialize → update the `TextFileView.data` buffer → Obsidian persists.

### Why this split

- `core/` has no Obsidian imports → fast Vitest tests without mock plumbing.
- The tree renderer is invoked **twice** (FileView and Codeblock-Postprocessor) — must be reusable.
- CodeMirror 6 ships with Obsidian; building our own source editor would duplicate work and inflate the bundle.

## Data Model

```typescript
type JsonValue =
  | null | boolean | number | string
  | JsonValue[]
  | { [key: string]: JsonValue }

type JsonPath = (string | number)[]   // e.g. ["users", 0, "name"]

type ParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: string; line: number; col: number }
```

## Core API (pure)

```typescript
// core/parse.ts
export function parse(text: string): ParseResult

// core/serialize.ts
export function serialize(value: JsonValue, opts: { indent: number | '\t' }): string

// core/edit.ts
export function editValue(value: JsonValue, path: JsonPath, newVal: JsonValue): JsonValue
// returns a new immutable tree with the change applied

// core/render.ts
export function renderTree(
  value: JsonValue,
  opts: {
    readonly?: boolean
    markerStyle?: 'modern' | 'classic'
    autoCollapseDepth?: number
    onValueClick?: (path: JsonPath, currentValue: JsonValue) => void
    onCollapse?: (path: JsonPath, collapsed: boolean) => void
  }
): HTMLElement
```

All `core/` functions are pure — they take inputs, return outputs, never touch the DOM beyond `document.createElement` (which is allowed since we return DOM nodes, but no global state mutation).

## Data Flow

### Value edit in Tree view

Inline editing is **same-type only** — `string→string`, `number→number`, `boolean→boolean`. Editing a `null` requires Source mode (type changes are structural, see Non-Goals).

1. User clicks a value → an inline `<input>` is shown, typed correctly:
   - `string` → text input
   - `number` → number input
   - `boolean` → checkbox
   - `null` → not editable in Tree; click is a no-op with a small tooltip "Edit in Source to change type"
2. On Enter: `editValue(currentValue, path, newVal)` → new immutable tree.
3. Adapter stores new tree in local state.
4. `serialize(newTree, indent)` → new text → updates `TextFileView` buffer.
5. `this.requestSave()` (debounced ~500 ms; Obsidian's default).
6. Tree is re-rendered in full (v1.0 keeps it simple; diff-based re-render is a v2.0 perf optimization).

### Source view edits

The CM6 instance is the active editor. We tie into Obsidian's `TextFileView` lifecycle:
- `getViewData()` returns `cm.state.doc.toString()` (canonical source).
- `setViewData(data, clear)` calls `cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: data } })`.
- A CM6 `updateListener` fires `this.requestSave()` on any change (debounced by Obsidian).

This means Source-mode edits flow through Obsidian's standard save path without any custom debounce logic on our side.

### Mode switch

- **Tree → Source:** `serialize(currentValue, indent)` → CM6 `dispatch(setText)`.
- **Source → Tree:**
  - `parse(cm.state.doc.toString())`.
  - On `{ok: true}` → swap Tree.
  - On `{ok: false}` → show error banner with line/col; keep user in Source view; Tree toggle disabled until next valid parse.

### Code block in note

- Postprocessor receives the code-block string. `parse(text)` → `renderTree(value, {readonly: true})` → replace the code-block element with the tree.
- On parse error: leave the default Obsidian code-block rendering intact + small icon tooltip indicating invalid JSON.

## UX Decisions

| Aspect | Decision |
|---|---|
| Default tree look | **Modern** (clean indent, disclosure triangle, no markers) |
| Classic look (┐├┘) | Available as opt-in setting |
| Mode toggle | Two segmented pills in the view header, top-right ("Tree | Source") |
| Inline-edit trigger | Single click on the **value** (not the key) |
| Editor for value | Type-specific input: text (string) / number (number) / checkbox (boolean). `null` is not editable in Tree — type changes happen in Source. |
| Theme | Obsidian CSS variables (`--text-normal`, `--text-accent`, `--code-string` etc.); fallback color set for JSON types when variable absent |
| Settings | Default mode, indent size (2 / 4 / tab), marker style (modern/classic), auto-collapse depth (nodes strictly deeper than N start collapsed; `0` = collapse all but root, `Infinity` = expand all) |

## Error Handling & Edge Cases

| Case | Strategy |
|---|---|
| Invalid JSON in `.json` file | Forced Source mode, Tree toggle disabled, error banner with line/col; toggle re-enables once content parses cleanly |
| Invalid JSON in code block | Fall back to Obsidian's native code-block render + small "invalid JSON" indicator |
| Large files (>2 MB) | Pre-render warning; Tree mode still functional but explicit "may be slow" notice; auto-collapse-depth setting helps |
| Very large files (>10 MB) | v1.0: works but unoptimized; virtualization deferred to v2.0 |
| Empty file (`data === ""`) | Empty state with "Initialize as `{}`" button |
| External file change | Obsidian's standard `onLoadFile` lifecycle reloads — view re-renders from new buffer |
| Undo/Redo | Source: CM6 native; Tree: 10-step adapter-side stack; mode switch resets the active stack (user notified once via settings tooltip) |

## File Layout

```
src/
├── main.ts                      ← Plugin entry, registrations, settings load
├── core/
│   ├── types.ts                 ← JsonValue, JsonPath, ParseResult
│   ├── parse.ts
│   ├── serialize.ts
│   ├── render.ts                ← renderTree → HTMLElement
│   └── edit.ts                  ← editValue (immutable)
└── obsidian/
    ├── JsonFileView.ts          ← extends TextFileView; toggle, edit-handler
    ├── CodeblockProcessor.ts    ← MarkdownPostProcessor for ```json
    ├── SourceView.ts            ← CM6 wrapper, JSON language extension
    ├── TreeView.ts              ← wraps core/render with Obsidian event glue
    └── SettingsTab.ts           ← default mode / indent / marker style / auto-collapse depth

tests/
└── core/                        ← Vitest, no Obsidian imports

manifest.json                    ← Plugin manifest (id, name, version, minAppVersion)
styles.css                       ← Obsidian-CSS-variable-based styling
package.json                     ← deps: obsidian (peer), typescript, vitest, esbuild
tsconfig.json
esbuild.config.mjs
vitest.config.ts                 ← uses obsidian-plugin-test-pattern (Obsidian mock alias)
README.md
```

## Testing Strategy

**Test pyramid:**

1. **`core/` unit tests (Vitest)** — primary safety net.
   - `parse`: round-trip valid JSON; precise error position on invalid samples.
   - `serialize`: stable output, respects indent options.
   - `editValue`: immutability (input unchanged), correct path navigation, type changes work.
   - `renderTree`: snapshot tests of generated DOM for representative inputs.
   - **Target ≥95% coverage.**

2. **Adapter tests (Vitest with Obsidian mock)** — uses [obsidian-plugin-test-pattern].
   - `JsonFileView`: lifecycle (load → render → edit → save), mode switch, parse-failure fallback.
   - `CodeblockProcessor`: rendering valid / invalid / empty code blocks.

3. **Manual E2E** — every release, in a dedicated test vault.
   - Files: small config, large list, deeply nested, with Unicode keys, with intentional syntax errors.
   - All settings combinations.

## v1.0 Definition of Done

- [ ] `.json` files open in `JsonFileView` with Tree as default mode.
- [ ] Tree↔Source toggle works; Source uses CM6 with `@codemirror/lang-json`.
- [ ] Click-to-edit primitive values; edits persist via `requestSave()`.
- [ ] ```` ```json ```` postprocessor renders read-only trees in notes.
- [ ] Invalid JSON → forced Source view with line/col error banner.
- [ ] Settings tab with: default mode, indent size, marker style, auto-collapse depth.
- [ ] Vitest core coverage ≥95%; adapter tests for happy path + parse failure.
- [ ] `manifest.json`, `README.md` (install instructions, screenshot, feature list).
- [ ] Manual E2E checklist run in test vault.

## v2.0+ Backlog

- Structural tree edits (add/delete/rename/reorder, optionally drag-and-drop).
- User-defined JSON Schema validation (via `ajv`) with per-field error highlights.
- Diff view between two JSON files.
- Virtualized tree rendering for >10 MB files.
- Cross-mode unified undo/redo.
- Search across tree (filter to matching paths).
- Mobile-optimized touch interactions.

## Open Questions

None at draft time. To be re-checked during user review.
