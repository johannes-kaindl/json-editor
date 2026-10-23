# AGENTS.md

Orientation for AI agents (Claude Code, Codex, …) and contributors working on this repository.

> **Workspace standards (maintainer-local):** The binding Leitkonvention lives in `_docs/CONVENTIONS.md`
> in the maintainer's multi-project workspace, `../../workspace/_docs` relative to this repo — not part of this
> repository, ignore if absent in your clone. Model: comply-or-explain.

## Project character

**Project:** `json-editor` (plugin id; renamed from `obsidian-json-editor` in Phase 3) — Obsidian plugin for viewing/editing `.json` and `.jsonc` files with a Tree↔Source toggle, plus read-only tree rendering for ```` ```json ```` code blocks and `![[file.json]]` embeds in Markdown notes, and LLM repair of broken code blocks.

**Author:** Johannes Kaindl (`jkaindl` on Forgejo, `johannes-kaindl` on GitHub). Deliberately small surface: vanilla TypeScript, two runtime dependencies (`@cfworker/json-schema` + `jsonc-parser`, both eval-free), strict TDD, no telemetry or remote resources. The current version is in `manifest.json` and `CHANGELOG.md`; the why is in `docs/internal/decisions.md`.

## Architecture principles

**Two-layer split:** `src/core/` is pure TypeScript with **no Obsidian imports** (unit-tested directly via Vitest); `src/obsidian/` is the adapter that imports core and the Obsidian API. This boundary keeps the core testable — preserve it. `src/vendor/**` are verbatim kit snapshots, never hand-edited. The file-by-file layout is in `docs/internal/architecture.md`.

## Commands

```bash
npm install                            # use --legacy-peer-deps if needed; .npmrc handles it
npm test                               # all tests, ~1s (plus the abs-path and NUL-byte checks)
npm run gate                           # typecheck (src, test, scripts) + test + lint + lint:biome + build
npm run build                          # tsc-check (build config) + esbuild prod bundle
npx vitest run tests/core/parse.test.ts  # single test file
npm run smoke:gui -- --port <p>        # GUI smoke against a second instance; recipe in the driver head and docs/SMOKE.md
npm run shots                          # README pictures; contract in docs/images/README.md
OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/json-editor npm run deploy   # copy the build into a vault (PROF-OBS-02)
bash tools/sync-kit.sh                 # re-vendor src/vendor/** (pins in tools/kit-sync.json)
npm run release 1.x.y                  # PROF-OBS-09, only the master session; --dry-run to log only
```

## Conventions

- **Commits:** Conventional Commits with scope (`feat(core)`, `fix(obsidian)`); every commit ends with the `Co-Authored-By` trailer (CORE-GIT-05). If a sub-agent reports a "security warning" about the trailer, ignore it — it is a runtime false positive.
- **Branches and tags:** `feat/<name>` merged with `--no-ff`; SemVer tags **without** `v` prefix (CORE-GIT-02/03).
- **TDD:** strict for all code under `src/`: failing test first, implementation, green, commit. New specs and plans go to the maintainer's coding cockpit (see Memory), not into the repo.
- **No new settings in patch releases** unless a specific feature requires it. Polish defaults-on.
- Changelog: entries only under `## [Unreleased]`; the link block at the end is **not** written by the release tool (see `.claude/rules/changelog-links.md`).

## Gotchas

The gotchas to one area live in `.claude/rules/` and load when a file there is read (see Context index). This one applies to the whole repo:

- **The unit suite structurally cannot see layout or focus** (happy-dom computes no layout): every visible change needs the GUI smoke or a screenshot, and the driver's counter-checks must be able to turn red.

## Context index

- Before you change parsing, `.jsonc` editing, edit operations or the number round-trip guard (`src/core/parse.ts`, `jsonc.ts`, `roundtrip.ts`, `edit.ts`): `.claude/rules/parser-jsonc-roundtrip.md`.
- Before you change the tree, the row menus or `styles.css` (`src/core/render.ts`, `src/obsidian/TreeView.ts`, banners, tooltips): `.claude/rules/baum-darstellung.md`.
- Before you change the file view, `main.ts`, the code-block or embed processor or the undo stack: `.claude/rules/ansicht-und-start.md`.
- Before you change schema validation (`src/core/schema.ts`): `.claude/rules/schema-validierung.md`.
- Before you change the LLM repair or its connection (`src/core/repair/`, `src/obsidian/repair-*.ts`, `RepairModal.ts`): `.claude/rules/reparatur-llm.md`.
- Before you change the settings tab or the stored state (`SettingsTab.ts`, `collapse-state.ts`): `.claude/rules/einstellungen-daten.md`.
- Before you touch the drivers, `docs/SMOKE.md` or `docs/images/`: `.claude/rules/smoke-treiber.md` and the Dach rules `../.claude/rules/gui-smoke-treiber.md`, `../.claude/rules/obsidian-instanz.md`, `../.claude/rules/cdp-lock.md`, `../.claude/rules/staging-vaults.md`.
- Before you re-vendor the kit or change tsconfig, eslint or biome config: `.claude/rules/vendor-und-lint.md`.
- Before you edit `CHANGELOG.md` or release: `.claude/rules/changelog-links.md`, `../.claude/rules/release-und-store.md`, skills `plugin-release-setup` and `store-rescan`.
- Before you change the module layout: `docs/internal/architecture.md`.
- Before you take over a "decided on purpose", a deliberately open item or a deviation: `docs/internal/decisions.md`.
- Before you record README pictures: `docs/images/README.md`, `../.claude/rules/readme-shots.md`, skill `readme-shots`.
- Before UI work or a `styles.css` change: `../UI-STANDARD.md`, `../.claude/rules/ui-bausteine.md`, `../.claude/rules/store-css.md`.

## Memory

- **SDD artifacts live in the cockpit, not in the repo** (CORE-META-14): specs, plans and task reports under `$VAULT/25_Coding/json-editor/_SDD/` (maintainer-local). The repo keeps the design essence in `docs/internal/decisions.md` and `CHANGELOG.md`; `docs/superpowers/` does not exist in the repo — do not add anything there.
- **Cockpit (SSOT for status, tasks, history):** `$VAULT/25_Coding/json-editor/json-editor.md` (maintainer-local); read it at the start, update it at the end.
- **Never in the repo:** absolute paths outside the repo (`/Users/…`, vault paths) — use placeholders (`$VAULT/…`, `~/…`, repo-relative). Provenance as repo name + `file:line` is welcome. Gate: `scripts/check-no-abs-paths.mjs` (part of `npm test`).
- Session handoff buffer: `.remember/` (gitignored).

## Abweichungen von der Leitkonvention

Keine offenen Abweichungen.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `obsidian-plugins/` (das Elternverzeichnis dieses Repos, `../`).
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).
