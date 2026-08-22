# README images — capture contract

These images are documentation assets. The release ships only `main.js`, `manifest.json`
and `styles.css`, so nothing here reaches anyone who installs the plugin.

They are **not** taken by hand: `npm run shots` drives a running Obsidian over the Chrome
DevTools Protocol, sets up each state, captures it and writes the files below. The recipe
lives in [`scripts/shots.ts`](../../scripts/shots.ts), the demo vault in
[`fixture/`](fixture/). Anything a reader can see in a picture goes around the world with
the repo — the fixture therefore uses invented, generic, English sample data.

## Files

| File | Class | Referenced by | Must show |
|---|---|---|---|
| `hero.png` | hero | `README.md`, `README.de.md` | The whole window: `trailhead.json` open in tree mode, toolbar with breadcrumb, search and the Tree/Source pills, nested blocks with collapse chips. One look must answer "what is this". |
| `tree-view.png` | feature | both READMEs | Tree close up: nested object and array blocks, one row hovered so its actions are visible (rename ✎, delete ✕, type switch T, drag handle ⋮⋮), the breadcrumb showing the active path. |
| `source-view.png` | feature | both READMEs | `tsconfig.jsonc` in source mode: CodeMirror highlighting **with the comments visible** — this is what the JSONC path is about, and the mode pills show Source is active. |
| `search.png` | feature | both READMEs | Search active with a live match count, matching rows highlighted, non-matching ones filtered away. |
| `schema-validation.png` | feature | both READMEs | Opt-in companion-schema validation: the error-count banner above the tree and the offending rows marked inline (`maxElevationGain: 1800` exceeds the schema's maximum, `maintainers` is required and missing). |
| `codeblock-in-note.png` | feature | both READMEs | A ```` ```json ```` fence inside a Markdown note, rendered read-only as a collapsible tree in reading view — with the note's prose around it, so it is clear this happens *inside* a note. |
| `settings.png` | detail | both READMEs | The plugin's settings tab in full. Embedded as a 380 px preview linked to the full-size file — a settings page is legitimately tall. |

Classes, display widths, size budgets and the embedding form come from the workspace image
standard (`_docs/readme/readme-spec.json`); `npm run shots:check` enforces them.

## What the run needs

- A **built** plugin (`npm run build`) — `npm run shots` captures what is installed in the
  vault, not what is in the working tree. `--deploy` copies the current build in and
  reloads the plugin; without it you may be photographing the previous version, and
  nothing in the log would say so.
- `STAGING_VAULTS_DIR` pointing at a directory for recording vaults, and a one-off
  `npm run shots -- --setup` to build this repo's vault from `fixture/`.
- Obsidian running with `--remote-debugging-port=9222`, that vault open and trusted, and
  the interface language set to **English** (the driver checks and refuses otherwise).

No servers, no accounts, no network: everything in these pictures is local files.

## Not photographed, on purpose

- **Drag-and-drop reordering.** HTML5 drag events cannot be reproduced honestly over CDP —
  a picture of it would be staged. `Alt`+`↑`/`↓` does the same thing and is documented in
  the README text.
- **The mobile long-press menu.** It needs a real phone, not a debug port.
- **Undo across a mode switch.** A still frame cannot show a sequence, and the one thing
  that would carry it — a GIF — is the single format in this workspace with a known budget
  trap. The README says it in one sentence instead.
