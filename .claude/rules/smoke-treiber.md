---
paths:
  - "scripts/gui-smoke.ts"
  - "scripts/shots.ts"
  - "docs/SMOKE.md"
  - "docs/images/**"
---

# GUI-Smoke und Aufnahmen — Gotchas

Gotchas zu den Treibern dieses Repos. Allgemeines zu Zweitinstanz, Lock und Bilanz steht in den Dach-Regeln (`../.claude/rules/gui-smoke-treiber.md`, `obsidian-instanz.md`, `cdp-lock.md`).

- **The driver proves it measures this repo's build:** `requireEigenerBuild` (central, `tools/obsidian-cdp/vault.ts`) runs ahead of the first check, with the path taken from the **running instance** (`app.vault.adapter.basePath`), not from `stagingVaultDir()`; `manifest.version` is blind to it because store and repo build carry the same number. The 18/18 run against the work vault was unbacked for that reason (`docs/SMOKE.md` marks it).
- **`--klick-gegenprobe` runs without clicking; every click-dependent check MUST turn red.** It found two tool defects in opposite directions: a check red for the wrong reason (the inactive editor/reading twin container, see `ansicht-und-start.md`) and one green for the wrong reason (it measured "does the file hold the original value?", trivially true when the edit never happened). The current count is in the run table of `docs/SMOKE.md`; exactly the click-dependent checks fall, nothing else.
- **A check asking whether a hidden banner "exists" is always green** (it is `hidden`): measure visibility. Compare elements from the same nesting level (a collapse chip and a comma from different levels differed by −437 px).
- A capture-driver cleanup must reset the collapse state too (see `einstellungen-daten.md`).
