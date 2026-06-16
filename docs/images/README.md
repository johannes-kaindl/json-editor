# README media assets

These images are referenced by the root [`README.md`](../../README.md) (and only there). They are **documentation assets**, not part of the plugin — the release ships only `main.js`, `manifest.json`, and `styles.css`, so nothing here is downloaded by users who install the plugin.

The root README references them by **absolute** `raw.githubusercontent.com` URL pinned to a release tag (relative paths break in the in-app Obsidian plugin-directory renderer). When a new visual release is cut, the pinned tag in `README.md` is bumped to match.

## Expected files

Capture per [`docs/CAPTURE.md`](../CAPTURE.md). Target widths are the *display* widths set in the README; capture at 2× (Retina) and let the `width=` attribute downscale.

| File | Type | Theme | Shows |
|---|---|---|---|
| `hero-dark.gif` | GIF | dark | Hero: open `.json` → tree → expand → inline-edit → toggle Source → back |
| `hero-light.gif` | GIF | light | Hero, light theme (served via `<picture>` for light-mode readers) |
| `tree-view-dark.png` | PNG | dark | Tree view: nested blocks, breadcrumb, a hover row with ✎/✕/T/⋮⋮ |
| `tree-view-light.png` | PNG | light | Tree view, light theme |
| `source-view.png` | PNG | light | Source mode: CodeMirror syntax highlighting (+ `Cmd/Ctrl+F` find if easy) |
| `reorder.gif` | GIF | either | Drag the `⋮⋮` handle (and/or `Alt`+`↑`/`↓`) to reorder rows |
| `type-switch.gif` | GIF | either | `T` menu switching a value's JSON type |
| `search-filter.gif` | GIF | either | `Cmd/Ctrl+F` live-filtering the tree to matches |
| `undo-crossmode.gif` | GIF | either | `Cmd/Ctrl+Z` undo carrying across a tree↔source switch |
| `schema-validation.png` | PNG | dark | Opt-in schema validation: red rows + error-count banner |
| `codeblock-in-note.png` | PNG | either | A ` ```json ` fence rendered as a collapsible tree inside a Markdown note (reading view) |
| `settings.png` | PNG | either | The plugin settings tab |
| `guards.png` | PNG | either | Large-file *Load tree anyway* and/or big-integer read-only banner |
| `mobile-menu.png` | PNG | either | Mobile long-press action menu (captured on a phone) |

Keep GIFs under ~3 MB (hard ceiling 5 MB); optimize PNGs with `pngquant`/`oxipng`. Optimization commands are in [`docs/CAPTURE.md`](../CAPTURE.md).
