# `.jsonc` Support — Design Spec

**Date:** 2026-07-11
**Status:** Ratified (brainstorm → this spec → plan → TDD implementation)
**Target release:** `1.10.0` (new feature — minor bump)

## Goal

Support `.jsonc` files (JSON with `//` and `/* */` comments and trailing commas) with
**full tree editing that preserves comments and formatting**. Opening a `.jsonc` file, editing
in the tree, and saving must never destroy comments — consistent with the plugin's existing
data-loss sensitivity (lossy-number guards, etc.).

## Scope decisions (ratified in brainstorm)

1. **Only `.jsonc`.** `.json` behavior is unchanged (strict `JSON.parse`, value-based edit path).
   No opt-in comment tolerance for `.json` — strict parse errors on `.json` are a feature. The
   jsonc path is nice-to-have-extendable to `.json` later, but out of scope now.
2. **Comments are preserved, not shown in the tree.** The tree renders the stripped `JsonValue`
   exactly as today; comments live in the file and are visible in Source mode. Only the *mutation
   path* diverges for `.jsonc`.
3. **`` ```jsonc `` code blocks** in Markdown notes render read-only (comment-tolerant), analogous
   to the existing `` ```json `` processor.

## Engine choice

**Microsoft `jsonc-parser` (v3.3.1, MIT, zero-dep, eval-free).** It is a second runtime dependency
alongside `@cfworker/json-schema`, and meets the same ethics bar (eval-free, no transitive deps).
It is the validator VS Code itself uses.

Rejected alternatives: a hand-rolled CST parser (owns parser-correctness + ReDoS surface — against
the small-surface ethic); regex comment-stripping + the old serialize path (loses comment *positions*
→ comments land wrong or vanish on save — violates the data-loss guarantee).

API used:
- `parse(text, errors?, opts?)` → JS value (comment-tolerant, strips comments) — for tree + schema.
- `parseTree(text)` → CST `Node` (with `offset`/`length`/`children`) — for rename + reorder.
- `findNodeAtLocation(root, path)` → `Node` — locate a node by JSON path.
- `modify(text, path, value, opts)` → `Edit[]` (comment/format preserving; `value === undefined`
  = removal) and `applyEdits(text, edits)` → `string`.

## Architecture — the dual path

`.json` and `.jsonc` differ at exactly **one** place: the mutation path. Everything else (tree
render, Source mode, unified undo, schema) is shared.

```
                     .json                          .jsonc
  Load    parse() [JSON.parse, strict]     jsoncParse() [tolerant, strips //,/* */]
  Tree    renderTree(currentValue)  ← identical, from the stripped JsonValue →
  Edit    serialize(newValue)  ←──── diverges HERE ────→ jsoncModify(source, path, op)
  Undo    History<string>  ← identical, text-based (enabler since 1.2.0) →
```

The unified history being `History<string>` (since 1.2.0) is the enabler: both paths produce a
new document *string*, so undo/redo and cross-mode switching work identically.

## New pure module: `src/core/jsonc.ts`

Obsidian-free (Vitest-direct), preserving the two-layer boundary. Wraps `jsonc-parser` and offers
**text-in / text-out** operations mirroring `edit.ts`'s signatures — but on `string` (source) not
`JsonValue`. All functions take the current source text and a `JsonPath` and return the new source.

```ts
// Parse (comment-tolerant). Returns the same ParseResult shape as core/parse.ts so the
// view's recomputeFromData() can treat both uniformly. Uses jsonc-parser's error list to
// report the first structural error's line/col.
export function jsoncParse(text: string): ParseResult;

// Mutations — each returns the new source text (comments/formatting preserved).
export function jsoncEditValue(src: string, path: JsonPath, newVal: JsonValue): string;
export function jsoncAddKey(src: string, parentPath: JsonPath, key: string, val: JsonValue): string;
export function jsoncAddItem(src: string, parentPath: JsonPath, val: JsonValue): string;
export function jsoncDelete(src: string, path: JsonPath): string;
export function jsoncRenameKey(src: string, path: JsonPath, newKey: string): string;
export function jsoncMoveArrayItem(src: string, arrayPath: JsonPath, from: number, to: number): string;
export function jsoncMoveObjectKey(src: string, objPath: JsonPath, key: string, delta: number): string;
export function jsoncChangeType(src: string, path: JsonPath, newType: JsonType): string;
```

### Op mapping

`JsonPath` (our `(string|number)[]`) maps directly onto jsonc-parser's `JSONPath`.
A shared `FormattingOptions` is derived from the file's existing indentation (detected from the
source, falling back to the `indent` setting) so inserted content matches the file.

| Op | Implementation |
|---|---|
| `jsoncEditValue` | `applyEdits(src, modify(src, path, newVal, {formattingOptions}))` |
| `jsoncAddKey` | `modify(src, [...parentPath, key], val, {formattingOptions})` |
| `jsoncAddItem` | index = current array length; `modify(src, [...parentPath, index], val, {isArrayInsertion: true, formattingOptions})` |
| `jsoncDelete` | `modify(src, path, undefined, {formattingOptions})` (removes the property/element incl. its comma) |
| `jsoncChangeType` | `modify(src, path, defaultForType(newType), {formattingOptions})` — replaces the old value (and its *inner* comments; expected when the structure changes) |
| `jsoncRenameKey` | **targeted key-token edit** (see below) — preserves the value and all its comments |
| `jsoncMoveArrayItem` / `jsoncMoveObjectKey` | **reorder** (see below) — the one op without a full position guarantee |

### `jsoncRenameKey` — targeted key-token edit

`jsonc-parser.modify` cannot rename a key (only set values / add / remove). Doing it as
remove-old + add-new would move the value and drop comments attached to it. Instead:

1. `parseTree(src)` → root.
2. `findNodeAtLocation(root, path)` → the value node; its `.parent` is the `property` node.
3. The property node's `children[0]` is the key-string node (`offset`/`length`).
4. Apply a single edit replacing `[keyNode.offset, keyNode.length]` with `JSON.stringify(newKey)`.

The value subtree (and every comment inside or trailing it) is untouched.

### Reorder — the one bounded operation

Reorder is the only op that cannot guarantee full comment-position fidelity, because comments and
formatting live in the whitespace *between* element nodes, not in the nodes. Ratified semantics:

- The moved element **and a same-line trailing comment** (`… , // note`) move with it.
- **Free-standing comment lines** (a `// note` on its own line before an element) keep their
  absolute position.
- **No comment is ever lost** — every comment remains in the file. Only a free-standing comment's
  *logical* association can end up next to the wrong element after a reorder.

This is a documented boundary, not a bug; full positional reorder is a 2.x candidate. Implementation:
use `parseTree` to get the container's child element extents (node span + optional same-line trailing
comment), recompute the child order, and rebuild the container's inter-brace text with correct comma
fix-up. Free-standing gap comments are re-emitted at their original relative slot.

## Adapter integration: `src/obsidian/JsonFileView.ts`

- **`isJsonc: boolean`** computed once from `this.file?.extension === "jsonc"` (recomputed in
  `setViewData`/`resetPerFileState`, since a TextFileView instance is reused across files).
- **`recomputeFromData()`** picks the parser: `isJsonc ? jsoncParse(this.data) : parse(this.data)`.
  Both return `ParseResult`, so the rest (banner, tree-pill, `currentValue`) is unchanged.
- **The mutation handlers** (`applyEdit`, `applyAddKey`, `applyDelete`, `applyRename`,
  `applyMoveItem`, `applyMoveKey`, `applyChangeType`) branch:
  - `.json` → today's path: pure `edit.ts` op on `currentValue` → `applyMutation(newValue)` →
    `serialize`.
  - `.jsonc` → `jsonc*` op on `this.data` (source text) → new source string pushed straight into the
    history + `recomputeFromData()` (no `serialize`).
- A small shared helper `commitSource(newText, description)` factors the common tail (history push,
  `this.data = newText`, `recomputeFromData`, re-render, refresh undo buttons) so both paths converge
  after producing their new document string. `applyMutation` (value path) delegates to it after
  `serialize`.

## Extension registration: `src/main.ts`

- `registerExtensions(["jsonc"], JSON_VIEW_TYPE)` alongside `["json"]`, wrapped in the same
  try/catch guard (another plugin may own `.jsonc`); failure disables the file view for that
  extension only, code-block rendering stays active.
- `JSON_VIEW_TYPE` is unchanged (a single view type serves both extensions; the view decides
  behavior from `isJsonc`).

## Code block: `src/obsidian/CodeblockProcessor.ts`

- `renderJsonCodeblock` gains a `lang: "json" | "jsonc"` parameter (default `"json"`).
- For `"jsonc"` it parses via `jsoncParse` (tolerant) and the header label reads `JSONC`.
- `main.ts` registers a second processor: `registerMarkdownCodeBlockProcessor("jsonc", …)`.
- Read-only, same card/collapse/copy behavior as the `json` block.

## Source mode

`SourceView` currently hard-installs `@codemirror/lang-json`'s `json()` with **no linter**, so
comments produce no error markers — only slightly imperfect highlighting. For the MVP this is
acceptable and needs no change: `.jsonc` is fully editable in Source mode today. A dedicated jsonc
CodeMirror language is a future polish, explicitly out of scope.

## Schema validation

Companion-schema validation (opt-in) already strips nothing. For `.jsonc` the value handed to the
validator comes from `jsoncParse` (comments stripped), so validation is unaffected. The companion
suffix convention (`<file>.schema.json`) applies identically; a `.jsonc` looks up `<name>.schema.json`.

## Error handling

- `jsoncParse` reports the first structural error (jsonc-parser's `ParseError` list has `offset`
  + `error` code) mapped to line/col via the existing `offsetToLineCol` helper (extracted/shared).
  Comments and trailing commas are **not** errors.
- If a `.jsonc` file is structurally broken, the same parse-error banner shows and the tree pill is
  disabled — identical UX to `.json`.
- Large-file guard, lossy-number guard: unchanged (they operate on the parsed value + raw text).

## Testing (strict TDD)

**`tests/core/jsonc.test.ts`** (the heart — write first, red → green):
- Round-trip: `jsoncParse` of a commented doc yields the right value; every mutation on a commented
  doc preserves unrelated comments byte-for-byte.
- Each op: editValue, addKey, addItem, delete, rename (key comment + value comment preserved),
  changeType, reorder (ratified semantics — same-line trailing comment moves, free-standing stays).
- Trailing commas tolerated on parse and not corrupted by unrelated edits.
- Indentation detection: inserted content matches the file's existing indent.
- **Acceptance test:** open + save with no edit = byte-identical source.

**`tests/obsidian/JsonFileView.jsonc.test.ts`:**
- `isJsonc` routing: a `.jsonc` file uses the source-edit path (comment survives an
  edit→undo→redo cycle); a `.json` file still uses serialize.
- Cross-mode: edit in tree (comment preserved), switch to source, comment is there; Cmd+Z restores.

**`tests/obsidian/CodeblockProcessor.jsonc.test.ts`:** a `` ```jsonc `` block with comments renders a
read-only tree; label reads `JSONC`; malformed → error card.

**`tests/main.jsonc.test.ts`** (mock extended): `registerExtensions(["jsonc"], …)` is called and
guarded; the `jsonc` code-block processor is registered.

Target: existing 605 tests stay green; add ~30–40 for the jsonc surface.

## Out of scope (YAGNI / future)

- Comment tolerance for `.json` (opt-in setting) — nachrüstbar; the jsonc path already exists.
- Showing comments as rows in the tree — bigger renderer rewrite.
- Dedicated jsonc CodeMirror language (perfect Source-mode highlighting).
- Full positional-fidelity reorder for free-standing comments.
- `.jsonc` companion schema *as jsonc* (companion stays `.json`).

## Docs to touch on release

README (supported extensions + the reorder-comment boundary as a known limitation), CHANGELOG,
AGENTS.md (runtime deps: now two; repo-layout note for `core/jsonc.ts`), THIRD-PARTY-NOTICES
(`jsonc-parser` MIT), manifest description (optional: mention `.jsonc`).
