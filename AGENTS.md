# AGENTS.md

Orientation for AI agents (Claude Code, Codex, …) and contributors working on this repository.

## Project character

**Project:** `obsidian-json-editor` — Obsidian plugin for viewing/editing `.json` files with Tree↔Source toggle, plus read-only tree rendering for ```` ```json ```` code blocks in Markdown notes.

**Author:** Johannes Kaindl (`jkaindl` on Codeberg, `johannes-kaindl` on GitHub).
Deliberately small surface: vanilla TypeScript, one runtime dependency (`ajv`), strict TDD, no telemetry or remote resources.

---

## Current state

- **Latest release:** `1.3.0` (JSON Schema Validation — closes the 1.x roadmap)
- **Released today (2026-05-27):** `0.1.2`, `0.2.0`, `0.3.0`, `1.0.0`, `1.1.0`, `1.2.0`, `1.3.0` (full autonomous run from Direction-B-redesign merge through the entire 1.x roadmap)
- **Unreleased on `main`:** nothing pending
- **Roadmap (next):** Community Plugin Directory submission. No further functional 1.x work planned. Open questions if/when picked up: drag-drop **between** containers (currently same-parent-only), `$schema` URL fetching (currently companion-file-only).
- **Tests:** 402 Vitest tests, all green; `npm test`
- **Coverage:** 94.10% statements / 85.56% branches / 95.78% functions; `npm run test:coverage`
- **Build:** `npm run build` clean. Bundle is ~163 KB (Ajv is the bulk; was ~37 KB pre-1.3.0).
- **Predecessor:** `0.1.0` (v1.0 — core viewer/editor)
- **Branch:** `main` is canonical; feature branches `feat/<name>` per release, merged via `--no-ff`
- **Coverage tooling:** `@vitest/coverage-v8` set up (added in 0.3.0); `npm run test:coverage` for html report in `coverage/`
- **CI:** GitHub Actions has both `release.yml` (tag → build → release with notes extracted from CHANGELOG section) and `test.yml` (PR + push to main → npm ci → test → build)
- **Runtime deps:** `ajv@8` (1.3.0+). Only this one runtime dep; everything else is devDeps.

## Hosting setup

Asymmetric: Codeberg is primary for source development; GitHub serves as a release distributor only (Obsidian's Community Plugin Directory is wired to GitHub-only).

| Remote | URL | Role |
|---|---|---|
| `origin` | `git@codeberg.org:jkaindl/json-editor.git` | Primary, FOSS-ethics canonical |
| `github` | `git@github.com:johannes-kaindl/json-editor.git` | Release mirror for Obsidian submission |

Auth: SSH key (`~/.ssh/id_ed25519`) registered with both accounts.

**Mirror automation:** `.woodpecker.yml` is in the repo for Codeberg→GitHub auto-sync on tags, but Woodpecker CI is **not yet activated** — currently a manual two-step `git push` to each remote is needed. Activation TODO: enable Woodpecker on Codeberg + add two secrets (`github_token` PAT with `repo` scope, `github_repo` = `johannes-kaindl/json-editor`).

## Architecture principles

**Two-layer split:** `src/core/` is pure TypeScript with **no Obsidian imports** (unit-tested directly via Vitest); `src/obsidian/` is the adapter that imports core + the Obsidian API. This boundary keeps the core testable — preserve it.

### Repo layout

```
src/
├── core/                       pure TS, no Obsidian imports (vitest tests directly)
│   ├── schema.ts               compileSchema(text) → ajv-wrapped CompiledSchema;
│   │                           validate(value) → PathError[] (JsonPath, not Pointer)
│   ├── types.ts                JsonValue, JsonPath, ParseResult, RenderOptions,
│   │                           SerializeOptions, SearchOptions, SearchResult
│   ├── parse.ts                parse(text) → ParseResult (line/col errors)
│   ├── serialize.ts            serialize(value, opts) → string
│   ├── edit.ts                 editValue + addObjectKey + addArrayItem +
│   │                           deleteAt + renameKey + moveArrayItem +
│   │                           moveObjectKey + changeType + JsonType +
│   │                           computeInsertionIndex — all pure + immutable
│   ├── history.ts              generic History<T> class (undo/redo stacks,
│   │                           cap 100, redo-clear-on-push); JsonFileView
│   │                           instantiates as History<string> (1.2.0+)
│   ├── render.ts               renderTree(value, opts) → HTMLElement (DOM only);
│   │                           internal renderContainer(kind=object|array)
│   │                           + WAI-ARIA roles (tree / treeitem / group)
│   ├── search.ts               findMatches(value, query, opts?) → match + onPath sets
│   └── path.ts                 pathToString utility for serializing JsonPath
├── obsidian/                   adapter layer, imports core/ + obsidian API
│   ├── JsonFileView.ts         extends TextFileView; owns mode toggle, toolbar
│   │                           (breadcrumb + searchbar + toggle), unified
│   │                           History<string> (1.2.0), applyMutation,
│   │                           undo/redo public API, parse-error banner,
│   │                           schema-error banner (1.3.0), setSchema,
│   │                           tryLoadCompanionSchema, empty-state
│   ├── TreeView.ts             wraps core/render + inline edit/rename + copy
│   │                           buttons + scrollToPath + applyFilter +
│   │                           roving-tabindex keyboard nav (↓↑→←Home/End/
│   │                           Enter/F2/Backspace) + RowActions +
│   │                           AddAffordance + drag-handle + drop-handling +
│   │                           TypeMenu wiring + setValidationErrors
│   ├── SearchBar.ts            input + clear + match-count component
│   ├── RowActions.ts           hover-revealed rename + delete + type-switch
│   │                           buttons per row (1.1.0)
│   ├── AddAffordance.ts        + Add key / + Add item per container
│   ├── TypeMenu.ts             1.1.0 — popover menu of 6 JSON types,
│   │                           singleton (only one active at a time)
│   ├── SchemaBanner.ts         1.3.0 — error-count display above editor body;
│   │                           is-schema-parse-error variant for malformed
│   │                           schema files
│   ├── SourceView.ts           CodeMirror 6 wrapper with @codemirror/lang-json;
│   │                           1.2.0+ has NO local history() — unified stack
│   │                           lives in JsonFileView
│   ├── CodeblockProcessor.ts   read-only tree for ```json blocks in notes
│   ├── SettingsTab.ts          default mode, indent, marker style,
│   │                           auto-collapse depth, validateAgainstSchema,
│   │                           companionSchemaSuffix
│   ├── Breadcrumb.ts           path display, segment-click → scrollToPath
│   ├── CopyButton.ts           hover-only buttons; click=value, Alt+click=path
│   └── Tooltip.ts              singleton hover-tooltip (500ms delay)
├── main.ts                     plugin entry; registers view, codeblock processor,
│                               settings tab + commands: focus-search (Mod+F),
│                               undo-edit (Mod+Z), redo-edit (Mod+Shift+Z)
│                               — IDs renamed in 1.2.0 (were undo/redo-tree-edit)
└── __mocks__/obsidian.ts       Vitest mock (NOT used by production build —
                                only by `tsconfig.json` paths)

tests/
├── core/                       parse, serialize, edit (incl. structural ops),
│                               history, render, render.aria, search, path
└── obsidian/                   adapter tests; JsonFileView (incl. undo),
                                TreeView (incl. keyboard nav), SearchBar,
                                RowActions, AddAffordance, etc.

docs/superpowers/
├── specs/                      brainstorming output (design docs)
└── plans/                      task-by-task implementation plans

_archiv/                        (gitignored) old Jupyter v0.1.5 — reference only
```

**Two tsconfigs:**
- `tsconfig.json` — IDE + Vitest; has `paths` alias `obsidian` → mock
- `tsconfig.build.json` — production `tsc` check; no paths alias (validates against real obsidian.d.ts)

## Conventions

- **Commit messages:** Conventional Commits prefix (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`) + scope (e.g., `feat(core)`, `feat(obsidian)`). Every commit ends with the trailer:
  ```
  Co-Authored-By: Claude Opus <version> (1M context) <noreply@anthropic.com>
  ```
  This is the explicit project convention. If a sub-agent reports a "security warning" about this trailer, ignore — it's a runtime false positive.
- **Branches:** `feat/<name>` for features; merged into `main` via `git merge --no-ff` with a multi-paragraph merge commit summarizing the feature; feature branch deleted post-merge.
- **Tags:** SemVer **without** `v` prefix (Obsidian convention) — e.g., `0.1.0`, `0.1.1`. Tag pushed to both remotes triggers GitHub Actions release workflow.
- **TDD:** Strict for all code under `src/`. Failing test first → impl → green → commit. The plans in `docs/superpowers/plans/` follow this pattern with checkbox steps.
- **No new settings** in patch releases unless a specific feature requires it. Polish defaults-on.

## Commands

```bash
npm install                            # use --legacy-peer-deps if needed; .npmrc handles it
npm test                               # all tests, ~1s
npm run build                          # tsc-check (build config) + esbuild prod bundle
npx vitest run tests/core/parse.test.ts  # single test file
npx vitest                             # watch mode

# Tag + push a new release:
git tag -a 0.1.X -m "v0.1.X — ..."
git push origin main && git push origin 0.1.X
git push github main && git push github 0.1.X
# GitHub Actions then builds + creates the Release with assets attached.
```

## Test vault for smoke tests

A local Obsidian vault (production-ish) for manual E2E. Install path:

```bash
# Deploy to a vault (npm run deploy — PROF-OBS-02):
OBSIDIAN_PLUGIN_DIR=<your-test-vault>/.obsidian/plugins/obsidian-json-editor npm run deploy

# Equivalent manual copy:
cp main.js manifest.json styles.css \
   <your-test-vault>/.obsidian/plugins/obsidian-json-editor/
# Then Cmd+R in Obsidian to reload the plugin.
```

E2E checklist: `docs/superpowers/plans/2026-05-20-manual-e2e.md`.

## Backlog (next sessions)

The 1.x roadmap is shipped. Remaining items are external/manual or future-version ideas.

In priority order:

1. **Obsidian Community Plugin Submission** — open a PR on `obsidianmd/obsidian-releases` with this entry in `community-plugins.json`:
   ```json
   {
     "id": "obsidian-json-editor",
     "name": "JSON Editor",
     "author": "Johannes Kaindl",
     "description": "View and edit JSON files in Obsidian with a Tree/Source toggle. Renders JSON code blocks in Markdown notes.",
     "repo": "johannes-kaindl/json-editor"
   }
   ```
   Pre-checks already done: GitHub repo public ✓, LICENSE ✓, README ✓, Release with asset ✓, manifest valid ✓, CHANGELOG ✓, SECURITY ✓, CONTRIBUTING ✓, issue + PR templates for both forges ✓.

2. **Visual smoke test in real Obsidian** — verify the 1.1–1.3 surfaces work:
   - 1.1.0: hover row → drag-handle reveal, drag to reorder, T-button → type-menu, Cmd+Z undoes both
   - 1.2.0: edit in source, switch to tree, Cmd+Z restores source state (and vice versa)
   - 1.3.0: drop a `<file>.schema.json` next to a `.json`, see red rows + banner; fix the data, banner clears
   - Test vault `10_Pallas` has 1.3.0 deployed; Cmd+R to reload.

3. **Marketing assets** (~1h with running plugin)
   - 5 screenshots for the Community Directory listing per spec §7

4. **Potential 2.x ideas** (no spec yet):
   - Cross-container drag-drop (move a key from object A to object B; raises validation + type questions)
   - `$schema` URL fetching with vault-path resolution for offline schemas
   - Per-workspace schema pinning via settings (alongside the companion convention)
   - Persistent undo across file reopens
   - Group-by-time-window batching for source-mode history (currently per-keystroke)

5. **Activate Woodpecker CI** for Codeberg→GitHub mirror automation (currently manual two-step push works fine)

## Gotchas (known limitations, documented in code)

- **`parse.ts`:** `lastIndexOf` heuristic for V8 error position can misidentify when the unexpected-token char also appears earlier in valid content (e.g. inside a string). Acceptable for v1.0/v1.1; rewrite-parser deferred.
- **`Tooltip.ts`:** `ttHeight = 60` hardcoded for above/below position-flip; long previews can overflow. v1.2 candidate to measure dynamically.
- **`styles.css`:** `.json-content { max-height: 5000px }` clips trees taller than ~5000px during expand. v1.2 candidate to apply `max-height: unset` after `transitionend`.
- **`render.ts`:** `renderObject` / `renderArray` share ~65 LOC of identical scaffolding. Refactor scheduled for v1.3.
- **`onPathClick`:** fires N times for nested clicks (once per ancestor row via capture-phase listener); callers must be idempotent. Current callers (`Breadcrumb.setPath`) are.

## Memory

- Project memory: `~/.claude/projects/-Users-Shared-code-json-viewer/memory/` (index `MEMORY.md`).
- Session handoff buffer: `.remember/` (gitignored). Detailed working history is appended below.

## Abweichungen von der Leitkonvention

- `CORE-META-03` — Hero/Feature-Screenshots (`docs/images/`): **Phase-2b** (requires capturing in a running Obsidian GUI).
- `CORE-META-09` — bilingual `README.de.md`: **Phase-2b** (translation pass pending).

## Session history

Append new entries at the top. Each entry = one working session.

### 2026-05-27 — Autonomous run from 1.0.0 to 1.3.0 (three more releases, closes 1.x roadmap)

User opened the session with "gerne autonom alles umsetzen bis 1.3.0" — explicit full-autonomy mandate, no review gates. Tasks tracked via TaskCreate; each release was a self-contained branch → merge → tag flow.

Sequence:
1. **1.1.0 — Drag-Drop Reorder + Type-Switching** — brainstorm → spec → plan → TDD. Three new pure-core ops (`moveArrayItem`, `moveObjectKey`, `changeType`) plus `computeInsertionIndex` helper. UI: `.json-drag-handle` per row, HTML5 dragstart/dragover/drop wiring with same-parent guard, new `TypeMenu` popover component, RowActions gains `T` button. Same-parent-only drag scope; cross-container deferred. Tests 262 → 369.
2. **1.2.0 — Cross-mode unified Undo/Redo** — refactor `History` → `History<T>` (generic), JsonFileView holds `History<string>`. Both `applyMutation` and `handleSourceChange` push pre-state text; mode-switch no longer clears. SourceView drops CodeMirror's local `history()`. Plugin command IDs renamed `undo-tree-edit` → `undo-edit` (similar redo) since they're no longer mode-gated. Trade-off: source-mode undo is per-onChange (~per keystroke) instead of CM heuristic-grouped. Tests 369 → 373.
3. **1.3.0 — JSON Schema Validation** — `ajv@8` added as runtime dep. New pure `src/core/schema.ts` (compileSchema + PathError; JSON-Pointer → JsonPath conversion handles `~0`/`~1`). New `SchemaBanner` component, `TreeView.setValidationErrors` for inline `.json-row-error` markers. JsonFileView.setSchema() + async tryLoadCompanionSchema() (best-effort, silent on vault unavailability). Two new settings: master switch + suffix. Tests 373 → 402. Bundle 37 KB → 163 KB (Ajv is the bulk; acceptable cost).

Hosting flow per release: feature branch with multiple semantically-grouped commits → `merge --no-ff` into main with a multi-paragraph merge commit → tag (no `v` prefix) → push to both `origin` (Codeberg) and `github`. GitHub Actions release workflow triggers off the tag on the GitHub side. Test vault `10_Pallas` updated after each release (Cmd+R reload for visual smoke pending — out of CC's autonomy).

Final state: coverage 94.1% statements / 85.6% branches / 95.8% functions. No `Unreleased` content on main. The 1.x roadmap that was decomposed during the 1.0.0 session is now fully shipped. Backlog rewritten: only Community Submission, visual smoke test, marketing screenshots remain — all manual / external.

### 2026-05-27 — Autonomous run from 0.1.2 to 1.0.0 (four releases in one session)

User granted full autonomy mid-session ("ab jetzt keine Rückfragen mehr bitte sondern komplett autonom umsetzen"). Saved as feedback memory.

Sequence:
1. **0.1.2 released** — Direction-B redesign + public-docs surface (the work that was sitting on main). GitHub PAT used in-memory for repo metadata.
2. **0.2.0 — Search & Filter** — brainstorm → spec → plan → TDD impl → merge → tag. Hybrid: pure `findMatches()` in core, DOM-class application in TreeView. Strict-filter (hide non-matches), `Cmd/Ctrl+F` hotkey, ESC clear/blur, match count. 133 → 181 tests.
3. **0.3.0 — Code Quality & Infra** — coverage tooling (`@vitest/coverage-v8`), WAI-ARIA tree roles + keyboard nav (roving tabindex, ↓↑→←Home/End/Enter/F2), and `renderObject`/`renderArray` refactor into shared `renderContainer`. 181 → 205 tests. Coverage baseline 92.9%.
4. **1.0.0 — Structural Editing & Undo/Redo** — pure mutation API (`addObjectKey`, `addArrayItem`, `deleteAt`, `renameKey`), `History` class, RowActions (hover ✎+✕), AddAffordance (+ Add at end of container), Backspace/Delete keyboard, `Cmd/Ctrl+Z`/`Shift+Z` commands. Empty containers now render with full scaffolding so they're addable. Mode-switch clears tree history. 205 → 262 tests. Coverage 93.86%.

Scope-decomposition decision in 1.0.0: original roadmap entry listed 5 features (add/del/rename + drag-drop + type-switch + cross-mode-undo + JSON Schema). Trimmed to "structural-edit core + tree-mode undo/redo"; deferred drag-drop and type-switch to 1.1.0, cross-mode-undo to 1.2.0, JSON Schema to 1.3.0. Documented in CHANGELOG. User can override.

All four releases pushed to both remotes, GitHub Actions release workflows triggered automatically, test vault 10_Pallas updated to 1.0.0 after each release. ~70 commits, ~2.5h compressed work.

### 2026-05-27 — Public-docs overhaul + Codeberg metadata

- User asked to align repo metadata + docs with current best practices, using `video-to-3d-gaussian-splat` as the style reference. Codeberg PAT provided inline for API + push autonomy.
- Mirrored the reference's documentation surface (badges, status callout, sectioned README, CHANGELOG/CONTRIBUTING/SECURITY, issue + PR templates for both forges).
- Codeberg API: `PATCH /repos/jkaindl/json-editor` set description + `has_issues=true` + `has_wiki=false`; `PUT /topics` set 12 topics (obsidian, obsidian-plugin, obsidian-md, json, json-editor, json-viewer, tree-view, codemirror, typescript, markdown, plugin, editor).
- 4 commits, all pushed to both remotes (`ba8dd2e` docs, `1f15479` templates, `ae97ee3` npm metadata, `f90fe29` release.yml). Tests still 133/133, build clean.
- **Open:** GitHub repo metadata (description + topics) — `gh` not installed, no GitHub PAT provided. README and summary list the exact fields to set manually or with a future PAT.

### 2026-05-22 — Visual redesign (Direction B)

- Full flow: brainstorm (visual companion) → spec → plan → TDD implementation → merge. Specs/plans in `docs/superpowers/`.
- Chose Direction B (structured/IDE: nested tinted blocks, collapse chips) over native-refined and editorial; theme-aware (Obsidian CSS vars, no hardcoding, no new settings, no remote resources).
- User dropped a `design/` folder (a "Kuro Signal Protocol" alt-redesign). Harvested its theme-aware token layer + SVG icons + chrome CSS into the spec; rejected the Kuro lore layer (AI persona, 7 lore settings) as off-scope for a public plugin. `design/` is now gitignored.
- Implemented: `render.ts` (data-depth, SVG chevron, collapse chip), `CodeblockProcessor.ts` (titled card, >20-line auto-collapse, error card), `JsonFileView.ts` (unified toolbar, empty-state polish), full `styles.css` rewrite (`--jv-` tokens). 9 feat commits, merged `--no-ff` (`a743ff0`). 122 → 133 tests.
- Installed in test vault `10_Pallas`. Open: visual sign-off in real Obsidian, marketing screenshots (spec §7), release (bump → tag → push, needs user go-ahead).

### 2026-05-20 / 2026-05-21 — Initial build through v1.1

- Created from scratch: brainstorm → spec → 15-task plan → subagent-driven execution → final review → tag `0.1.0` → install in test-vault → user confirmed it works
- Second iteration: brainstorm → spec → 9-task plan → subagent-driven execution → final review (caught Critical+Important issues, all fixed) → tag `0.1.1` → install in test-vault
- Codeberg + GitHub repos created and pushed; SSH-key-based auth; GitHub Actions release workflow runs green on tag push
- Time: long single session spanning two calendar days
