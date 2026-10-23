---
paths:
  - "CHANGELOG.md"
---

# CHANGELOG — Link-Block am Ende

- **`tools/release/release.mjs` writes the new version heading but does not extend the reference block at the end of the file.** Without a ref every release leaves one heading rendering as literal `[1.x.y]` instead of a link, and `[Unreleased]` compares against a stale tag. **Add the ref by hand right after `npm run release`** (and the `[Unreleased]` compare). json-editor is the only repo in the workspace that keeps such a block (measured 2026-08-22 across 19 plugin repos, again 2026-10-23), so a central fix would be an n=1 extraction and is not planned.
