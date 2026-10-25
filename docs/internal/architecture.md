# Architecture

Layout of `json-editor`. Never loads on its own; the core of `AGENTS.md` points here.

**Two-layer split:** `src/core/` is pure TypeScript with **no Obsidian imports** (unit-tested directly via Vitest); `src/obsidian/` is the adapter that imports core and the Obsidian API. This boundary keeps the core testable — preserve it.

```
src/
├── core/                       pure TS, no Obsidian imports (vitest tests directly)
│   ├── schema.ts               compileSchema(text) → @cfworker/json-schema-wrapped CompiledSchema; validate(value) → PathError[] (JsonPath, not Pointer)
│   ├── draft07-meta-schema.ts  canonical draft-07 meta-schema, embedded to detect malformed companion schemas
│   ├── types.ts                JsonValue, JsonPath, ParseResult, RenderOptions, SerializeOptions, SearchOptions, SearchResult
│   ├── parse.ts                parse(text) → ParseResult (line/col errors); re-exports the kit's offsetToLineCol (shared with jsonc.ts; the position of a message comes from the kit's offsetFromMessage)
│   ├── jsonc.ts                comment-preserving JSONC edit engine (wraps jsonc-parser): jsoncParse + text-in/text-out ops mirroring edit.ts; used only on the .jsonc path
│   ├── roundtrip.ts            does a number literal lose VALUE when parsed and serialized back? (lossy-number guard)
│   ├── serialize.ts            serialize(value, opts) → string
│   ├── edit.ts                 editValue, addObjectKey, addArrayItem, deleteAt, renameKey, moveArrayItem, moveObjectKey, changeType, JsonType, computeInsertionIndex — all pure + immutable
│   ├── type-labels.ts          JSON_TYPES and TYPE_LABELS, shared by the type popover and the row menu
│   ├── history.ts              generic History<T> (undo/redo stacks, cap 100, redo-clear-on-push); JsonFileView instantiates History<string>
│   ├── render.ts               renderTree(value, opts) → HTMLElement; internal renderContainer(kind) + WAI-ARIA roles (tree / treeitem / group)
│   ├── render-budget.ts        MAX_TREE_BYTES / MAX_TREE_NODES: above either, a file opens in source mode
│   ├── search.ts               findMatches(value, query, opts?) → match + onPath sets
│   ├── collapse-state.ts       pure per-file collapse state (resolveCollapsed, recordFileState, capStates; LRU, limit 50)
│   ├── paths.ts                collectPaths(value, limit) → every addressable path as a string + a truncation flag (cap 5000)
│   ├── path.ts                 pathToString + parsePathStr (inverses)
│   └── repair/                 LLM repair of broken code blocks: fence, prompt, client, diff-view, settings, window (first parser error and its spot), windowed (the ladder: windows above 200 lines, then the whole document) (see .claude/rules/reparatur-llm.md)
├── obsidian/                   adapter layer, imports core/ + the Obsidian API
│   ├── JsonFileView.ts         extends TextFileView; owns mode toggle, toolbar, unified History<string>, applyMutation, undo/redo, banners, setSchema, companion schema
│   ├── TreeView.ts             wraps core/render + inline edit/rename + copy buttons + scrollToPath + applyFilter + roving-tabindex keyboard nav + RowActions + AddAffordance + drag-handle + drop handling + TypeMenu wiring + setValidationErrors
│   ├── SourceView.ts           CodeMirror 6 wrapper with @codemirror/lang-json; no local history() — the unified stack lives in JsonFileView
│   ├── SearchBar.ts            input + clear + match-count component
│   ├── RowActions.ts           hover-revealed rename + delete + type-switch buttons per row
│   ├── RowMenu.ts              long-press / context Obsidian Menu per row (mobile model)
│   ├── AddAffordance.ts        + Add key / + Add item per container
│   ├── TypeMenu.ts             popover menu of the 6 JSON types, singleton
│   ├── SchemaBanner.ts         error-count display above the editor body; is-schema-parse-error variant for malformed schema files
│   ├── LossBanner.ts           warns when the file holds number literals JSON cannot round-trip
│   ├── LargeFileBanner.ts      "Load tree anyway" for files above the render budget
│   ├── CodeblockProcessor.ts   read-only tree for ```json and ```jsonc blocks in notes
│   ├── FileEmbedProcessor.ts   `![[file.json]]` in reading view: collapsed read-only tree instead of the file chip (≤ 512 KB, no `#part`)
│   ├── RepairModal.ts, repair-service.ts, repair-flow.ts   LLM repair: diff modal, kit connection, apply paths
│   ├── SettingsTab.ts          settings (declarative, via the vendored kit walker)
│   ├── GoToPathModal.ts        SuggestModal over every path in the file
│   ├── Breadcrumb.ts           path display, segment click → scrollToPath
│   ├── CopyButton.ts           hover-only buttons; click = value, Alt+click = path
│   ├── Tooltip.ts              singleton hover tooltip (500 ms delay)
│   ├── clipboard.ts            copyJsonValue / copyJsonPath on top of the kit's copyToClipboard; they stay local because they know JsonValue/JsonPath (no kit counterpart)
│   └── dom.ts                  activeDoc(), elementFactory / makeEl (pop-out safe, no bare `document`)
├── vendor/                     verbatim snapshots from obsidian-kit and code-kit (rules: .claude/rules/vendor-und-lint.md)
│   ├── kit/                    pure layer: clipboard, settings (mergeSettings), endpoint_config, sampling-profiles, redact, secrets, think-splitter, diff, replace-span …
│   └── kit-obsidian/           obsidian-coupled layer: llm-connection, chat-client, endpoint-list, request-section, settings_walker, collapsible, folder-suggest …
├── i18n/strings.ts             en/de texts (repair feature and the delete message)
└── main.ts                     plugin entry: registers view, code-block processor, embed processor, settings tab and the commands

tests/                          mirrors src/ (core/, obsidian/, vendor/, toolchain/); the Vitest obsidian mock lives in tests/__mocks__/ and tests/helpers/
docs/                           SMOKE.md (GUI-smoke checklist + run log), images/ (README pictures and the capture contract)
scripts/                        gui-smoke.ts (GUI-smoke driver) and shots.ts (README capture driver); both import ../../tools/obsidian-cdp/
tools/                          kit-sync.json (kit pins) and sync-kit.sh (wrapper around the central kit-sync)
```

**Four tsconfigs:** `tsconfig.json` (IDE and `src/`, no `paths` alias), `tsconfig.test.json` (tests; aliases `obsidian` to the mock), `tsconfig.build.json` (production `tsc` check against the real `obsidian.d.ts`), `tsconfig.scripts.json` (the drivers).
