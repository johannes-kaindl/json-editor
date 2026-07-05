# AGENTS.md

Orientation for AI agents (Claude Code, Codex, …) and contributors working on this repository.

## Project character

**Project:** `json-editor` (plugin id; renamed from `obsidian-json-editor` in Phase 3 per audit 1.1) — Obsidian plugin for viewing/editing `.json` files with Tree↔Source toggle, plus read-only tree rendering for ```` ```json ```` code blocks in Markdown notes.

**Author:** Johannes Kaindl (`jkaindl` on Codeberg, `johannes-kaindl` on GitHub).
Deliberately small surface: vanilla TypeScript, one runtime dependency (`@cfworker/json-schema`, eval-free), strict TDD, no telemetry or remote resources.

---

## Current state

- **Latest release:** `1.9.0` (Eval-free schema validation + a clean community-review report. Replaced Ajv with the eval-free `@cfworker/json-schema` → no `new Function`/`eval`, so the portal's "dynamic code execution" disclosure is gone and the bundle dropped ~176 KB → ~85 KB; drove the portal's type-aware `no-unsafe-*`/`no-unnecessary-type-assertion` warnings to **0** via the `tsconfig.json` mock-alias root-fix (`npm run lint:portal` = 0). `format` is now enforced (the old Ajv build ran without ajv-formats). `minAppVersion` 1.5.7). Live on both remotes; CI green.
- **2026-06-16:** `1.9.0` — eval-free `@cfworker/json-schema` swap + portal-eslint root-fix (Review → pass); adversarial review (19 verified findings) + 9 new regression tests
- **2026-06-16:** `1.8.2` — typed `activeDoc()` wrapper, fixes 1.8.1's portal `no-unsafe` regression
- **2026-06-16:** `1.8.1` — review-cleanup patch (popout/lint/attestations); addresses the community-review recommendations
- **2026-06-16:** `1.8.1` — review-cleanup patch (popout/lint/attestations); 6 commits, addresses the community-review recommendations
- **Latest feature release:** `1.8.0` (Mobile interaction model — long-press RowMenu, Alt+Arrow reorder, mobile undo/redo, 44px touch targets — plus toolbar/a11y polish, `Cmd/Ctrl+E` tree/source toggle via the view scope, and a hidden-attribute CSS fix).
- **2026-06-15:** `1.8.0` — mobile interaction model + native UI/a11y polish; merged, tagged, pushed; mobile-model review + pre-publish + submission-readiness workflows, all findings addressed
- **2026-06-13:** `1.7.0` — Phase-3 rename + docs (audit 1.1, 2.4–2.7, 2.15, 6.9); 3 commits, submission-readiness review + fixes
- **2026-06-13:** `1.6.0` — Phase-2 guideline+UX release (audit Sections 2+3+4.1); 10 commits, multi-agent review + fixes
- **2026-06-13:** `1.5.0` — Phase-1 blocker release (audit Section 1 + 2.8); 8 commits, multi-agent review + 2 rounds of fixes
- **2026-05-27:** `0.1.2` → `1.3.0` released in one autonomous run (entire 1.x feature roadmap)
- **Unreleased on `main`:** nothing pending. **`1.9.0` is live on both remotes (release: 3 assets + attestation, CI green).** Submission passed the automated scan with no errors; in human review. Mobile verified on a real iPhone. **Portal-eslint is now clean (`npm run lint:portal` = 0 problems).** The fix removed the `obsidian` → mock `paths` alias from `tsconfig.json` (so the portal's type-aware eslint resolves the *real* obsidian types instead of the loose Vitest mock that was driving the `no-unsafe-*` cascade); the Vitest mock moved to `tests/__mocks__/obsidian.ts` and a new `tsconfig.test.json` aliases it for editor typing of the tests; the `@typescript-eslint/no-unnecessary-type-assertion` rule is re-enabled (12 now-unnecessary assertions removed); and the one `querySelector as HTMLElement` was rewritten to the generic `querySelector<HTMLElement>`. **`eslint.portal.config.mjs` + `npm run lint:portal` is the committed regression guard** that mirrors the community.obsidian.md portal reviewer — run it before submission-affecting changes.
- **Roadmap (next — only the submission remains):** **GATE — Community Plugin submission** via the `community.obsidian.md` Developer Dashboard (repo `johannes-kaindl/json-editor`; the portal scan is the install gate; the legacy obsidianmd/obsidian-releases PR path is retired but still operational). ID is first-come-first-served — do it promptly. Submission-readiness workflow (2026-06-15) confirmed the repo is compliant (104 checks). Deferred follow-ups: `prefer-active-doc` popout polish (~70 lint warnings), broader A11y (§5; breadcrumb keyboard-access already fixed in 1.8.0), 2.x feature ideas (§6: schema autocompletion, multi-select, .jsonl; §3.3–3.13). Older open: cross-container drag-drop, `$schema` URL fetching, real pointer-events touch-drag.
- **Tests:** 537 Vitest tests, all green; `npm test`
- **Coverage:** 94.10% statements / 85.56% branches / 95.78% functions; `npm run test:coverage`
- **Build:** `npm run build` clean. Bundle is ~85 KB.
- **Predecessor:** `0.1.0` (v1.0 — core viewer/editor)
- **Branch:** `main` is canonical; feature branches `feat/<name>` per release, merged via `--no-ff`
- **Coverage tooling:** `@vitest/coverage-v8` set up (added in 0.3.0); `npm run test:coverage` for html report in `coverage/`
- **CI:** GitHub Actions has both `release.yml` (tag → build → release with notes extracted from CHANGELOG section) and `test.yml` (PR + push to main → npm ci → test → build)
- **Runtime deps:** `@cfworker/json-schema@4.1.1` (eval-free; zero transitive deps). Only this one runtime dep; everything else is devDeps.

## Hosting setup

Asymmetric: Codeberg is primary for source development; GitHub serves as a release distributor only (Obsidian's Community Plugin Directory is wired to GitHub-only).

| Remote | URL | Role |
|---|---|---|
| `origin` | `git@codeberg.org:jkaindl/json-editor.git` | Primary, FOSS-ethics canonical |
| `github` | `git@github.com:johannes-kaindl/json-editor.git` | Release mirror for Obsidian submission |

Auth: SSH key (`~/.ssh/id_ed25519`) registered with both accounts.

**Mirror automation:** A **Codeberg native push-mirror to GitHub is ACTIVE** (`sync_on_commit`) — a push to Codeberg (`origin`) auto-propagates to GitHub including tags, and the mirror's PAT-authenticated push triggers `release.yml` on GitHub (verified end-to-end for 1.8.0). So **`git push origin main && git push origin <tag>` is sufficient** — no separate GitHub push needed. (`.woodpecker.yml` is an unused alternative mechanism and could be removed.)

## Architecture principles

**Two-layer split:** `src/core/` is pure TypeScript with **no Obsidian imports** (unit-tested directly via Vitest); `src/obsidian/` is the adapter that imports core + the Obsidian API. This boundary keeps the core testable — preserve it.

### Repo layout

```
src/
├── core/                       pure TS, no Obsidian imports (vitest tests directly)
│   ├── schema.ts               compileSchema(text) → @cfworker/json-schema-wrapped
│   │                           CompiledSchema; validate(value) → PathError[]
│   │                           (JsonPath, not Pointer)
│   ├── draft07-meta-schema.ts  canonical draft-07 meta-schema, embedded to detect
│   │                           malformed companion schemas (cfworker, unlike ajv,
│   │                           does not throw on a structurally invalid schema)
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
└── (no test mocks under src/ — the Vitest obsidian mock lives under tests/)

tests/
├── __mocks__/obsidian.ts       Vitest mock (NOT used by production build —
│                               resolved by `vitest.config.ts` + `tsconfig.test.json`,
│                               NOT by `tsconfig.json`)
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

**Three tsconfigs:**
- `tsconfig.json` — IDE + `src/`; **no** `paths` alias (resolves the *real* obsidian types; the mock alias was removed in the portal-eslint root-fix)
- `tsconfig.test.json` — editor typing of the tests; aliases `obsidian` → `tests/__mocks__/obsidian.ts`
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

# Release (PROF-OBS-09 — ein Befehl, dual-forge):
npm run release 1.9.X                  # bump (package/manifest/versions) → CHANGELOG → commit →
                                       # tag → push Codeberg → build → Codeberg-Release.
                                       # GitHub-Release folgt automatisch via Mirror→Action.
npm run release -- 1.9.X --dry-run     # nur loggen, nichts schreiben/pushen
# Voraussetzung: ~/.codeberg-token, sauberer Arbeitsbaum, CHANGELOG-`## [Unreleased]`-Block.
# Alt-Flow (weiterhin gültig): git tag -a 1.9.X -m "…" && git push origin main --follow-tags
```

## Test vault for smoke tests

A local Obsidian vault (production-ish) for manual E2E. Install path:

```bash
# Deploy to a vault (npm run deploy — PROF-OBS-02):
OBSIDIAN_PLUGIN_DIR=<your-test-vault>/.obsidian/plugins/json-editor npm run deploy

# Equivalent manual copy:
cp main.js manifest.json styles.css \
   <your-test-vault>/.obsidian/plugins/json-editor/
# Then Cmd+R in Obsidian to reload the plugin.
```

E2E checklist: `docs/superpowers/plans/2026-05-20-manual-e2e.md`.

## Backlog (next sessions)

The 1.x roadmap is shipped. Remaining items are external/manual or future-version ideas.

> **⚠ Stand 2026-06-13:** Die 8 Blocker aus dem Gap-Audit sind in `1.5.0`/`1.6.0` gefixt (`docs/superpowers/specs/2026-06-12-gap-audit.md`). Offen vor der Submission: das Doku-Paket (Phase 3, in Arbeit auf `feat/docs-id-rename`) + ID-Rename auf `json-editor` (Audit 1.1, im Branch erledigt) + ein Release, das die neue ID trägt. Der früher übliche PR-Weg über `obsidianmd/obsidian-releases` wurde im Mai 2026 eingestellt — die Submission läuft jetzt über das **Community-Hub-Developer-Dashboard (community.obsidian.md)** mit automatischem Installierbarkeits-Scan als Gate. ID ist first-come-first-served; „JSON Viewer" ist seit 2026-06 gelistet — Zeitfenster beachten.

In priority order:

1. **Obsidian Community Plugin Submission (Community-Hub portal).** The legacy PR-against-`obsidianmd/obsidian-releases` flow was retired May 2026 ("New pull request creation is restricted"). Submit via the **Developer Dashboard** at **community.obsidian.md**:
   1. Sign in with the GitHub account that owns the release repo (`johannes-kaindl/json-editor`).
   2. Developer Dashboard → **Submit a plugin** → enter the repo. The portal reads `manifest.json` from the repo root + the latest GitHub Release.
   3. The portal runs an **automatic install-gate scan** (the old PR install-validator): valid/consistent `id`/`name`/`version`/`minAppVersion`, release tag == `manifest.json.version` with **no `v` prefix**, `main.js`+`manifest.json`(+`styles.css`) attached as release assets, `versions.json` covers the version, and the guideline checks (no `innerHTML`, no default hotkeys, sentence-case UI, `id` not starting with `obsidian-`, …). A green scan is the gate to listing.
   4. There is **no hand-edited `community-plugins.json`** anymore — the portal manages the registry from `manifest.json`:
      ```json
      {
        "id": "json-editor",
        "name": "JSON Editor",
        "minAppVersion": "1.5.7",
        "description": "View and edit JSON files with a Tree/Source toggle. Renders JSON code blocks in Markdown notes.",
        "author": "Johannes Kaindl",
        "authorUrl": "https://github.com/johannes-kaindl",
        "isDesktopOnly": false
      }
      ```
   Pre-checks done: repo public ✓, LICENSE ✓, README ✓, Release w/ asset ✓, manifest valid ✓, CHANGELOG ✓, SECURITY ✓, CONTRIBUTING ✓, templates ✓, ID-rename to `json-editor` ✓ (branch), THIRD-PARTY-NOTICES ✓. **Still required:** merge + a release that ships the renamed `id`, then a visual + mobile smoke test.

2. **Visual + mobile smoke test in real Obsidian** — deploy via `npm run deploy` and verify the 1.1–1.6 surfaces:
   - 1.1.0: hover row → drag-handle, drag to reorder, T-button → type-menu, Cmd+Z undoes both
   - 1.2.0: edit in source, switch to tree, Cmd+Z restores source state (and vice versa)
   - 1.3.0/1.5.0: enable schema validation (now opt-in!), drop a `<file>.schema.json` next to a `.json`, see red rows + banner; fix the data, banner clears
   - 1.6.0: Tree/Source toggle via the view-header icon + a self-bound hotkey; Cmd+F find in source mode; open a multi-MB file → large-file banner; bind no default hotkeys
   - Mobile (audit §4.2/4.3): drag-drop is desktop-only — confirm the touch story before relying on it.

3. **Marketing assets** (~1h with running plugin)
   - 5 screenshots for the Community Directory listing per spec §7

4. **Potential 2.x ideas** (no spec yet):
   - Cross-container drag-drop (move a key from object A to object B; raises validation + type questions)
   - `$schema` URL fetching with vault-path resolution for offline schemas
   - Per-workspace schema pinning via settings (alongside the companion convention)
   - Persistent undo across file reopens
   - Group-by-time-window batching for source-mode history (currently per-keystroke)

5. **Mirror is already active** (Codeberg native push-mirror, see *Hosting setup*) — the `.woodpecker.yml` alternative is redundant and could be removed.

## Gotchas (known limitations, documented in code)

- **`parse.ts`:** `lastIndexOf` heuristic for V8 error position can misidentify when the unexpected-token char also appears earlier in valid content (e.g. inside a string). Acceptable for v1.0/v1.1; rewrite-parser deferred.
- **`Tooltip.ts`:** `ttHeight = 60` hardcoded for above/below position-flip; long previews can overflow. v1.2 candidate to measure dynamically.
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

### 2026-06-16 — `1.9.0`: Eval-free validator swap + portal-eslint root-fix, released

User goal: the `community.obsidian.md` review showed "Review: Caution" (with passing "Health: Excellent") and a scary "Dynamic Code Execution / eval()" disclosure — drive it to 100% clean. Research (workflow, 3 agents) established the mechanism: the portal runs `eslint-plugin-obsidianmd` recommended (type-checked) with `project: "./tsconfig.json"`; our tsconfig had an `obsidian` → Vitest-mock `paths` alias, so Obsidian types resolved to a loose mock → a `no-unsafe-*` cascade. Crucially, **only the SOURCE CODE eslint warnings drive "Caution"**; the BEHAVIOR items (clipboard, eval) are informational disclosures that do NOT affect the score.

Two workstreams, both verified against a local portal-sim harness (`eslint.portal.config.mjs`, committed as `npm run lint:portal`):
1. **ESLint root-fix → Review pass.** Removed the mock alias from `tsconfig.json` (real Obsidian types resolve; portal-sim 49 → 12), moved the mock `src/__mocks__/` → `tests/__mocks__/` (so no `src/` file is excluded from `tsconfig.json` — closes a "file not in project" parser-error risk a reviewer flagged), added `tsconfig.test.json` for editor typing of tests, re-enabled `no-unnecessary-type-assertion` + removed 12 now-redundant assertions (one `querySelector` was a rule false-positive → rewrote to the generic `querySelector<HTMLElement>`). `lint:portal` = 0.
2. **`ajv` → `@cfworker/json-schema` (eval-free).** Kills the "dynamic code execution" disclosure at the source (`new Function`/`eval` in bundle = 0) and halves the bundle (~176 KB → ~85 KB). New `src/core/draft07-meta-schema.ts` restores ajv's "malformed schema → error" contract (cfworker is lenient). `reduceErrors()` collapses cfworker's cascading errors back to ajv granularity.

Adversarial review (workflow, 23 agents): **19 confirmed findings, 0 refuted.** Fixed: a `not`-failure being dropped, `additionalProperties:false` duplicate noise, allOf/$ref noise (rewrote the error filter, verified against 11 cases + 5 new regression tests); meta-validation over-rejecting a cosmetic non-URI `$id` (relaxed identifier formats); the mock-in-`src/` parser-error risk; and all stale docs (THIRD-PARTY-NOTICES, SECURITY, README, AGENTS). **Intentional behavior change:** cfworker enforces `format` (Ajv ran without ajv-formats) — kept + documented + tested. Tests 592 → 601; `npm test`/`typecheck`/`build`/`lint:obsidian`/`lint:portal`/`biome` all green. Released: feature branch → `--no-ff` merge → tag `1.9.0` → pushed to Codeberg (auto-mirrors to GitHub + triggers `release.yml`).

### 2026-06-15 — `1.8.0`: Mobile interaction model + native UI/a11y polish, released

User-driven: build the full mobile interaction model before submitting (audit §4.2–4.5/6.10). Brainstorm → spec (`docs/superpowers/specs/2026-06-13-mobile-interaction-model-design.md`) → plan → strict TDD, inline. Shipped on `feat/mobile-interaction-model` (merged `--no-ff`): consolidated **long-press → Obsidian `Menu`** (`RowMenu.ts`) replacing hover-affordances + DnD on `Platform.isMobile`; `Alt+Arrow` keyboard reorder; mobile undo/redo toolbar buttons (`clickable-icon`); 44px touch targets; `touchMode` injected into `TreeView` (keeps it `Platform`-free + testable); shared `clipboard.ts`; `jsonTypeOf` extracted to `core/edit`. Decisions D1–D4 ratified with the user.

Then several user-prompted iteration rounds (deploy → real-iPhone test → fix loop): toolbar native polish (audit 6.1 — dropped the redundant view-header action, softened the breadcrumb terminal); `Cmd/Ctrl+E` tree/source toggle added to the **view scope** (docks onto the core binding without a global override — the user's insight); breadcrumb `<span>`→`<button>` keyboard a11y; button font/aria parity; **systemic `[hidden]`-override bug** found (class `display` beat the `hidden` attribute → large-file "Load tree anyway" button + search-× showed when they shouldn't) and fixed for all affected elements with a regression test; native button padding.

Adversarial workflows: mobile-model multi-dim review, pre-publish review, and a **submission-readiness** workflow (researched live docs.obsidian.md + obsidian-releases) — 104 compliance checks pass, no code blockers. iOS load failure during testing was diagnosed (systematic-debugging) to an **orphaned old 1.3 install colliding on the `.json` claim**, not our build.

Release: merged to `main`, tagged `1.8.0`, pushed to Codeberg → **auto-mirrored to GitHub** (the push-mirror is active; the manual `push_mirrors-sync` API returned 500 but `sync_on_commit` propagated anyway) → `release.yml` built the GitHub release with all 3 assets; Test + Release CI green (verified via API). Tests 537→590. **Only the community.obsidian.md portal submission remains** (user step).

### 2026-06-13 — Phase 3: Rename + Docs (`1.7.0`) + alle drei Releases gepusht

Abschluss des Gap-Audit-Sprints (alle drei Phasen in einer Session). Phase-3-Branch `feat/docs-id-rename` (3 Commits): Plugin-ID-Rename `obsidian-json-editor`→`json-editor` (manifest/package/deploy+install-Pfade/esbuild+styles-Banner; `JSON_VIEW_TYPE` bewusst belassen — interner View-Key), volles Doku-Paket (README an 1.6.0 + Known-conflicts + Key-Order-Limitation, `THIRD-PARTY-NOTICES.md` aus verifiziertem Bundle inkl. fast-uri BSD-3, SECURITY-Threat-Model, AGENTS-Submission-Pfad→Portal, CHANGELOG-Link-Block, esbuild legalComments). Recon- + Submission-Readiness-Review-Workflows; 5 Findings gefixt (uncommitted README-Note, stale Banner/Name in shipped Assets).

Releases: **1.5.0 + 1.6.0 + 1.7.0** alle nach `main` gemergt (--no-ff), getaggt, zu beiden Remotes gepusht; GitHub-Actions-Releases live mit Assets. 1.7.0-Release-Asset trägt verifiziert die neue id `json-editor`. Nach Pallas-Test-Vault deployt (`.obsidian/plugins/json-editor/`). **Submission (community.obsidian.md Portal) bewusst auf nächste Session verschoben** (User-Wunsch). Methodik-Beobachtung: Codeberg→GitHub-**Mirror ist aktiv** (AGENTS-Hosting-Sektion sagt fälschlich „not yet activated") — beim Push erscheint GitHub „Everything up-to-date" bzw. tag „reference already exists", weil der Codeberg-Push schon gespiegelt hat. `gh` ist installiert (AGENTS sagte veraltet „not installed").

### 2026-06-13 — Phase 2: Guideline+UX-Release (`1.6.0`)

Umsetzung der Audit-Sektionen 2+3+4.1, strikt TDD, inline. Plan: `docs/superpowers/plans/2026-06-13-phase2-guideline-ux.md`. 14 Items in 10 Commits: **2.3/2.16** `__proto__`-sichere `Object.fromEntries`-Rebuilds + `hasOwnProperty`-Guards; **2.19/2.20** Clipboard-Guard+Notice, `normalizePath`+Suffix-Validator; **2.11/2.12/2.21/2.22** Popout (`ownerDocument`), Lifecycle-Cleanup, kein inline-`position`, `window`-Timer; **2.1/2.23** Default-Hotkeys raus → view-lokaler `Scope` (In-Input-Undo-Guard, return `undefined`), Command-Namen; **3.1** public `toggleMode()` + `toggle-tree-source`-Command + `addAction` in `onOpen`; **2.2** Source-Undo via `diffReplaceSpan` + `SourceView.applyExternalEdit` (kein Editor-Rebuild; `recomputeFromData` aus `setViewData` extrahiert); **3.2** `@codemirror/search` + mode-aware `focusSearch`; **4.1** `src/core/render-budget.ts` + `LargeFileBanner` (Budget auch in `switchTo` neu geprüft); **2.14** `eslint-plugin-obsidianmd` flat-config (typecheckt gegen `tsconfig.build.json`, sonst no-unsafe-* aus dem Mock) + `lint:obsidian`-CI-Step.

Mock erweitert: `Scope`, `TFile`, `normalizePath`, `TextFileView.addAction`/`actionsEl`/`onOpen`, `Notice.instances`-Registry. **`minAppVersion` 1.4.0→1.5.7** — vom eslint-`no-unsupported-api` aufgedeckt (`View.scope` braucht 1.5.7). Adversarialer 4-Dimensions-Review fand 2 echte Findings (Large-File-Guard-Bypass bei in-session-growth → `switchTo`-Recheck; Dropdown-Casing-Regression → „Two spaces"). Tests 478→537, build + biome + lint:obsidian clean. Deferred: 69 `prefer-active-doc`-Warnings (Popout-Polish, Folge-Item).

### 2026-06-13 — Phase 1: Blocker-/Stabilitäts-Release (`1.5.0`)

Umsetzung der Audit-Sektion 1 (+ gebündeltes 2.8), strikt TDD (failing-test-first), inline ausgeführt (Blocker teilen sich `JsonFileView.ts`/`TreeView.ts`). Plan: `docs/superpowers/plans/2026-06-13-phase1-blocker-release.md`.

Acht Blocker gefixt: **1.2/2.8** `resetPerFileState()` (History/Schema/Query/Mode pro Datei zurücksetzen — die 3 untracked Repro-Tests sind jetzt grün und committet); **1.5** `innerHTML`→`replaceChildren()` (6 Stellen, + fs-Regression-Lint über `src/`); **1.4** Lossy-Number-Detektor (`src/core/roundtrip.ts`) + `LossBanner` + read-only Tree; **1.3** Schema-Autoload Opt-in (`validateAgainstSchema` default→`false`) + ReDoS-Pattern/Größen-Guards in `compileSchema`; **1.6** `registerExtensions`-try/catch + Registrierungs-Reihenfolge; **1.7** `max-height:5000px`-Clipping entfernt; **1.8** Collapse/Scroll/Fokus über Re-Render erhalten.

Methodik: zwei Multi-Agent-Workflows (Recon + adversarialer 4-Dimensions-Review). Der Review fand 13 verifizierte Findings — alle adressiert: u.a. ReDoS-Guard erwischte Brace-Quantoren `(a{1,}){1,}` nicht (gefixt), Lossy-Detektor flaggte wertgleiche `1.0`/`1e3` und sperrte fälschlich den Tree (jetzt nur echter >2^53-Verlust), Companion-Schema-Race (Generations-Guard), Unsafe-Integer-Eingabe (abgelehnt). Tests 402→478, build + Biome clean. **Offen für Phase 3 (Doku):** numerisches Key-Reordering (Audit 1.4) als README-Limitation dokumentieren (Detektion bewusst nicht umgesetzt).

### 2026-06-10/12 — Multi-Agent-Gap-Audit vor der Community-Submission

User-Anstoß: fehlender Cmd+E-Tree↔Source-Toggle + Wunsch nach einem Best-Practices-/Community-Check. Zweistufiger Workflow-Audit (13 Dimensionen: 5 Code-Auditoren, 4 Web-Rechercheure, 4 Critic-Nachzügler inkl. Screenreader/A11y), 120 Roh-Findings, adversarial verifiziert (2 widerlegt), dedupliziert auf 73 Einträge → **`docs/superpowers/specs/2026-06-12-gap-audit.md`** (maßgebliches Arbeitsdokument für die nächsten Sessions, inkl. 9-Schritte-Reihenfolge bis zur Submission).

Kernergebnis: Submission ist **nicht** ready — 8 Blocker: Cross-File-Undo-Datenverlust (History wird in `clear()`/`setViewData()` nie resettet; Repro: `tests/obsidian/JsonFileView.fileswitch.repro.test.ts`, **bewusst untracked + rot** — gehört TDD-konform als failing-test-first in den Fix-Branch; `npm test` ist deshalb lokal rot), ReDoS via Companion-Schema-Autoload (synchron auf Main-Thread, default-on), 6× `innerHTML` (Review-Gate), ungeschützter `registerExtensions`-Claim (Kollision mit neuem „JSON Viewer"-Plugin jetzt real), `max-height: 5000px`-Clipping ab ~200 Rows, Voll-Re-Render verliert Expand/Scroll/Fokus, verlustbehafteter Zahlen-Roundtrip (>2^53), Plugin-ID-Rename auf `json-editor` (als letzter Schritt vor dem Release). Prozess-Fund: Submission-PR-Weg über `obsidianmd/obsidian-releases` seit Mai 2026 eingestellt → Community-Hub-Portal.

Empfohlene Dekomposition für die Umsetzung: (1) Blocker-/Stabilitäts-Release, (2) Guideline+UX-Release (Default-Hotkeys entfernen, Toggle-Command, Source-Mode-Suche), (3) Doku-Paket (README-Abgleich, Lizenz-Attribution, SECURITY.md), (4) ID-Rename + Release + Submission. A11y/Mobile als Folge-Releases. Methodik-Hinweis: Der Workflow scheiterte zweimal am Monats-Spend-Limit; alle Ergebnisse wurden aus `journal.jsonl` + Agent-Transcripts geborgen — Findings gingen nicht verloren.

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

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `/Users/Shared/code/obsidian-plugins/`.
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).
