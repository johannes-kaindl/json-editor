---
paths:
  - "src/main.ts"
  - "src/obsidian/JsonFileView.ts"
  - "src/obsidian/SourceView.ts"
  - "src/obsidian/CodeblockProcessor.ts"
  - "src/obsidian/FileEmbedProcessor.ts"
  - "src/core/history.ts"
  - "tests/obsidian/JsonFileView*.test.ts"
  - "tests/obsidian/CodeblockProcessor*.test.ts"
  - "tests/obsidian/FileEmbedProcessor.test.ts"
---

# Datei-Ansicht, Start und Rückgängig — Gotchas

Gotchas zu `JsonFileView`, `main.ts` und dem Rückgängig-Stapel.

- **`JSON_VIEW_TYPE` is the internal view-registration key, NOT the plugin id — never change it.** The Phase-3 rename `obsidian-json-editor` → `json-editor` (manifest, package, deploy and install paths, build banner) deliberately left it alone; the GUI-smoke driver carries the same value as `VIEW_TYPE`.
- **`registerExtensions` is wrapped in try/catch and its order matters.** Another plugin may already claim `.json`; an orphaned old install of this plugin collided on the `.json` claim on an iPhone and looked like a load failure of the new build (diagnosed with systematic debugging, not a code defect).
- **Per-file state is reset on every file switch** (`resetPerFileState()`: history, schema, query, mode). History was once never reset in `clear()`/`setViewData()` and undo crossed files; the breadcrumb once kept the previous file's path after a switch in the same tab.
- **One unified `History<string>`** lives in `JsonFileView` (cap 100): both `applyMutation` and `handleSourceChange` push the pre-state text, the mode switch does not clear it, and `SourceView` has no local CodeMirror `history()`. Source-mode undo is per `onChange` (about per keystroke), not CodeMirror's grouping. Source undo applies through `diffReplaceSpan` and `SourceView.applyExternalEdit` (no editor rebuild).
- **Command IDs are `undo-edit` / `redo-edit`** (renamed in 1.2.0 from `undo-tree-edit` / `redo-tree-edit`; not mode-gated any more). No default hotkeys are bound; the view-local `Scope` carries `Mod+F`, `Mod+Z`, `Mod+Shift+Z` and `Mod+E` (tree/source toggle) and docks onto the core binding without a global override (return `undefined` in an input so native undo stays).
- **`getLanguage()` is replaced by `moment.locale()`** in `src/main.ts` (`safeGetLanguage`); with `minAppVersion` 1.11.4 that is no longer necessary, but it still works.
- **A markdown view keeps its editor and reading-mode containers in the DOM at the same time**, the inactive one sized 0×0 and placed first; `document.querySelector` hits the invisible twin (relevant for code blocks, embeds and drivers: scope queries to the view root).
- **`.jsonc` code blocks render read-only**; the file embed (`![[file.json]]`, reading view) renders a collapsed read-only tree instead of the file chip (≤ 512 KB, no `#part`).
