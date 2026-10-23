---
paths:
  - "src/obsidian/SettingsTab.ts"
  - "src/core/collapse-state.ts"
  - "tests/obsidian/SettingsTab*.test.ts"
  - "src/vendor/kit/settings.ts"
  - "src/vendor/kit-obsidian/settings_walker.ts"
---

# Einstellungen und gespeicherter Zustand — Gotchas

- **`mergeSettings` is open world on purpose:** unknown `data.json` keys survive the load/save cycle (vendored from the kit).
- **The settings tab implements `getSettingDefinitions()`** with the vendored kit walker (`settings_walker.ts`, verbatim, no deviation any more).
- **The per-file collapse state does not live in `settings`** but in a second field that `persist()` writes alongside it (`core/collapse-state.ts`, LRU 50, one shared `data.json` write path). A driver cleanup that resets only `settings` changes nothing on disk.
