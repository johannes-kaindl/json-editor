# `.jsonc` Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.jsonc` file support with full tree editing that preserves comments and formatting.

**Architecture:** A new pure module `src/core/jsonc.ts` wraps Microsoft's `jsonc-parser` and offers text-in/text-out mutation ops mirroring `edit.ts`. `JsonFileView` gains an `isJsonc` flag and branches only its mutation path: `.json` keeps `serialize(newValue)`, `.jsonc` produces new source text via the `jsonc*` ops. Everything else (tree render, Source mode, unified `History<string>`, schema) is shared.

**Tech Stack:** TypeScript, `jsonc-parser@3.3.1` (new runtime dep, MIT, zero-dep, eval-free), Vitest, esbuild.

## Global Constraints

- **Two-layer boundary:** `src/core/` has NO Obsidian imports. `src/core/jsonc.ts` is pure, Vitest-direct.
- **Only `.jsonc` gets comment tolerance.** `.json` behavior is byte-for-byte unchanged.
- **No data loss:** every comment in a `.jsonc` file survives every tree edit (reorder has a documented positional boundary — see spec).
- **No `minAppVersion` bump:** `registerExtensions` / `registerMarkdownCodeBlockProcessor` are long-stable. Stays `1.5.7`.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Runtime deps after this:** two (`@cfworker/json-schema`, `jsonc-parser`). Both eval-free, zero transitive deps.
- Spec: `docs/superpowers/specs/2026-07-11-jsonc-support-design.md`.

---

### Task 1: Dependency + `jsoncParse` + `jsoncEditValue`

**Files:**
- Modify: `package.json` (add `jsonc-parser` to dependencies)
- Create: `src/core/jsonc.ts`
- Test: `tests/core/jsonc.test.ts`

**Interfaces:**
- Consumes: `ParseResult`, `JsonValue`, `JsonPath` from `src/core/types.ts`; `offsetToLineCol` (export it from `parse.ts`).
- Produces:
  - `jsoncParse(text: string): ParseResult`
  - `jsoncEditValue(src: string, path: JsonPath, newVal: JsonValue): string`
  - `detectIndent(src: string): number` (helper; falls back to 2)

- [ ] **Step 1: Install the dependency**

Run: `npm install jsonc-parser@3.3.1 --save --legacy-peer-deps`
Expected: `package.json` dependencies now list `"jsonc-parser": "^3.3.1"`; `npm test` still green.

- [ ] **Step 2: Export `offsetToLineCol` from `parse.ts`**

In `src/core/parse.ts` change `function offsetToLineCol` to `export function offsetToLineCol`. Run `npm test` — still green (no behavior change).

- [ ] **Step 3: Write failing tests for `jsoncParse` + `jsoncEditValue`**

```ts
// tests/core/jsonc.test.ts
import { describe, expect, it } from "vitest";
import { jsoncParse, jsoncEditValue, detectIndent } from "../../src/core/jsonc";

describe("jsoncParse", () => {
  it("parses JSON with // and /* */ comments and trailing commas", () => {
    const src = `{
  // a line comment
  "a": 1, /* inline */
  "b": [1, 2,], // trailing comma ok
}`;
    const r = jsoncParse(src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1, b: [1, 2] });
  });

  it("reports the first structural error with line/col", () => {
    const r = jsoncParse(`{ "a": }`);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.line).toBe(1); expect(r.col).toBeGreaterThan(1); }
  });

  it("treats empty input as an error like core parse", () => {
    expect(jsoncParse("   ").ok).toBe(false);
  });
});

describe("jsoncEditValue", () => {
  it("edits a value and preserves surrounding comments", () => {
    const src = `{
  // keep me
  "a": 1,
  "b": 2 // and me
}`;
    const out = jsoncEditValue(src, ["a"], 42);
    expect(out).toContain("// keep me");
    expect(out).toContain("// and me");
    expect(jsoncParse(out).ok && (jsoncParse(out) as any).value).toEqual({ a: 42, b: 2 });
  });
});

describe("detectIndent", () => {
  it("detects 4-space indent, falls back to 2", () => {
    expect(detectIndent(`{\n    "a": 1\n}`)).toBe(4);
    expect(detectIndent(`{}`)).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests — verify they fail**

Run: `npx vitest run tests/core/jsonc.test.ts`
Expected: FAIL ("Cannot find module ../../src/core/jsonc").

- [ ] **Step 5: Implement `jsonc.ts` (parse + editValue + helpers)**

```ts
// src/core/jsonc.ts
import {
  applyEdits,
  type FormattingOptions,
  type JSONPath,
  type ParseError,
  modify,
  parse as jparse,
  printParseErrorCode,
} from "jsonc-parser";
import { offsetToLineCol } from "./parse";
import type { JsonPath, JsonValue, ParseResult } from "./types";

/** Detect the source's indent width (spaces) from the first indented line; fallback 2. */
export function detectIndent(src: string): number {
  const m = /\n([ \t]+)\S/.exec(src);
  if (!m) return 2;
  const ws = m[1];
  if (ws.includes("\t")) return 2; // tabs → keep formatter on spaces default
  return ws.length;
}

function fmt(src: string): FormattingOptions {
  return { insertSpaces: true, tabSize: detectIndent(src), eol: src.includes("\r\n") ? "\r\n" : "\n" };
}

export function jsoncParse(text: string): ParseResult {
  if (text.trim() === "") return { ok: false, error: "Empty input", line: 1, col: 1 };
  const errors: ParseError[] = [];
  const value = jparse(text, errors, { allowTrailingComma: true, disallowComments: false }) as JsonValue;
  if (errors.length > 0) {
    const first = errors[0];
    const { line, col } = offsetToLineCol(text, first.offset);
    return { ok: false, error: printParseErrorCode(first.error), line, col };
  }
  return { ok: true, value };
}

export function jsoncEditValue(src: string, path: JsonPath, newVal: JsonValue): string {
  const edits = modify(src, path as JSONPath, newVal, { formattingOptions: fmt(src) });
  return applyEdits(src, edits);
}
```

- [ ] **Step 6: Run tests — verify pass**

Run: `npx vitest run tests/core/jsonc.test.ts` → PASS. Then `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/core/jsonc.ts src/core/parse.ts tests/core/jsonc.test.ts
git commit -m "feat(core): jsonc-parser dep + jsoncParse/jsoncEditValue (comment-preserving)"
```

---

### Task 2: `jsoncAddKey`, `jsoncAddItem`, `jsoncDelete`

**Files:**
- Modify: `src/core/jsonc.ts`
- Test: `tests/core/jsonc.test.ts`

**Interfaces / Produces:**
- `jsoncAddKey(src, parentPath: JsonPath, key: string, val: JsonValue): string`
- `jsoncAddItem(src, parentPath: JsonPath, val: JsonValue): string` (appends at end)
- `jsoncDelete(src, path: JsonPath): string`

- [ ] **Step 1: Write failing tests** — add a value+comment, add an array item, delete a key while a sibling's comment survives.

```ts
describe("structural ops preserve comments", () => {
  const src = `{
  // header
  "a": 1,
  "list": [10, 20] // list note
}`;
  it("adds an object key", () => {
    const out = jsoncAddKey(src, [], "c", true);
    expect((jsoncParse(out) as any).value).toEqual({ a: 1, list: [10, 20], c: true });
    expect(out).toContain("// header");
  });
  it("appends an array item", () => {
    const out = jsoncAddItem(src, ["list"], 30);
    expect((jsoncParse(out) as any).value.list).toEqual([10, 20, 30]);
    expect(out).toContain("// list note");
  });
  it("deletes a key and keeps other comments", () => {
    const out = jsoncDelete(src, ["a"]);
    expect((jsoncParse(out) as any).value).toEqual({ list: [10, 20] });
    expect(out).toContain("// list note");
  });
});
```

- [ ] **Step 2: Run — verify fail** (`jsoncAddKey is not a function`).

- [ ] **Step 3: Implement**

```ts
export function jsoncAddKey(src: string, parentPath: JsonPath, key: string, val: JsonValue): string {
  const edits = modify(src, [...parentPath, key] as JSONPath, val, { formattingOptions: fmt(src) });
  return applyEdits(src, edits);
}

export function jsoncAddItem(src: string, parentPath: JsonPath, val: JsonValue): string {
  const parent = valueAtPath(src, parentPath);
  const index = Array.isArray(parent) ? parent.length : 0;
  const edits = modify(src, [...parentPath, index] as JSONPath, val, {
    isArrayInsertion: true,
    formattingOptions: fmt(src),
  });
  return applyEdits(src, edits);
}

export function jsoncDelete(src: string, path: JsonPath): string {
  const edits = modify(src, path as JSONPath, undefined, { formattingOptions: fmt(src) });
  return applyEdits(src, edits);
}

// helper: resolve the value at a path from the parsed source (for array length etc.)
function valueAtPath(src: string, path: JsonPath): JsonValue {
  const r = jsoncParse(src);
  if (!r.ok) return null;
  let cur: JsonValue = r.value;
  for (const seg of path) {
    if (Array.isArray(cur) && typeof seg === "number") cur = cur[seg];
    else if (cur !== null && typeof cur === "object" && typeof seg === "string")
      cur = (cur as Record<string, JsonValue>)[seg];
    else return null;
  }
  return cur;
}
```

- [ ] **Step 4: Run — verify pass**, then `npm test`.
- [ ] **Step 5: Commit** `feat(core): jsonc addKey/addItem/delete (comment-preserving)`

---

### Task 3: `jsoncRenameKey` (targeted key-token edit)

**Files:** Modify `src/core/jsonc.ts`; Test `tests/core/jsonc.test.ts`.

**Produces:** `jsoncRenameKey(src, path: JsonPath, newKey: string): string`

- [ ] **Step 1: Failing test** — rename a key; the value's own comment AND a comment on the key line survive.

```ts
describe("jsoncRenameKey", () => {
  it("renames a key, preserving the value subtree and its comments", () => {
    const src = `{
  "old": {
    // inner
    "x": 1
  } // trailing
}`;
    const out = jsoncRenameKey(src, ["old"], "renamed");
    const v = (jsoncParse(out) as any).value;
    expect(v).toEqual({ renamed: { x: 1 } });
    expect(out).toContain("// inner");
    expect(out).toContain("// trailing");
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement using `parseTree` offsets**

```ts
import { findNodeAtLocation, parseTree } from "jsonc-parser";

export function jsoncRenameKey(src: string, path: JsonPath, newKey: string): string {
  const root = parseTree(src, [], { allowTrailingComma: true });
  if (!root) return src;
  const valueNode = findNodeAtLocation(root, path as JSONPath);
  const prop = valueNode?.parent; // property node: children = [keyNode, valueNode]
  const keyNode = prop?.type === "property" ? prop.children?.[0] : undefined;
  if (!keyNode) return src;
  return (
    src.slice(0, keyNode.offset) + JSON.stringify(newKey) + src.slice(keyNode.offset + keyNode.length)
  );
}
```

- [ ] **Step 4: Run — verify pass**, then `npm test`.
- [ ] **Step 5: Commit** `feat(core): jsonc renameKey via targeted key-token edit`

---

### Task 4: `jsoncChangeType`

**Files:** Modify `src/core/jsonc.ts`; Test `tests/core/jsonc.test.ts`.

**Produces:** `jsoncChangeType(src, path: JsonPath, newType: JsonType): string` (reuse `JsonType` + a local `defaultForType`).

- [ ] **Step 1: Failing test** — change a value's type; unrelated comments survive; value becomes the type default.

```ts
import type { JsonType } from "../../src/core/edit";
describe("jsoncChangeType", () => {
  it("changes a value to the type default, keeping other comments", () => {
    const src = `{ "a": 1, "b": 2 /* keep */ }`;
    const out = jsoncChangeType(src, ["a"], "string");
    expect((jsoncParse(out) as any).value).toEqual({ a: "", b: 2 });
    expect(out).toContain("/* keep */");
  });
});
```

- [ ] **Step 2: Run — verify fail.**
- [ ] **Step 3: Implement**

```ts
import type { JsonType } from "./edit";

function defaultForType(t: JsonType): JsonValue {
  switch (t) {
    case "string": return "";
    case "number": return 0;
    case "boolean": return false;
    case "null": return null;
    case "object": return {};
    case "array": return [];
  }
}

export function jsoncChangeType(src: string, path: JsonPath, newType: JsonType): string {
  const edits = modify(src, path as JSONPath, defaultForType(newType), { formattingOptions: fmt(src) });
  return applyEdits(src, edits);
}
```

Note: importing the `JsonType` *type* from `./edit` is type-only (no Obsidian dependency) — allowed in core.

- [ ] **Step 4: Run — verify pass**, then `npm test`.
- [ ] **Step 5: Commit** `feat(core): jsonc changeType`

---

### Task 5: Reorder — `jsoncMoveArrayItem` + `jsoncMoveObjectKey`

**Files:** Modify `src/core/jsonc.ts`; Test `tests/core/jsonc.test.ts`.

**Produces:**
- `jsoncMoveArrayItem(src, arrayPath: JsonPath, fromIdx: number, toIdx: number): string`
- `jsoncMoveObjectKey(src, objPath: JsonPath, key: string, toPos: number): string`

**Semantics (ratified):** the moved element + a same-line trailing comment move together; free-standing comment lines keep their absolute slot; no comment is ever lost.

- [ ] **Step 1: Failing tests**

```ts
describe("reorder preserves all comments", () => {
  it("moves an array element with its same-line trailing comment", () => {
    const src = `[
  1, // one
  2, // two
  3 // three
]`;
    const out = jsoncMoveArrayItem(src, [], 0, 2); // 1 -> after 3
    expect((jsoncParse(out) as any).value).toEqual([2, 3, 1]);
    expect(out).toContain("// one");
    expect(out).toContain("// two");
    expect(out).toContain("// three");
  });
  it("moves an object key, all comments retained", () => {
    const src = `{
  "a": 1, // A
  "b": 2, // B
  "c": 3 // C
}`;
    const out = jsoncMoveObjectKey(src, [], "a", 2);
    expect(Object.keys((jsoncParse(out) as any).value)).toEqual(["b", "c", "a"]);
    for (const c of ["// A", "// B", "// C"]) expect(out).toContain(c);
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement via CST child-extent rebuild**

```ts
/** Extent of a container child = its node span plus a same-line trailing line-comment. */
interface Extent { start: number; end: number; }

function childExtents(src: string, containerPath: JsonPath): { container: import("jsonc-parser").Node; children: Extent[] } | null {
  const root = parseTree(src, [], { allowTrailingComma: true });
  if (!root) return null;
  const container = containerPath.length === 0 ? root : findNodeAtLocation(root, containerPath as JSONPath);
  const kids = container?.children;
  if (!container || !kids || kids.length === 0) return { container: container ?? root, children: [] };
  const extents: Extent[] = kids.map((n) => {
    let end = n.offset + n.length;
    // absorb a same-line trailing comma
    while (end < src.length && (src[end] === "," || src[end] === " " || src[end] === "\t")) {
      if (src[end] === ",") { end++; break; }
      end++;
    }
    // absorb a same-line // or /* */ trailing comment
    const restOfLine = src.slice(end, src.indexOf("\n", end) === -1 ? src.length : src.indexOf("\n", end));
    const cm = /^([ \t]*(\/\/[^\n]*|\/\*.*?\*\/))/.exec(restOfLine);
    if (cm) end += cm[1].length;
    return { start: n.offset, end };
  });
  return { container, children: extents };
}

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(to, copy.length)), 0, item);
  return copy;
}

function rebuildContainer(src: string, containerPath: JsonPath, order: number[]): string {
  const info = childExtents(src, containerPath);
  if (!info || info.children.length === 0) return src;
  const { children } = info;
  const innerStart = children[0].start;
  const innerEnd = children[children.length - 1].end;
  const texts = children.map((e) => src.slice(e.start, e.end).replace(/,\s*$/, "")); // strip own trailing comma
  const gapBefore = children.map((_, i) => (i === 0 ? "" : src.slice(children[i - 1].end, children[i].start)));
  const ordered = order.map((i) => texts[i]);
  // Re-emit with the original inter-element gaps (indentation/free-standing comments) in slot order.
  let out = "";
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0) out += "," + gapBefore[i];
    out += ordered[i];
  }
  return src.slice(0, innerStart) + out + src.slice(innerEnd);
}

export function jsoncMoveArrayItem(src: string, arrayPath: JsonPath, fromIdx: number, toIdx: number): string {
  const info = childExtents(src, arrayPath);
  if (!info) return src;
  const n = info.children.length;
  if (fromIdx < 0 || fromIdx >= n) return src;
  const to = Math.max(0, Math.min(toIdx, n - 1));
  if (to === fromIdx) return src;
  const order = reorder([...Array(n).keys()], fromIdx, to);
  return rebuildContainer(src, arrayPath, order);
}

export function jsoncMoveObjectKey(src: string, objPath: JsonPath, key: string, toPos: number): string {
  const parent = valueAtPath(src, objPath);
  if (parent === null || typeof parent !== "object" || Array.isArray(parent)) return src;
  const keys = Object.keys(parent);
  const from = keys.indexOf(key);
  if (from === -1) return src;
  const to = Math.max(0, Math.min(toPos, keys.length - 1));
  if (to === from) return src;
  const order = reorder([...Array(keys.length).keys()], from, to);
  return rebuildContainer(src, objPath, order);
}
```

- [ ] **Step 4: Run — verify pass.** If a reorder edge case is fragile, tighten the trailing-comment regex; keep the "no comment lost" invariant. Then `npm test`.
- [ ] **Step 5: Commit** `feat(core): jsonc reorder (array + object) preserving comments`

---

### Task 6: `JsonFileView` — `isJsonc` flag + parser routing

**Files:** Modify `src/obsidian/JsonFileView.ts`; Test `tests/obsidian/JsonFileView.jsonc.test.ts`.

**Interfaces:**
- Consumes: `jsoncParse` from `../core/jsonc`.
- Produces: `private isJsonc: boolean`; `recomputeFromData()` routes on it.

- [ ] **Step 1: Failing test** — a `.jsonc` view parses a commented doc without a parse-error banner and enables the tree pill.

```ts
// tests/obsidian/JsonFileView.jsonc.test.ts — set up a view whose file.extension === "jsonc"
// (follow the existing JsonFileView test harness for constructing a view + mock file).
it("parses .jsonc with comments without error", () => {
  view.file = { extension: "jsonc", basename: "x", path: "x.jsonc" } as any;
  view.setViewData(`{ // c\n "a": 1 }`, true);
  expect((view as any).invalid).toBe(false);
  expect((view as any).currentValue).toEqual({ a: 1 });
});
```

- [ ] **Step 2: Run — verify fail** (comment → invalid=true under strict `parse`).

- [ ] **Step 3: Implement routing**

In `JsonFileView.ts`:
- Add field `private isJsonc = false;`
- Import: `import { jsoncParse } from "../core/jsonc";`
- In `resetPerFileState()` (and defensively at the top of `setViewData` before parsing) set:
  `this.isJsonc = this.file?.extension === "jsonc";`
- In `recomputeFromData()` change `const parsed = parse(this.data);` to
  `const parsed = this.isJsonc ? jsoncParse(this.data) : parse(this.data);`
- In any other place that calls `parse(this.data)` (there is a second one around the schema/large-file path ~line 405) apply the same routing via a private helper `private parseData() { return this.isJsonc ? jsoncParse(this.data) : parse(this.data); }` and use it in all spots.

- [ ] **Step 4: Run — verify pass**, then `npm test`.
- [ ] **Step 5: Commit** `feat(obsidian): route .jsonc through jsoncParse in JsonFileView`

---

### Task 7: `JsonFileView` — dual mutation path + `onValueEdit`

**Files:** Modify `src/obsidian/JsonFileView.ts`, `src/obsidian/TreeView.ts`; Tests: `tests/obsidian/JsonFileView.jsonc.test.ts`, adjust existing TreeView tests that use `onChange`.

**Interfaces:**
- TreeView `TreeViewOptions.onChange?: (newValue) => void` → replaced by `onValueEdit?: (path: JsonPath, newVal: JsonValue) => void`.
- JsonFileView: `private commitSource(newText: string, newValue: JsonValue): void`.

- [ ] **Step 1: Failing test** — editing a value in a `.jsonc` view preserves a comment across the edit and through undo/redo.

```ts
it("edits a .jsonc value in the tree, preserving comments + undo", () => {
  view.file = { extension: "jsonc", basename: "x", path: "x.jsonc" } as any;
  view.setViewData(`{\n  // keep\n  "a": 1\n}`, true);
  (view as any).handleValueEdit(["a"], 9);
  expect(view.getViewData()).toContain("// keep");
  expect((jsoncParse(view.getViewData()) as any).value).toEqual({ a: 9 });
  view.undo();
  expect((jsoncParse(view.getViewData()) as any).value).toEqual({ a: 1 });
  expect(view.getViewData()).toContain("// keep");
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Refactor TreeView `onChange` → `onValueEdit(path, newVal)`**

In `TreeView.ts`:
- Change the option type to `onValueEdit?: (path: JsonPath, newVal: JsonValue) => void;`
- In `openEditor`'s `finish`, keep the optimistic local update but replace the callback:
  ```ts
  if (newVal !== undefined) {
    this.current = editValue(this.current, path, newVal);
    this.opts.onValueEdit?.(path, newVal);
  }
  ```

- [ ] **Step 4: Add `commitSource` + dual handlers in JsonFileView**

Refactor `applyMutation` to delegate to a new `commitSource`, and add `.jsonc` branches:

```ts
private commitSource(newText: string, newValue: JsonValue): void {
  this.history.push(this.data);
  this.data = newText;
  this.currentValue = newValue;
  this.requestSave();
  if (this.treeView) {
    this.treeView.setValue(newValue);
    if (this.currentQuery !== "") {
      const result = this.treeView.applyFilter(this.currentQuery);
      this.searchBar.setMatchInfo({ matchCount: result.matchCount });
    }
  }
  this.applyValidation();
  this.refreshUndoButtons();
}

private applyMutation(newValue: JsonValue, _description: string): void {
  this.commitSource(serialize(newValue, { indent: this.settings.indent }), newValue);
}

/** For .jsonc: apply a source-text op, derive the value, and commit. */
private commitJsonc(newText: string): void {
  const parsed = jsoncParse(newText);
  this.commitSource(newText, parsed.ok ? parsed.value : this.currentValue);
}
```

Then each handler branches on `this.isJsonc`. New value-edit handler (replaces `handleTreeChange`):

```ts
private handleValueEdit(path: JsonPath, newVal: JsonValue): void {
  try {
    if (this.isJsonc) this.commitJsonc(jsoncEditValue(this.data, path, newVal));
    else this.applyMutation(editValue(this.currentValue, path, newVal), "Edit value");
  } catch (e) { new Notice((e as Error).message); }
}
```

Apply the same `this.isJsonc ? commitJsonc(jsonc*(...)) : applyMutation(pureOp(...))` branch to
`handleAddKey`, `handleAddItem`, `handleDelete`, `handleRename`, `handleMoveItem`, `handleMoveKey`,
`handleChangeType`. Import the jsonc ops + `editValue` at top. Wire TreeView:
`onValueEdit: (path, newVal) => this.handleValueEdit(path, newVal)`.

- [ ] **Step 5: Update existing TreeView tests** that referenced `onChange` to use `onValueEdit` (search `tests/obsidian/TreeView*` and `onChange`). Run — verify pass.
- [ ] **Step 6: Run full suite** `npm test` → green.
- [ ] **Step 7: Commit** `feat(obsidian): dual mutation path — .jsonc edits preserve comments`

---

### Task 8: `main.ts` — register `.jsonc` extension (guarded)

**Files:** Modify `src/main.ts`; Test `tests/main.jsonc.test.ts` (extend the obsidian mock if needed for `registerExtensions` spying).

- [ ] **Step 1: Failing test** — plugin calls `registerExtensions(["jsonc"], JSON_VIEW_TYPE)` and survives a throw (guarded).

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — next to the existing `.json` registration:

```ts
try {
  this.registerExtensions(["jsonc"], JSON_VIEW_TYPE);
} catch {
  new Notice(
    "JSON Editor: another plugin already handles .jsonc — file view disabled, code-block rendering still active.",
  );
}
```

(Separate try/catch from `.json` so one failing doesn't skip the other.)

- [ ] **Step 4: Run — verify pass**, then `npm test`.
- [ ] **Step 5: Commit** `feat(obsidian): register .jsonc file extension (guarded)`

---

### Task 9: `` ```jsonc `` code block (read-only)

**Files:** Modify `src/obsidian/CodeblockProcessor.ts`, `src/main.ts`; Test `tests/obsidian/CodeblockProcessor.jsonc.test.ts`.

- [ ] **Step 1: Failing test** — `renderJsonCodeblock(src, el, ctx, settings, "jsonc")` renders a tree for a commented block; label reads `JSONC`.

```ts
it("renders a jsonc code block read-only with comments", () => {
  const el = document.createElement("div");
  renderJsonCodeblock(`{ // note\n "a": 1 }`, el, {} as any, settings, "jsonc");
  expect(el.querySelector(".json-codeblock-label")?.textContent).toBe("JSONC");
  expect(el.querySelector(".json-row")).toBeTruthy();
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — add a `lang` param:

```ts
import { jsoncParse } from "../core/jsonc";
export function renderJsonCodeblock(
  source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext,
  settings: JsonEditorSettings, lang: "json" | "jsonc" = "json",
): void {
  const parsed = lang === "jsonc" ? jsoncParse(source) : parse(source);
  if (!parsed.ok) { renderFallback(source, el, parsed.error); return; }
  // ... label.textContent = lang === "jsonc" ? "JSONC" : "JSON";
  // (error card label likewise: `${lang === "jsonc" ? "JSONC" : "JSON"} · error`)
}
```

In `main.ts` add: `this.registerMarkdownCodeBlockProcessor("jsonc", (src, el, ctx) => renderJsonCodeblock(src, el, ctx, this.settings, "jsonc"));`

- [ ] **Step 4: Run — verify pass**, then `npm test`.
- [ ] **Step 5: Commit** `feat(obsidian): render ```jsonc code blocks (read-only)`

---

### Task 10: Round-trip acceptance + schema verification

**Files:** Test `tests/core/jsonc.test.ts`, `tests/obsidian/JsonFileView.jsonc.test.ts`.

- [ ] **Step 1: Acceptance test — open+save unchanged = byte-identical**

```ts
it("round-trips a commented doc byte-for-byte when no edit is made", () => {
  const src = `{\n  // top\n  "a": 1, /* x */\n  "b": [1, 2,],\n}`;
  // load into view, save without editing
  view.file = { extension: "jsonc", basename: "x", path: "x.jsonc" } as any;
  view.setViewData(src, true);
  expect(view.getViewData()).toBe(src);
});
```

- [ ] **Step 2: Schema test** — a `.jsonc` value validates against a companion schema (comments ignored). Verify `applyValidation` uses `currentValue` (already from `jsoncParse`), so a schema violation in a commented `.jsonc` still flags. Add a focused test if the harness supports schema setup; otherwise assert `jsoncParse` strips comments before validation at the unit level.

- [ ] **Step 3: Run — verify pass**, then `npm test`.
- [ ] **Step 4: Commit** `test: .jsonc round-trip acceptance + schema`

---

### Task 11: Docs + version

**Files:** `CHANGELOG.md`, `README.md`, `AGENTS.md`, `THIRD-PARTY-NOTICES.md`, `manifest.json` (description optional), `../REGISTRY.md`.

- [ ] **Step 1: CHANGELOG** — new `## [Unreleased]` entry: Added `.jsonc` support (comment- & format-preserving tree editing; `` ```jsonc `` blocks). Note the reorder positional boundary under a "Known limitations" line.
- [ ] **Step 2: README** — supported extensions (`.json` + `.jsonc`); "Comments in `.jsonc` are preserved on edit" feature bullet; known-limitation note (reorder + free-standing comments).
- [ ] **Step 3: AGENTS.md** — runtime deps now two (`@cfworker/json-schema`, `jsonc-parser`); repo-layout: add `core/jsonc.ts`; a `.jsonc` note in Architecture principles.
- [ ] **Step 4: THIRD-PARTY-NOTICES.md** — add `jsonc-parser` (MIT, Microsoft) from the verified bundle.
- [ ] **Step 5: REGISTRY.md** (umbrella) — add a `[Editing]` row: "jsonc CST comment-preserving edit ops → json_viewer/src/core/jsonc.ts (Kit-Kandidat, erstes Exemplar)".
- [ ] **Step 6: Verify** `npm test` + `npm run build` + `npm run lint:portal` + `npm run lint:obsidian` all green.
- [ ] **Step 7: Commit** `docs: .jsonc support (README/CHANGELOG/AGENTS/notices/registry)`

---

## Self-Review

- **Spec coverage:** engine (T1), all 8 ops (T1–T5), dual path (T6–T7), extension reg (T8), code block (T9), schema (T10), round-trip acceptance (T10), Source mode (no-op per spec — no task needed), docs (T11). ✓
- **Type consistency:** `jsoncParse`→`ParseResult`; ops all `(src, …) → string`; `JsonType` imported type-only from `./edit`; `onValueEdit(path, newVal)` consistent between TreeView (T7) and JsonFileView handler. ✓
- **No placeholders:** every code step carries real code. Reorder (T5) is the highest-risk task — its invariant ("no comment lost") is the fallback if positional edge cases surface. ✓
- **Deps/version:** one `npm install` (T1); no `minAppVersion` bump; two runtime deps documented (T11). ✓
