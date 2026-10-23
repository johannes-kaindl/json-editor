---
paths:
  - "src/core/schema.ts"
  - "src/core/draft07-meta-schema.ts"
  - "src/obsidian/SchemaBanner.ts"
  - "tests/core/schema.test.ts"
---

# Schema-Validierung — Gotchas

Gotchas zu `@cfworker/json-schema` und dem Companion-Schema.

- **cfworker is lenient, ajv was not.** `draft07-meta-schema.ts` restores the "malformed schema → error" contract; `reduceErrors()` collapses cfworker's cascading errors back to ajv granularity (a dropped `not`-failure, `additionalProperties: false` duplicates and allOf/`$ref` noise were fixed with 5 regression tests).
- **cfworker enforces `format`** (ajv ran without ajv-formats). Intentional, documented and tested.
- **Schema autoload is opt-in** (`validateAgainstSchema` defaults to `false`) and `compileSchema` carries ReDoS pattern and size guards (the guard once missed brace quantifiers like `(a{1,}){1,}`). Loading the companion schema is async and guarded by a generation counter (a race once let an old schema win).
- **Meta-validation must not over-reject**: a cosmetic non-URI `$id` is accepted (relaxed identifier formats).
