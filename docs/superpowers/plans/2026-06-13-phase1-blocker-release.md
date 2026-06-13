# Phase 1 — Blocker-/Stabilitäts-Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the blockers share `JsonFileView.ts`/`TreeView.ts`, so execute INLINE — not via parallel subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 7 submission-blocking defects from the 2026-06-12 gap audit (Section 1) plus the bundled per-file-state reset (2.8), making the 3 intentionally-red repro tests green and producing a stable, submission-ready release candidate.

**Architecture:** Strict TDD, failing-test-first. Honor the two-layer split: `src/core/` is pure TS (no Obsidian imports, vitest-direct), `src/obsidian/` is the adapter. Test env is **happy-dom** with `obsidian` aliased to `src/__mocks__/obsidian.ts`. Decisive infra fact: **`el.empty()` does not exist in happy-dom — use `el.replaceChildren()`**.

**Tech Stack:** TypeScript, Vitest (happy-dom), esbuild, ajv@8. Source recon (verified, with file:line) is archived at `docs/superpowers/specs/2026-06-12-gap-audit.md` (the spec) and the recon workflow output (per-blocker TDD strategy).

**Baseline:** `npm test` → 402 pass, 3 fail (the repro tests, by design). `npm run build` clean.

**Implementation order** (minimizes edit-conflicts on shared files): 1.5 → 1.2+2.8 → 1.4 → 1.3 → 1.6 → 1.7 → 1.8. Rationale: 1.5 makes the 6 DOM-clear sites idiomatic before 1.2/1.8 refactor `clear()`/`render()`; reset-state (1.2+2.8) lands the shared `resetPerFileState()` that 1.4's lossy-flags hook into.

**Branch:** `fix/submission-blockers` (off `main`). Commit per task (Conventional Commits + the project trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`). Tag/push/merge are GATES — do NOT perform without explicit user go-ahead.

---

### Task 0: Branch + adopt the repro test as the failing baseline

**Files:**
- Modify (git): create branch `fix/submission-blockers`
- Add: `tests/obsidian/JsonFileView.fileswitch.repro.test.ts` (currently untracked — the 3 red tests for 1.2)

- [ ] **Step 1:** `git checkout -b fix/submission-blockers`
- [ ] **Step 2:** `git add tests/obsidian/JsonFileView.fileswitch.repro.test.ts && git commit -m "test(obsidian): failing repro for cross-file undo data loss (blocker 1.2)"` — TDD failing-test-first baseline. (Trailer as above.)
- [ ] **Step 3:** `npx vitest run tests/obsidian/JsonFileView.fileswitch.repro.test.ts` → expect 3 FAIL.

---

### Task 1: Blocker 1.5 — `innerHTML = ""` → `replaceChildren()` (6 sites)

**Files:**
- Modify: `src/obsidian/JsonFileView.ts:102,218,279`, `src/obsidian/TreeView.ts:138`, `src/obsidian/SettingsTab.ts:36`, `src/obsidian/Breadcrumb.ts:21`
- Create: `tests/obsidian/no-innerhtml.regression.test.ts`

- [ ] **Step 1 (RED):** Write `tests/obsidian/no-innerhtml.regression.test.ts` — read the six `src/obsidian` files via `fs` (use `fileURLToPath(new URL('../../src/obsidian/X.ts', import.meta.url))`) and `expect(src).not.toMatch(/\.innerHTML\s*=/)` and `not.toMatch(/outerHTML/)` per file.
- [ ] **Step 2:** Run it → 6 FAIL (innerHTML still present).
- [ ] **Step 3 (GREEN):** Replace all six `<el>.innerHTML = "";` with `<el>.replaceChildren();`.
- [ ] **Step 4:** `npx vitest run tests/obsidian/no-innerhtml.regression.test.ts` → PASS. Then `npx vitest run` → 402 pass / 3 repro fail (unchanged).
- [ ] **Step 5:** Commit `fix(obsidian): replace innerHTML clears with replaceChildren() (blocker 1.5)`.

**Note:** A second copy `design/plugin-build/styles.css` exists but is gitignored/not deployed — ignore.

---

### Task 2: Blockers 1.2 + 2.8 — `resetPerFileState()` (history + schema + query + mode)

**Files:**
- Modify: `src/obsidian/JsonFileView.ts` (`setViewData` sig+head :68; `clear()` :97-104; new private method)
- Create: `tests/obsidian/JsonFileView.fileswitch.state.test.ts` (the 2.8 state tests)
- Existing: `tests/obsidian/JsonFileView.fileswitch.repro.test.ts` (the 1.2 history tests, already red)

- [ ] **Step 1 (RED):** Add `tests/obsidian/JsonFileView.fileswitch.state.test.ts`. Mirror repro setup (`fakeLeaf`, `DEFAULT_SETTINGS`, `document.body.appendChild(v.contentEl)`). Copy `PERSON_SCHEMA` from `JsonFileView.schema.test.ts`. Three failing tests:
  - **schema reset:** load `{"age":"old"}` (clear=true), `v.setSchema(PERSON_SCHEMA)` → banner visible; then `v.clear(); v.setViewData('{"x":1}', true)` → assert `.json-schema-banner` hidden AND no `.json-row.json-row-error`.
  - **mode reset:** `defaultMode:"tree"`; `setViewData('{not valid}', true)` → `.cm-editor` present (forced source); then `setViewData('{"a":1}', true)` → `.json-tree-root` present AND `.cm-editor` null.
  - **query reset:** `setViewData('{"port":8080}', true)`; type `port` into `.json-search-input` (set `.value`, dispatch `new Event('input')`) → `.json-match` present; then `v.clear(); setViewData('{"host":"x"}', true)` → input value `''`, zero `.json-match`, `.json-search-count` hidden.
  - **guard (keep history on internal restore):** two edits, `v.undo()` once → assert `v.canRedo() === true` (proves clear=false path does NOT reset).
- [ ] **Step 2:** Run both fileswitch test files → state tests FAIL, repro tests still FAIL.
- [ ] **Step 3 (GREEN):** In `JsonFileView.ts`:
  - Rename `setViewData(data, _clear)` → `setViewData(data: string, clear: boolean)`; insert at the **very top** of the body (before the empty-string branch): `if (clear) this.resetPerFileState();`
  - In `clear()` add `this.resetPerFileState();`
  - Add method:
    ```ts
    private resetPerFileState(): void {
      this.history.clear();
      this.currentSchema = null;
      this.currentQuery = "";
      this.searchBar.clear();
      this.mode = this.settings.defaultMode;
      // 1.4 lossy flags reset here too (added in Task 3).
    }
    ```
  - Verify `restoreText` keeps `setViewData(text, false)` (undo/redo must NOT reset). Empty-state init button keeps `setViewData("{}", false)`.
- [ ] **Step 4:** `npx vitest run tests/obsidian/JsonFileView.fileswitch.repro.test.ts tests/obsidian/JsonFileView.fileswitch.state.test.ts tests/obsidian/JsonFileView.undo.test.ts tests/obsidian/JsonFileView.schema.test.ts tests/obsidian/JsonFileView.test.ts` → ALL pass. Then full `npx vitest run`.
- [ ] **Step 5:** Commit `fix(obsidian): reset per-file state (history, schema, query, mode) on file switch (blockers 1.2, 2.8)`.

**Ordering trap:** the `if (clear)` reset MUST precede the empty-data early-return so an empty file B also resets. `mode = defaultMode` runs before parse, so an invalid file B still correctly lands in source via the existing `mode = "source"` line.

---

### Task 3: Blocker 1.4 — lossy number-roundtrip warn banner + read-only-on-lossy

**Files:**
- Create: `src/core/roundtrip.ts`, `tests/core/roundtrip.test.ts`, `src/obsidian/LossBanner.ts`, `tests/obsidian/LossBanner.test.ts`, `tests/obsidian/JsonFileView.lossy.test.ts`
- Modify: `src/obsidian/JsonFileView.ts` (field + `setViewData` success branch + `buildChrome` + `refreshMode` readonly + `resetPerFileState`)

**Decision:** On load, detect number-roundtrip loss on the ORIGINAL TEXT. If lossy → show a persistent warn banner AND open the tree **read-only** (reuse `TreeViewOptions.readonly`), so a tree edit cannot silently rewrite untouched 64-bit ints. Source mode stays editable; fixing the literal in source recomputes the flag.

- [ ] **Step 1 (RED, core):** `tests/core/roundtrip.test.ts` for `hasNumberRoundtripLoss(text: string): boolean`:
  - true for `{"id":9007199254740993}` (>2^53 precision)
  - true for `{"x":1.0}` (format normalize), true for `{"x":1e3}`
  - false for `{"a":1,"b":[true,null,"x"],"c":3.14}` (faithful)
  - false for `{"a":"1.0"}` (numeric-looking STRING must not trigger)
  - false for the same object re-indented (whitespace is not loss)
- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3 (GREEN, core):** Implement `src/core/roundtrip.ts`. Approach: walk the parsed value; for each number, compare its source literal against `String(value)`. Token-aware: derive each number's original literal by re-parsing — simplest robust impl: a small JSON number-literal scanner that skips string contents, collecting each numeric literal `lit`; flag if `String(Number(lit)) !== normalize(lit)` where `normalize` strips a single leading `+`, trailing-zero/`.0`, and lowercases `e`/removes `e+0`-style — i.e. flag whenever the canonical `Number()` round-trip differs from the literal. Keep dependency-free, no obsidian import.
- [ ] **Step 4 (RED, banner):** `tests/obsidian/LossBanner.test.ts` mirroring `SchemaBanner.test.ts`: `getElement().hidden` true initially; `show(msg)` → not hidden + textContent; `hide()` → hidden.
- [ ] **Step 5 (GREEN, banner):** `src/obsidian/LossBanner.ts` mirroring `SchemaBanner.ts` (div `.json-lossy-banner`, `textContent`/`hidden`, no innerHTML).
- [ ] **Step 6 (RED, adapter):** `tests/obsidian/JsonFileView.lossy.test.ts`:
  - load `{"id":9007199254740993}` (clear=false) → `.json-lossy-banner` present/visible AND `.json-error-banner` null.
  - load `{"a":1}` → `.json-lossy-banner` hidden/absent.
  - lossy doc → tree is read-only: assert a structural action is unavailable (e.g. no `.json-row-action` delete fires a save) — concretely: `const before = saveCount; editFirstString(v,'x'); expect(saveCount).toBe(before)` (read-only tree does not open the editor / does not mutate).
- [ ] **Step 7 (GREEN, adapter):**
  - Add `private lossyRoundtrip = false;` near the other fields.
  - In `buildChrome`, after `schemaBanner`, append a `LossBanner` instance.
  - In `setViewData` success branch (after setting `currentValue`): `this.lossyRoundtrip = hasNumberRoundtripLoss(data); this.lossyRoundtrip ? this.lossBanner.show("This file contains numbers that JSON cannot represent exactly (e.g. integers > 2^53). Tree editing is disabled to avoid silently rewriting them — edit in Source mode.") : this.lossBanner.hide();` (hide also in the empty + invalid branches).
  - In `refreshMode`, pass `readonly: this.lossyRoundtrip` into the `TreeView` options.
  - In `resetPerFileState`, add `this.lossyRoundtrip = false; this.lossBanner.hide();`
- [ ] **Step 8:** Run the new files + full suite → green.
- [ ] **Step 9:** Commit `fix: warn + read-only tree on lossy number roundtrip (blocker 1.4)`.

**Traps:** detector must compare number tokens only, never whole-text equality (indent差 is not loss); never flag numeric text inside strings; keep `LossBanner` DOM ordering deterministic so the existing "toolbar before body" / "empty-state has no error banner" tests stay green.

---

### Task 4: Blocker 1.3 — schema autoload opt-in + compile-time ReDoS guards

**Files:**
- Modify: `src/obsidian/SettingsTab.ts:18` (default flip), `:94-104` (desc), `src/core/schema.ts` (guards)
- Modify tests: `tests/obsidian/SettingsTab.test.ts` (toEqual), `tests/core/schema.test.ts`, `tests/obsidian/JsonFileView.schema.test.ts`

- [ ] **Step 1 (RED, settings default):** In `tests/obsidian/SettingsTab.test.ts`, change the `DEFAULT_SETTINGS` `toEqual` to expect `validateAgainstSchema: false`. Run → FAIL.
- [ ] **Step 2 (RED, core guards):** In `tests/core/schema.test.ts` add:
  - `compileSchema(JSON.stringify({type:'string', pattern:'^(a+)+$'}))` → `ok:false`, `error` matches `/unsafe|pattern|complex/i`.
  - `compileSchema(<text longer than the size cap>)` → `ok:false`, `error` matches `/too large|size/i`.
  - keep an existing valid schema (e.g. `{type:'object', properties:{name:{type:'string'}}}` / PERSON_SCHEMA) compiling `ok:true` (guard must not over-reject; include a benign `pattern:'^[a-z]+$'` case → `ok:true`).
- [ ] **Step 3:** Run → new guard tests FAIL.
- [ ] **Step 4 (GREEN, core):** In `compileSchema`:
  - Before `JSON.parse`: `const MAX_SCHEMA_BYTES = 1_000_000; if (text.length > MAX_SCHEMA_BYTES) return { ok:false, error: "Schema too large" };`
  - After parse, before `ajv.compile`: recursively collect every `pattern` string and every key of `patternProperties`; for each, if it matches the conservative nested-quantifier heuristic `/\([^)]*[+*][^)]*\)\s*(?:[+*]|\{)/`, return `{ ok:false, error: \`Schema contains a potentially unsafe regex pattern: ${p}\` }`. Add a code comment that this is a heuristic (catches classic `(a+)+`-style catastrophic backtracking, not all ReDoS) and that the real defense is opt-in + a Worker is the long-term fix (no synchronous timeout possible).
- [ ] **Step 5 (GREEN, settings):** Flip `DEFAULT_SETTINGS.validateAgainstSchema` to `false`; update the "Validate against JSON Schema" `.setDesc` to note it's off by default and auto-loads a sibling schema (the toggle IS the explicit consent). The guard rejection already surfaces via the existing `setSchemaParseError` path.
- [ ] **Step 6:** Run `tests/core/schema.test.ts tests/obsidian/SettingsTab.test.ts tests/obsidian/JsonFileView.schema.test.ts` + full suite → green. (The 6 schema-validation view tests call `setSchema()` directly, bypassing autoload, so they stay green.)
- [ ] **Step 7:** Commit `fix: schema autoload opt-in + compile-time ReDoS guards (blockers 1.3, 4.9)`.

---

### Task 5: Blocker 1.6 — guard `registerExtensions` so a `.json` collision can't kill the plugin

**Files:**
- Modify: `src/main.ts` (import Notice, reorder, try/catch), `src/__mocks__/obsidian.ts` (add `addCommand` + `commands` to mock Plugin — test infra)
- Create: `tests/obsidian/main.test.ts`

- [ ] **Step 1 (infra):** Add to mock `Plugin` in `src/__mocks__/obsidian.ts`: `commands: any[] = []; addCommand(cmd){ this.commands.push(cmd); }` (and ensure `registerMarkdownCodeBlockProcessor`/`registerView`/`addSettingTab` record into inspectable fields; add minimal recorders if missing). Confirm exported `Notice` captures its message.
- [ ] **Step 2 (RED):** `tests/obsidian/main.test.ts` (mirror `FakePlugin` pattern from `SettingsTab.test.ts`):
  - collision: subclass `JsonEditorPlugin` overriding `registerExtensions` to `throw new Error('Attempting to register an existing file extension "json"')`; `await plugin.onload()` resolves (no throw); assert codeblock processor registered, settings tab registered, `commands.length === 3`.
  - Notice: after collision onload, a `Notice` was constructed whose message mentions `json` + that file view is disabled / code-block rendering still active.
  - happy path: non-throwing subclass records `registerExtensions(['json'], JSON_VIEW_TYPE)` and NO Notice.
- [ ] **Step 3:** Run → FAIL (onload rethrows / commands lost).
- [ ] **Step 4 (GREEN):** In `src/main.ts`: add `Notice` to the import; reorder `onload` so `registerView`, `registerMarkdownCodeBlockProcessor`, `addSettingTab`, and the three `addCommand` calls run BEFORE the `.json` claim; wrap ONLY `this.registerExtensions(["json"], JSON_VIEW_TYPE)` in try/catch with `new Notice("JSON Editor: another plugin already handles .json — file view disabled, code-block rendering still active")` in the catch; let onload continue.
- [ ] **Step 5:** Run `tests/obsidian/main.test.ts` + full suite → green.
- [ ] **Step 6:** Commit `fix(obsidian): guard registerExtensions against .json collision (blocker 1.6)`.

**Note:** 2.10 (codeblock-processor guard) is a SEPARATE try/catch in Phase 2 — do not merge.

---

### Task 6: Blocker 1.7 — remove `max-height: 5000px` clipping

**Files:**
- Modify: `styles.css:223-237` (`.json-content` + `.collapsed`), `AGENTS.md:210` (gotcha)
- Create: `tests/styles.maxHeight.test.ts`

- [ ] **Step 1 (RED):** `tests/styles.maxHeight.test.ts` reads `styles.css` via fs; assert `!/\.json-content\s*\{[^}]*max-height:\s*5000px/.test(css)` (FAILS today) and that `.json-content.collapsed` still drives the animation (`/\.json-content\.collapsed\s*\{[^}]*(max-height:\s*0|opacity:\s*0)/`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3 (GREEN):** In `.json-content` remove `max-height: 5000px;` and drop `max-height` from the `transition` (keep `opacity` transition + `overflow: hidden`). Keep `.json-content.collapsed { max-height: 0; opacity: 0; }`. (Animation-sacrificing minimal fix per audit; expanded state now has no finite cap → no clipping.)
- [ ] **Step 4:** Run the css test + full `npx vitest run` → green (class-toggle tests untouched).
- [ ] **Step 5:** Update `AGENTS.md:210` gotcha: mark the max-height clip as fixed (remove the "v1.2 candidate" wording for it).
- [ ] **Step 6:** `npm run build` (regenerate `main.js` not needed for CSS, but confirm build clean). Commit `fix(styles): remove max-height clip on large trees (blocker 1.7)`.

**Manual verification (handover):** open a `.json` with >250 expanded rows in a real vault, confirm no clipping and the view scrolls — note in the release smoke checklist.

---

### Task 7: Blocker 1.8 — preserve collapse-state, scroll, and focus across re-render

**Files:**
- Modify: `src/obsidian/TreeView.ts` (`render()` :135-158, `setupKeyboardNav()` :390-406, new private helpers)
- Create: `tests/obsidian/TreeView.rerender-state.test.ts`

- [ ] **Step 1 (RED):** `tests/obsidian/TreeView.rerender-state.test.ts` (mirror `TreeView.keyboard.test.ts` setup). Tests:
  - **collapse preserved:** `setValue({outer:{inner:1}})`; click `outer`'s collapse toggle → is-collapsed; trigger a re-render (mutate a sibling / re-`setValue`); assert `outer` STILL is-collapsed.
  - **manual-expand preserved:** `autoCollapseDepth:0`; expand `inner` via toggle; re-render; assert still expanded.
  - **focus restore:** focus a row, mutate to force re-render; assert `document.activeElement` === that same (still-existing) row.
  - **no focus steal:** focus is OUTSIDE the tree (document.body); re-render; assert `document.activeElement` is NOT a `.json-row`.
  - **delete → focus next sibling:** `{a:1,b:2,c:3}`; focus `b`; Delete (wired through onDelete → setValue `{a:1,c:3}`); assert `document.activeElement` === row `c`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3 (GREEN):** In `render()` before `this.container.replaceChildren()` (note: 1.5 already changed :138): capture `const hadFocus = this.container.contains(document.activeElement); const prevScroll = this.container.scrollTop; const prevCollapsed = this.collectCollapseState();`. After `appendChild` + `applyValidationMarkers`: `this.reapplyCollapseState(el, prevCollapsed); this.container.scrollTop = prevScroll;`. Change `setupKeyboardNav(el, previousPathStr)` → `setupKeyboardNav(el, previousPathStr, hadFocus)`.
  - `collectCollapseState(): Map<string,boolean>` — for each `.json-container` with a resolvable data-path (via `detectContainerPath`, root keyed `"root"`), map path → `is-collapsed` boolean.
  - `reapplyCollapseState(root, map)` — for each container whose new is-collapsed differs from the stored value, call existing `toggleContainer(container, expand)` (it syncs content.collapsed/is-collapsed/toggle.is-open/aria-expanded and no-ops when already matching).
  - `setupKeyboardNav(..., hadFocus)` — when `previousPathStr` set but no row matches (delete), pick fallback row at same parent nearest old index (next sibling → prev sibling → parent → rows[0]); call `initial.focus()` ONLY when `hadFocus`.
- [ ] **Step 4:** Run the new file + full `npx vitest run` → green (existing keyboard/filter tests only assert tabindex/classes, unaffected; the `onBeforeRender` test stays green).
- [ ] **Step 5:** Commit `fix(obsidian): preserve collapse/scroll/focus across re-render (blocker 1.8)`.

---

### Closeout (before the Phase-1 gate)

- [ ] Full `npx vitest run` → **all green, 0 fail** (the 3 repro tests now pass).
- [ ] `npm run build` → clean; `npm run lint` (biome) → clean.
- [ ] Update `docs/superpowers/specs/2026-06-12-gap-audit.md` and `AGENTS.md` status if appropriate.
- [ ] Run an adversarial multi-dimension **code-review workflow** over the branch diff (correctness, Obsidian-API conformance, regression, test-completeness); fix confirmed findings.
- [ ] **GATE:** report to user; await go-ahead before version bump / tag / push / merge. (ID-rename stays in Phase 3.)

## Self-Review notes
- Spec coverage: 1.2 ✓(T2) 1.3 ✓(T4) 1.4 ✓(T3) 1.5 ✓(T1) 1.6 ✓(T5) 1.7 ✓(T6) 1.8 ✓(T7) 2.8 ✓(T2, bundled). 4.9 folded into 1.3.
- Out of scope for Phase 1 (Phase 2): 2.10 codeblock guard, 2.1 hotkeys, 2.2 source-undo, 2.3/2.16 `__proto__`, 3.1/3.2 UX, 4.1 large-file guard.
- Type consistency: `resetPerFileState()` defined T2, extended T3; `hasNumberRoundtripLoss(text)` single-arg throughout; `LossBanner.show/hide` matches `SchemaBanner`.
