---
paths:
  - "src/vendor/**"
  - "tools/kit-sync.json"
  - "tools/sync-kit.sh"
  - "tsconfig*.json"
  - "eslint.config.mjs"
  - "eslint.overrides.mjs"
  - "biome.json"
  - "vitest.config.ts"
---

# Kit-Vendoring, tsconfigs und Lint — Gotchas

- **`src/vendor/**` are verbatim snapshots from obsidian-kit and code-kit: never hand-edit.** Re-vendor with `bash tools/sync-kit.sh` (a wrapper around the central `../tools/kit-sync/`); pins live in `tools/kit-sync.json` and each directory's `VENDOR.json`. `src/vendor` is excluded from biome.
- **`tsconfig.json` has no `paths` alias for `obsidian`** (it resolves the real obsidian types). The old mock alias made the store scanner's type-aware lint resolve a loose mock and cascade `no-unsafe-*` warnings; the mock lives under `tests/__mocks__/` and is resolved only by `vitest.config.ts` and `tsconfig.test.json`. `tsconfig.build.json` is the production `tsc` check against the real `obsidian.d.ts`; `tsconfig.scripts.json` covers the drivers.
- **Only the source-code eslint warnings drive the store review "Caution"**; the behavior items (clipboard, eval) are informational. `npm run lint` mirrors the scanner (`eslint-plugin-obsidianmd`, type-checked, `--max-warnings 0`, no inline `eslint-disable`) and stays in the gate. eslint exits 0 on warnings, so a lint guard that reports 0 while the reviewer reports 66 means the guard lacks `--max-warnings 0` or runs on a stale copy.
- **`minAppVersion` is driven by the lint rule `no-unsupported-api`** (e.g. `View.scope` needs 1.5.7); on `main` it is 1.11.4 (keychain).
