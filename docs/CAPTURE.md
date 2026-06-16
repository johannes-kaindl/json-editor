# Capture checklist — README visuals (v1.9.1)

This is the **one thing only you can do**: capture the screenshots + animations in a running Obsidian. Everything else (sample data, README wiring, PNG optimization, the release) is already done or will be done by me once your files land.

**How it works:** capture each item → save it into [`docs/images/`](images/) with the **exact filename** shown → tell me. I optimize, wire, and ship as 1.9.1. One checkbox = one finished file you can forget about.

If anything looks off or won't capture, just drop a note/screenshot in the chat — don't fight it.

---

## 1 · Setup (do once, before capturing)

- [ ] **Deploy the current build to your test vault.** From the repo: `OBSIDIAN_PLUGIN_DIR=<your-test-vault>/.obsidian/plugins/json-editor npm run deploy`, then reload Obsidian (`Cmd+R`). *Done = the test vault runs this exact build.*
- [ ] **Copy the two demo files into your test vault** (any folder): [`docs/sample.json`](sample.json) and [`docs/sample.schema.json`](sample.schema.json). They must sit **next to each other** (same folder, same base name) for schema validation to find the schema. *Done = both files are in the vault.*
- [ ] **Pick a clean look.** A stock theme (Obsidian default is fine), no unrelated plugins cluttering the toolbar, sidebar collapsed or showing only neutral file names (no private vault content in frame). *Done = the frame is clean.*
- [ ] **Install a capture tool** if you don't have one. Recommended: **[Kap](https://getkap.co/)** (free) — records a region straight to GIF with an fps setting. macOS `Cmd+Shift+4` covers all the still PNGs. *Done = you can record a cropped region.*

> Capture at 2× (Retina is fine) — the README downscales via `width=`. Crop to the **pane**, not the whole desktop (no menubar/dock).

---

## 2 · Animations (GIF) — record with Kap at ~15 fps, crop to the editor pane

> Each GIF: 5–8 s, loop-friendly (end where you started), move the cursor slowly, pause ~½ s on each key state. Target **< 3 MB** (Kap shows the size). If a GIF is too big: lower fps to 12 or crop tighter.

- [ ] **Hero, dark theme** → save as `hero-dark.gif` (~820px wide). Open `sample.json` in Tree mode → expand the `settings` block → click the `accent` value and edit it (Enter to commit) → click the **Source** toggle (highlighted JSON appears) → toggle **back** to Tree. *Done = `hero-dark.gif` in `docs/images/`.*
- [ ] **Hero, light theme** → save as `hero-light.gif`. Switch Obsidian to a light theme, repeat the exact same flow. *Done = `hero-light.gif` in `docs/images/`.* *(If you only have time for one hero, do dark — it's the fallback everyone sees.)*
- [ ] **Reorder** → save as `reorder.gif` (~520px). Hover a row in the `trails` array (or a `tags` entry) → grab the `⋮⋮` handle → drag it up/down to a new position → drop. *Done = `reorder.gif`.*
- [ ] **Type-switch** → save as `type-switch.gif` (~520px). Click the `T` button on a row (e.g. `private` or `telemetry`) → pick a different type from the menu. *Done = `type-switch.gif`.*
- [ ] **Search / filter** → save as `search-filter.gif` (~520px). Press `Cmd/Ctrl+F` → type a query (e.g. `trail` or `theme`) → watch the tree narrow to matches → clear with `Esc`. *Done = `search-filter.gif`.*
- [ ] **Cross-mode undo** → save as `undo-crossmode.gif` (~520px). Edit a value in Tree mode → toggle to Source → press `Cmd/Ctrl+Z` → watch the edit revert (proves one shared history). *Done = `undo-crossmode.gif`.*

---

## 3 · Stills (PNG) — `Cmd+Shift+4`, crop to the pane

> Drop raw PNGs in with the exact names below; **I'll optimize them** after they land (you don't need pngquant).

- [ ] **Tree view, dark** → `tree-view-dark.png` (~780px). `sample.json` in Tree mode, `settings` + a `trails` entry expanded, breadcrumb visible, and **hover one row** so the ✎/✕/T/⋮⋮ controls show. *Done = `tree-view-dark.png`.*
- [ ] **Tree view, light** → `tree-view-light.png`. Same shot, light theme. *Done = `tree-view-light.png`.*
- [ ] **Source view** → `source-view.png` (~780px). Toggle to Source mode (light theme is nice for variety); optionally open `Cmd/Ctrl+F` find. *Done = `source-view.png`.*
- [ ] **Schema validation** → `schema-validation.png` (~780px, dark). In Settings → JSON Editor, turn **Validate against JSON schema** ON, reload the `sample.json` view. With `sample.schema.json` beside it you should see an **error banner** + red rows (the schema requires a missing `maintainers` field and caps `maxElevationGain`). Frame the banner + the red row. *Done = `schema-validation.png`.*
- [ ] **Code block in a note** → `codeblock-in-note.png` (~780px). In any note, add a ` ```json ` fenced block (paste part of `sample.json`), switch to **reading view**, frame the rendered collapsible card. *Done = `codeblock-in-note.png`.*
- [ ] **Settings tab** → `settings.png` (~640px). Settings → Community plugins → JSON Editor; frame the settings panel. *Done = `settings.png`.*
- [ ] **Guard banner** → `guards.png` (~780px). Easiest: temporarily lower nothing — open a large `.json` to trigger the *Load tree anyway* banner, OR a file with a >2^53 integer for the read-only banner. Frame the banner. *(If this one's fiddly, skip it and tell me — it's in a collapsed `<details>`, low priority.)* *Done = `guards.png` or told-me-skipped.*

---

## 4 · Mobile (OPTIONAL — needs a phone)

- [ ] **Mobile action menu** → `mobile-menu.png` (~320px). On Obsidian mobile with the plugin installed, open `sample.json`, **long-press a row**, screenshot the action menu. *(Optional: you picked the "full" desktop package, not mobile. If you skip it, tell me and I'll drop the mobile block from the README before shipping.)* *Done = `mobile-menu.png` or told-me-skipped.*

---

## 5 · GIF too big? (only if Kap reports > ~3 MB)

If a recording is over budget and Kap's fps/crop won't get it down, record a `.mov` (macOS `Cmd+Shift+5`) and convert with `gifski` (`brew install gifski`):

```bash
gifski --fps 15 --width 520 --quality 90 -o reorder.gif recording.mov   # feature GIFs
gifski --fps 15 --width 820 --quality 90 -o hero-dark.gif recording.mov  # hero
```

Lower `--width` or `--fps` (12) to shrink further.

---

## 6 · When you're done

- [ ] All captured files are in [`docs/images/`](images/) with the **exact names** above. *Done = files are there.*
- [ ] Tell me in the chat: **"captures done"** (and name any you skipped). *Done = I take it from here.*

**What I do next (no clicks for you):** verify every file is present + sized right → optimize the PNGs → adjust any README `width=` that looks off → commit assets + README → tag **1.9.1** → push (Codeberg → mirrors to GitHub → triggers the release + the Obsidian directory re-scan). Then the directory listing shows the hero + screenshots.

---

## Glossary

- **Hero `<picture>`** — the top animation. The README ships a dark GIF and a light GIF; GitHub serves whichever matches the reader's theme. The dark one is the fallback everyone (incl. the in-app Obsidian directory) sees, so it's the must-have.
- **Pinned raw URL** — the README points at `raw.githubusercontent.com/.../1.9.1/docs/images/<file>` so the images resolve everywhere (GitHub, the in-app plugin directory, Codeberg). They go live only once we tag `1.9.1` — which is the last step, after your files are in.
- **Why exact filenames** — the README already references these names. Matching them means zero rewiring: your file drops in and the image just appears.
- **Test vault** — your local Obsidian vault used for manual testing; `npm run deploy` copies the build into its `.obsidian/plugins/json-editor/` folder.
