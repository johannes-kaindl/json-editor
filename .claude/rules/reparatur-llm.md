---
paths:
  - "src/core/repair/**"
  - "src/obsidian/repair-*.ts"
  - "src/obsidian/RepairModal.ts"
  - "src/i18n/strings.ts"
  - "tests/core/repair/**"
  - "tests/obsidian/repair-*.test.ts"
---

# LLM-Reparatur — Gotchas

Gotchas zur Reparatur kaputter Codeblöcke (ab 1.13.0) und zur Kit-Verbindung dahinter.

- **The connection is the kit's `createLlmConnection`** (Welle 15, 1.15.0). `src/obsidian/repair-service.ts` builds it (mode `structured`, `stream: false` over `requestUrlTransport` with `fallback: "none"`, `restoreContent: "json"`, `maxTokens` read from a per-call `repairBudget` so the family reserve of the sampling profile still applies) and maps its result with `toRepairResult` (`src/core/repair/client.ts`). The plugin exposes `plugin.llm` for drivers. **`transports.anthropic: true` is the Claude opt-in** (1.19.0): without it the connection asks the manager only for `http` endpoints and never sees a Claude endpoint (pinned by `tests/obsidian/repair-service.test.ts`, which goes red without it). On Claude the sampling profile sends no `temperature`/`top_p`, "thinking off" is `effort: low`, and the kit drops a per-call value the family does not accept (`override-dropped`); the plugin sets none, so no 400 risk. The content of the block then goes to Anthropic: README and SECURITY.md say so.
- **The settings tab draws the whole connection with one `llm.renderSettings(...)` row** and calls `llm.hideSettings()` in `hide()`. Visible consequences of the swap: `minAppVersion` 1.11.4 (keychain), no `apiKey` in `data.json`, secrets redacted on the wire, the *Timeout* setting is gone (an old `timeoutSec` stays in `data.json` as a harmless foreign field), no *Level picker in chat* row.
- **Pure core in `src/core/repair/`:** `fence` finds and splices the block, `prompt` builds messages and validates the answer with the block's own parser, `client` holds `MODE`, `repairMaxTokens` and `toRepairResult`, `diff-view` pairs lines for the two-column view, `settings` loads endpoints, choice and request. `repair-flow` writes on the button path with `vault.process`, on the command path with the editor; **both refuse when the block text changed**.
- **`src/i18n/strings.ts` holds en/de texts for the repair feature and the delete message (Undo toast, `delete.*`), plus `request.*` and `set.*` keys**; the connection texts come from the kit (`llm-connection-strings`), the rest of the UI is still inline English (see `docs/internal/decisions.md`).
