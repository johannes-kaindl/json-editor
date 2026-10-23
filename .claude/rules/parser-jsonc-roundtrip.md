---
paths:
  - "src/core/parse.ts"
  - "src/core/jsonc.ts"
  - "src/core/roundtrip.ts"
  - "src/core/edit.ts"
  - "src/core/serialize.ts"
  - "tests/core/parse.test.ts"
  - "tests/core/jsonc.test.ts"
  - "tests/core/roundtrip.test.ts"
  - "tests/core/edit*.test.ts"
---

# Parser, JSONC und Zahlen-Roundtrip — Gotchas

Gotchas zu den reinen Bearbeitungs-Modulen unter `src/core/`.

- **`parse.ts`:** `lastIndexOf` heuristic for V8 error position can misidentify when the unexpected-token char also appears earlier in valid content (e.g. inside a string). Acceptable for v1.0/v1.1; rewrite-parser deferred.
- **`.jsonc` has a dual mutation path.** `core/jsonc.ts` maps every structural edit onto a targeted source-text edit so comments and formatting survive; `.json` stays byte-for-byte unchanged. Rename is a key-token edit, reorder a CST rebuild: `attachedLead()` decides which comment lines travel with an element (a blank line severs the bond and keeps a comment as a heading for its position); free-standing comment lines keep their absolute position — nothing is ever lost.
- **Comments must not trigger the lossy-number guard.** Hyphens in `.jsonc` comments hit it (`Number("-")` = `NaN`) and disabled tree editing on safe files (found by a GUI smoke test, 1.10.1); the detector skips comments.
- **The lossy-number guard flags real value loss only** (`roundtrip.ts`): an integer literal the double cannot hold exactly (`BigInt(literal) !== BigInt(Number(literal))`, 64-bit IDs beyond 2^53) or a literal that overflows to ±Infinity. Value-equal `1.0` / `1e3` are not flagged; numeric key reordering is a documented README limitation, not detected.
- **A lossy file opens as a read-only tree with the `LossBanner`**, and typing an unsafe integer into a tree cell is refused (`isSafeInteger` in `TreeView.ts`).
- **`__proto__`-safe rebuilds:** object rebuilds use `Object.fromEntries` and `hasOwnProperty` guards (a key named `__proto__` must stay a key).
