# Security Policy

## Supported versions

Only the latest published release is supported with security fixes. Older versions will not receive backports.

| Version | Supported |
|---|---|
| `1.x` (latest: `1.8.1`) | ✅ |
| `0.x` and earlier | ❌ |

## Reporting a vulnerability

Please **do not** file security issues as public GitHub or Codeberg issues.

Instead, report privately by email to **v6t2b9@googlemail.com** with:

1. A description of the issue and its potential impact.
2. Steps to reproduce, including a minimal example if possible.
3. The plugin version and Obsidian version where you observed the issue.
4. Any suggested mitigation, if you have one.

I aim to acknowledge reports within **7 days** and to ship a fix or coordinated disclosure within **30 days** for confirmed issues. If you do not get a reply within 7 days, please open a non-sensitive Codeberg issue saying you sent a security email (without disclosing the details) so I can chase it.

## Threat model

This plugin runs entirely inside Obsidian, with no network access, no telemetry, no remote resources, and no privileged file-system access beyond what Obsidian itself grants. The realistic threat surface, and how it is handled:

- **Malicious JSON content** crashing or poisoning the plugin. Parsing uses the platform `JSON.parse`; structural tree edits rebuild objects with `Object.fromEntries` (`[[DefineOwnProperty]]` semantics), so a `__proto__` (or other prototype-name) key in untrusted data is preserved as an own data property and can **not** poison the object prototype (prototype-pollution-style payloads — fixed in 1.6.0).
- **Companion JSON Schema as a ReDoS vector.** A `*.schema.json` dropped next to a data file is compiled with Ajv; a schema author controls regex `pattern` / `patternProperties` values, and a catastrophic-backtracking regex against attacker-influenced data can hang the UI thread. Mitigations (1.5.0):
  - **Schema validation is opt-in.** `validateAgainstSchema` defaults to `false`; with the default settings no companion schema is ever loaded, compiled, or run. This is the primary defense in a shared or synced vault.
  - **Cheap pre-checks** before Ajv compiles: oversized schemas (> ~1 MB) are rejected, and a nested-quantifier heuristic rejects the classic catastrophic shapes (`(a+)+`, `(x+)*`, `(.*)+`, `(a{1,}){1,}`, …).
  - **Residual surface (stated honestly):** the heuristic is conservative and does not catch every ReDoS class (e.g. alternation-based `(a|a)+`). Validation runs **synchronously on the main thread**, and a synchronous regex cannot be aborted — so a sufficiently crafted schema that you have explicitly opted into trusting could still stall the UI. Only enable validation for schema files you trust. A hard guarantee (validation in a Worker with a timeout) is future work.
- **Dynamic code generation (Ajv).** Ajv compiles JSON-Schema validators with `new Function` — its standard, documented mechanism. This is why an automated scan reports "dynamic code execution." It only happens when schema validation is opt-in-enabled *and* a companion schema you trust is loaded; **no plugin code itself uses `eval` or `new Function`.**
- **Clipboard.** The copy-value / copy-path actions write to the system clipboard via `navigator.clipboard`, only on explicit user action. The plugin never *reads* the clipboard.
- **DOM injection** through a misrendered value. The renderer uses `textContent` / `replaceChildren()`, never `innerHTML` with untrusted strings (a regression test enforces no `innerHTML` across the source tree, 1.5.0).
- **Lossy number handling** is a data-integrity (not security) concern: integers beyond 2^53 are detected and the tree opens read-only so a tree edit can't silently rewrite them (1.5.0).
- **Path-disclosure** through error messages.

Issues outside this surface (e.g. supply-chain attacks on the bundled `ajv` or the Obsidian-provided `@codemirror/*` packages) should be reported to the upstream maintainers; I will pull in fixes as they land.
