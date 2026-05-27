# Changelog

All notable changes to **Obsidian JSON Editor** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions follow Obsidian's plugin convention of no `v` prefix on git tags (e.g. `0.1.1`, not `v0.1.1`).

## [Unreleased]

## [0.1.2] — 2026-05-27

### Added
- **Visual redesign (Direction B)** — full token-based theme-aware stylesheet (`--jv-*` CSS variables), nested tinted blocks for object/array depth, collapse chips with item counts, SVG chevron icons, and a unified top toolbar combining the breadcrumb and mode toggle.
- **Embedded code-block polish** — `` ```json `` blocks in Markdown notes render as a titled card; blocks over 20 lines auto-collapse; invalid JSON renders as a styled error card with line/column info instead of crashing.
- **Empty-state title and hint** for the `.json` file view when the file is empty.
- **Public documentation surface** — full README rewrite, CHANGELOG (Keep-A-Changelog), CONTRIBUTING, SECURITY, issue + PR templates for Codeberg (`.forgejo/`) and GitHub (`.github/ISSUE_TEMPLATE/`), `.editorconfig`, `versions.json`.
- **CI: PR-time test workflow** (`npm ci → npm test → npm run build` on every push to `main` and every PR).
- **package.json metadata** — `repository`, `bugs`, `homepage`, expanded `keywords`, GPL-3.0-or-later SPDX.

### Changed
- Stylesheet rewritten from scratch around design tokens; no hardcoded colors anywhere, theme-aware end to end.
- Test count: 122 → 133.
- Release workflow now extracts release notes from the matching `## [<tag>]` section in `CHANGELOG.md` instead of using a placeholder.

### Fixed
- Release notes are now passed to `gh release create` via env var rather than direct shell interpolation, so notes containing backticks or other shell-special characters no longer break the release job.

## [0.1.1] — 2026-05-21

### Added
- **Breadcrumb** showing the current JSON path; clicking a segment scrolls back up the tree.
- **Copy buttons** on hover — click copies the value, Alt-click copies the JSON path.
- **Tooltips** with a 500 ms hover delay (above/below position-flip based on viewport).
- **Animated collapse** transitions for tree nodes.
- **Typography polish** — consistent font sizing, spacing, and weight across tree and source modes.

## [0.1.0] — 2026-05-20

### Added
- Initial public release.
- **`.json` file view** with a Tree↔Source mode toggle.
- **Tree mode** with inline editing of strings, numbers, and booleans.
- **Source mode** built on CodeMirror 6 with `@codemirror/lang-json` syntax highlighting.
- **Code-block processor** — read-only tree rendering for `` ```json `` blocks inside Markdown notes.
- **Parse-error banner** with line/column info on invalid JSON.
- **Settings tab** — default open mode, indent style (2 / 4 / tab), tree marker style (modern / classic), auto-collapse depth.
- **GitHub Actions release workflow** — tag push triggers build, test, and GitHub release with `main.js`, `manifest.json`, and `styles.css` as assets.

[Unreleased]: https://codeberg.org/jkaindl/json-editor/compare/0.1.2...HEAD
[0.1.2]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.2
[0.1.1]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.1
[0.1.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.1.0
