# Decisions

The why of `json-editor`: design decisions, deliberately open items and deviations. Never loads on its own; the core of `AGENTS.md` points here. The derivation (including the 2026-06 gap audit with the A11y sections and the 2.x list) stays in the maintainer's cockpit under `$VAULT/25_Coding/json-editor/_SDD/`.

## Design decisions

- **Deliberately small surface:** vanilla TypeScript, two runtime dependencies (`@cfworker/json-schema` and `jsonc-parser`, both eval-free, no transitive dependencies), strict TDD, no telemetry and no remote resources.
- **`@cfworker/json-schema` instead of `ajv`** (1.9.0): it removes the "dynamic code execution" disclosure at the source (`new Function`/`eval` in the bundle: 0) and halves the bundle (about 176 KB to 85 KB).
- **Deep files are handled by focusing a branch, not by a global level switch** (Unreleased, decided 2026-11-08): the width problem is a layout one. A nested container sits beside its key in the flex row, so each level costs the key's width plus the indent (measured: a 90-character value kept 38 px at depth 4, 8 px at depth 8). A level switch (open to depth n) only helps the height. Focus (`TreeView.setFocus`, `renderTree({ rootPath })`) restarts the indent at the chosen branch while row paths, edit callbacks, search and the collapse memory stay document-relative. A depth/level model as a pure function was not built: it would be gate-bound (no plugin type in the signature) and belongs in the kit once a second tree needs it. Strings keep `min-width: 32ch` and `.json-content` no longer clips, so the pane scrolls sideways instead of wrapping to one character per line; the toolbar is `position: sticky`.
- **`.jsonc` is a dual mutation path** (1.10.0): `.json` behaviour stays byte-for-byte unchanged; only the mutation path diverges, so comments and formatting survive.
- **One unified undo stack across tree and source mode** (1.2.0): the mode switch does not clear it; the price is that source-mode undo is per change, not grouped like CodeMirror's.
- **No default hotkeys; a view-local `Scope`** (1.6.0, part of the guideline release): the commands carry no default binding, the view binds its keys itself.
- **Schema validation is opt-in** (1.5.0, blocker release): the companion schema was loaded synchronously on the main thread by default, a ReDoS risk; `compileSchema` also carries pattern and size guards.
- **Deleting in the tree asks nothing** (Entscheidung Johannes, 2026-10-15, Welle 23): no confirmation before a delete (undo restores every step, and Backspace sequences in a tree would otherwise be a standing question); deleting an object or list with content shows a message with an Undo button instead (1.18.0).
- **Mobile model:** a long-press `Menu` replaces hover affordances and drag-and-drop on `Platform.isMobile` (1.8.0).

## Deliberately open

- **i18n of the rest of the interface** (decided 2026-10-13 as later, priority low; re-checked 2026-10-23, it stands): about 140 capitalised UI string literals in about 26 files (measured 2026-10-23), plus a layout check in both languages; its own wave. Today `src/i18n/strings.ts` carries en/de for the repair feature and the delete message only.
- **A11y:** `aria-level` / `setsize` / `posinset` and duplicate `treeitem` roles change the tree structure, and keyboard interaction in the code-block tree is a new interaction model; both want their own design round. `aria-pressed` on the mode pills is a small leftover.
- **2.x ideas, no spec:** cross-container drag and drop (raises validation and type questions), real pointer-events touch-drag, `$schema` URL fetching with vault-path resolution for offline schemas, per-workspace schema pinning, persistent undo across file reopens, batching source-mode history by time window, schema autocompletion, multi-select, `.jsonl`.

## Deviations from the guideline

None open.
