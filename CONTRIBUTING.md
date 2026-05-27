# Contributing

Thanks for considering a contribution. This document covers bug reports, pull requests, and the conventions that keep the codebase coherent.

## Where to file things

- **Bugs and feature requests:** [Codeberg issues](https://codeberg.org/jkaindl/json-editor/issues) (primary). The GitHub mirror exists for the Obsidian Community Plugin Directory and is not actively monitored for issues.
- **Pull requests:** Codeberg. PRs against the GitHub mirror will be politely redirected.
- **Security issues:** see [`SECURITY.md`](SECURITY.md) — please do not file these as public issues.

## Bug reports

Good bug reports include:

1. Obsidian version (Settings → About).
2. Plugin version (Settings → Community plugins → Installed → JSON Editor).
3. Operating system + desktop/mobile.
4. A minimal `.json` file or `` ```json `` block that reproduces the issue (please don't paste your whole vault).
5. What you expected vs. what happened.
6. Any errors visible in the developer console (`Cmd/Ctrl+Shift+I` → Console tab).

The issue templates on Codeberg and GitHub will walk you through this.

## Pull requests

### Before you start

For anything non-trivial (new features, refactors, breaking changes), please open an issue first to discuss the approach. Small fixes (typos, obvious bugs, doc improvements) can go straight to a PR.

### Setup

```bash
git clone https://codeberg.org/jkaindl/json-editor.git
cd json-editor
npm install            # uses .npmrc with legacy-peer-deps if needed
npm test               # confirm green baseline
npm run test:coverage  # all tests + v8 coverage (text + html in coverage/)
npm run build          # confirm clean build
```

### Workflow

1. **Branch:** `feat/<short-name>` for features, `fix/<short-name>` for bug fixes. Branch from `main`.
2. **TDD:** write a failing test first under `tests/core/` or `tests/obsidian/`, then the implementation, then watch it go green. The codebase is strict TDD — PRs that add untested code will be asked to add tests before merge.
3. **Commit:** Conventional Commits prefix with scope, e.g. `feat(core): add foo`, `fix(obsidian): bar`, `docs: baz`. One logical change per commit.
4. **Build cleanly:** `npm test` green and `npm run build` clean (no `tsc` errors) before pushing.
5. **PR description:** what changed, why, and how you tested it. Link the issue if there is one.

### Architecture notes

- **`src/core/`** is pure TypeScript with no Obsidian imports. It is fully unit-testable and must stay that way — anything that needs the Obsidian API belongs in `src/obsidian/`.
- **`src/obsidian/`** is the adapter layer. Tests here use the Vitest mock at `src/__mocks__/obsidian.ts`.
- **Two tsconfigs:** `tsconfig.json` (IDE + Vitest, has `paths` alias) and `tsconfig.build.json` (production check, no alias). The production build must pass `tsc -p tsconfig.build.json`.
- **No new settings in patch releases** unless a feature genuinely requires it — polish defaults-on instead.

### Releases (maintainer only)

Tag with no `v` prefix (Obsidian convention):

```bash
git tag -a 0.1.X -m "0.1.X — short headline"
git push origin main && git push origin 0.1.X
git push github main && git push github 0.1.X
```

The GitHub Actions release workflow builds, tests, and publishes the release with `main.js`, `manifest.json`, and `styles.css` attached.

## Scope

This plugin is intentionally focused: view and edit JSON inside Obsidian. Adjacent features (YAML, TOML, schema-aware forms, etc.) are out of scope.

## Code of conduct

Be kind, assume good faith, and keep discussion on the technical merits. The maintainer reserves the right to remove comments or close issues that go off the rails.
