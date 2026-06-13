# Phase 2 — Guideline+UX-Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline; items share `JsonFileView.ts`/`main.ts`/`SourceView.ts`). Strict TDD, failing-test-first. Detailed per-item recon (verified file:line, API facts, mock needs) lives in the workflow output `wp649km2b` — consult it for specifics.

**Goal:** Fix the guideline violations and ship the high-value UX gaps from the 2026-06-12 gap audit (Sections 2 + 3 + 4.1), as release `1.6.0`.

**Architecture:** Two-layer split preserved. Test env happy-dom; mock at `src/__mocks__/obsidian.ts` (needs additions: `Scope`, `TextFileView.addAction`+`actionsEl`, `onOpen`, `normalizePath`). Production typechecks vs real obsidian (`tsconfig.build.json`). Baseline 478 green.

**Branch:** `feat/guideline-ux` off `main`. Commit per item-cluster (Conventional Commits + trailer). Tag/push/merge are GATES.

**Implementation order** (conflict-minimizing; 2.14 LAST so the lint gate sees an already-clean tree):

1. **2.3 + 2.16 — core edit safety** (`src/core/edit.ts`, pure). `Object.fromEntries` rebuilds in deleteAt/moveObjectKey/renameKey; `Object.prototype.hasOwnProperty.call` guards (`in`→hasOwnProperty at lines ~55/104/240/241). RED: fixture via `JSON.parse('{"__proto__":{"x":1},"a":1}')`, assert own-key survives delete/rename/reorder (use `hasOwnProperty.call`/`Object.keys`, NOT toEqual) + legit keys (constructor/toString) addable. Ship :241 guard + :245 rebuild together.
2. **2.19 + 2.20 — clipboard guard + normalizePath** (`CopyButton.ts`, `JsonFileView.ts`, `SettingsTab.ts`; mock gains `normalizePath`). CopyButton: presence-guard + `new Notice("Copy failed")` on absent/rejected. `normalizePath(schemaPath)` in tryLoadCompanionSchema; pure `isValidCompanionSuffix` (endsWith `.json`, no separators) gating the setting.
3. **2.22 — window timers** (`Tooltip.ts`, `TreeView.ts`, `CodeblockProcessor.ts`, `CopyButton.ts`): `setTimeout`→`window.setTimeout`, type as `number`. Existing fake-timer tests are the regression guard.
4. **2.21 — Tooltip inline style**: drop `el.style.position="absolute"` (CSS already sets it); left/top via `setProperty`.
5. **2.11 + 2.12 — popout + lifecycle**: Tooltip takes a host el (`this.contentEl`) → `ownerDocument`/`defaultView`; TypeMenu listeners on `anchor.ownerDocument`; `export closeActiveMenu()`; `onunload` adds `sourceView?.destroy()` + `closeActiveMenu()`.
6. **2.1 + 2.23 — hotkeys out + view Scope + command names** (`main.ts`, `JsonFileView.ts`; mock gains `Scope`, app stub `app.scope`). Remove `hotkeys` from 3 commands; rename to "Focus search"/"Undo edit"/"Redo edit" (keep IDs); `this.scope = new Scope(this.app.scope)` registering Mod+F/Mod+Z/Mod+Shift+Z, **returning `undefined`** when an inline-edit/rename/add input or `.cm-editor` is focused (so native input-undo fires). Bump `main.test.ts` command count.
7. **3.1 — toggle command + view-header action** (`JsonFileView.ts`, `main.ts`; mock gains `addAction`+`actionsEl`, `onOpen`). Public `toggleMode()` delegating to `switchTo`; `addCommand({id:"toggle-tree-source", name:"Toggle tree/source view", checkCallback})` **no default hotkey**; `addAction("list-tree", …)` in `onOpen`. command count → 4.
8. **2.2 — source-mode undo via CM transaction** (`src/core/textdiff.ts` new + `SourceView.ts` + `JsonFileView.restoreText`). Pure `diffReplaceSpan(old,next)→{from,to,insert}` (common prefix/suffix); `SourceView.applyExternalEdit(text)` dispatches the minimal change with `Transaction.addToHistory.of(false)` (no setValue, no rebuild); `restoreText` branches on `mode==="source" && sourceView` → `applyExternalEdit` + update data/banners/validation WITHOUT `refreshMode`. Assert editor-node identity survives undo (happy-dom can't see the caret).
9. **3.2 — source search + mode-aware Cmd+F** (`@codemirror/search` devDep + `SourceView.ts` + `JsonFileView.focusSearch`). `searchKeymap`+`highlightSelectionMatches` in mount; public `openSearch()` (`openSearchPanel`); `focusSearch`: source→`openSearch()`, tree→`searchBar.focus()` (remove the force-switch).
10. **4.1 — large-file guard** (`src/core/render-budget.ts` new + `LargeFileBanner.ts` new + `JsonFileView.ts`). Pure `exceedsRenderBudget(data,value)` (byte cap `MAX_TREE_BYTES=1_000_000` + early-exit node count `MAX_TREE_NODES=15_000`); on exceed force source mode + banner with "Load tree anyway" (override flag reset in `resetPerFileState`). Large→source precedes lossy→read-only.
11. **2.14 — eslint-plugin-obsidianmd** (LAST). `eslint@9` + `eslint-plugin-obsidianmd` devDeps; `eslint.config.mjs` (flat, `obsidianmd.configs.recommended`, scoped to `src/`, ignore tests/mocks/main.js/coverage); `lint:obsidian` script; CI step; fix residual sentence-case (`SettingsTab` "Validate against JSON schema"). Config-presence test (source-scan idiom). If type-aware config proves fragile/slow, fall back to a scoped/non-type-aware setup and document; do not destabilize CI.

### Closeout (before the Phase-2 gate)
- Full `npx vitest run` all green; `npm run build` + `biome check` clean; `npm run lint:obsidian` clean.
- Adversarial multi-dimension code-review workflow over the branch diff; fix confirmed findings.
- GATE: report to user; await go-ahead for 1.6.0 bump/tag/push.

### Out of scope (Phase 3 / later)
- ID-rename `json-editor`, README/SECURITY/AGENTS docs (2.4–2.7, 2.15), numeric-key-reorder README note (audit 1.4).
- 2.x ideas (3.3–3.13, 6.x), mobile interaction model (Section 4.2–4.5, 6.10), A11y Section 5.
