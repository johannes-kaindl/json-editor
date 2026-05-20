# Obsidian JSON Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that opens `.json` files with a Tree↔Source toggle (Tree mode supports inline editing of primitive values; Source mode is a full CodeMirror 6 editor) and renders ```` ```json ```` code blocks inside Markdown notes as read-only trees.

**Architecture:** Layered — a pure TypeScript `core/` module (parse / serialize / edit / render, no Obsidian imports, Vitest-tested) consumed by two Obsidian adapters: a `JsonFileView` (extends `TextFileView`) for `.json` files and a `MarkdownCodeBlockProcessor` for in-note JSON blocks. Source mode uses Obsidian's bundled CodeMirror 6 with `@codemirror/lang-json`.

**Tech Stack:** TypeScript 5, Obsidian Plugin API, CodeMirror 6, esbuild (bundler), Vitest (tests), Node 20+.

**Spec reference:** `docs/superpowers/specs/2026-05-20-obsidian-json-editor-design.md`

**Commit convention:** Every commit should include the Co-Authored-By trailer per repo convention; the `commit-commands:commit` skill handles this automatically. If committing by hand, append:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## File Structure (locked-in decomposition)

```
src/
├── main.ts                       — Plugin entry; registers view, postprocessor, settings
├── core/
│   ├── types.ts                  — JsonValue, JsonPath, ParseResult
│   ├── parse.ts                  — parse(text) → ParseResult
│   ├── serialize.ts              — serialize(value, opts) → string
│   ├── edit.ts                   — editValue(value, path, newVal) → JsonValue (immutable)
│   └── render.ts                 — renderTree(value, opts) → HTMLElement
└── obsidian/
    ├── TreeView.ts               — Wraps core/render + wires Obsidian-side events
    ├── SourceView.ts             — CM6 wrapper (lang-json, theme glue)
    ├── JsonFileView.ts           — extends TextFileView; mode toggle
    ├── CodeblockProcessor.ts     — MarkdownPostProcessor for ```json
    └── SettingsTab.ts            — Default mode / indent / marker style / auto-collapse

src/__mocks__/
└── obsidian.ts                   — Vitest mock for Obsidian API (used in adapter tests)

tests/
├── core/
│   ├── parse.test.ts
│   ├── serialize.test.ts
│   ├── edit.test.ts
│   └── render.test.ts
└── obsidian/
    ├── TreeView.test.ts
    ├── SourceView.test.ts
    ├── JsonFileView.test.ts
    ├── CodeblockProcessor.test.ts
    └── SettingsTab.test.ts

manifest.json                     — Obsidian plugin manifest
styles.css                        — Obsidian-CSS-variable-based plugin styles
package.json
tsconfig.json
esbuild.config.mjs
vitest.config.ts
README.md
```

**Boundaries:**
- `core/` has zero Obsidian imports — pure functions.
- `obsidian/` imports `core/` and Obsidian's API. Adapter tests use the mock.
- `core/render.ts` returns DOM nodes but no global state; callbacks supplied by the caller carry Obsidian-side intent.

---

## Task 0: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `vitest.config.ts`
- Create: `manifest.json`
- Create: `src/main.ts` (stub)
- Create: `src/__mocks__/obsidian.ts` (minimal stub)

- [ ] **Step 0.1: Write `package.json`**

```json
{
  "name": "obsidian-json-editor",
  "version": "0.1.0",
  "description": "View and edit JSON files in Obsidian with a Tree↔Source toggle.",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["obsidian", "json", "editor", "plugin"],
  "license": "GPL-3.0",
  "devDependencies": {
    "@codemirror/lang-json": "^6.0.1",
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.26.3",
    "@types/node": "^20.12.0",
    "builtin-modules": "^4.0.0",
    "esbuild": "^0.21.0",
    "happy-dom": "^14.10.0",
    "obsidian": "^1.4.16",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 0.2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["DOM", "ES2020"],
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "obsidian": ["./src/__mocks__/obsidian.ts"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Note: the `paths` mapping is only used by tests via Vitest's resolver. For the esbuild plugin build, `obsidian` is an external — see Step 0.3.

- [ ] **Step 0.3: Write `esbuild.config.mjs`**

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  banner: { js: "/* obsidian-json-editor — built with esbuild */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
```

Note: `@codemirror/lang-json` is bundled (not external) so the plugin ships its own JSON language extension. All other CM6 packages are external because Obsidian provides them.

Add `@codemirror/lang-json` to the bundle by NOT listing it in `external`. (Already done — it's omitted from the list above.)

- [ ] **Step 0.4: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "src/__mocks__/obsidian.ts"),
    },
  },
});
```

- [ ] **Step 0.5: Write `manifest.json`**

```json
{
  "id": "obsidian-json-editor",
  "name": "JSON Editor",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "View and edit JSON files in Obsidian with a Tree↔Source toggle. Renders ```json code blocks in notes.",
  "author": "Johannes Kaindl",
  "isDesktopOnly": false
}
```

- [ ] **Step 0.6: Write minimal `src/__mocks__/obsidian.ts`**

```typescript
// Vitest mock for Obsidian. Filled in incrementally as adapter tests require members.

export class Plugin {
  app: App;
  manifest: PluginManifest;
  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }
  registerView(_type: string, _factory: (leaf: WorkspaceLeaf) => unknown) {}
  registerMarkdownCodeBlockProcessor(
    _lang: string,
    _handler: (src: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
  ) {}
  addSettingTab(_tab: PluginSettingTab) {}
  loadData(): Promise<unknown> {
    return Promise.resolve(null);
  }
  saveData(_data: unknown): Promise<void> {
    return Promise.resolve();
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
  display() {}
  hide() {}
}

export class TextFileView {
  app: App;
  data: string = "";
  contentEl: HTMLElement;
  constructor(public leaf: WorkspaceLeaf) {
    this.app = (leaf as unknown as { app: App }).app;
    this.contentEl = document.createElement("div");
  }
  getViewData(): string {
    return this.data;
  }
  setViewData(data: string, _clear: boolean): void {
    this.data = data;
  }
  clear(): void {
    this.data = "";
  }
  requestSave(): void {}
  getViewType(): string {
    return "";
  }
}

export class Setting {
  settingEl: HTMLElement;
  constructor(public containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    containerEl.appendChild(this.settingEl);
  }
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addText(cb: (text: TextComponent) => void): this {
    cb(new TextComponent());
    return this;
  }
  addDropdown(cb: (dd: DropdownComponent) => void): this {
    cb(new DropdownComponent());
    return this;
  }
  addToggle(cb: (t: ToggleComponent) => void): this {
    cb(new ToggleComponent());
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement = document.createElement("input");
  setValue(v: string): this { this.inputEl.value = v; return this; }
  onChange(_cb: (v: string) => void): this { return this; }
}
export class DropdownComponent {
  selectEl: HTMLSelectElement = document.createElement("select");
  addOption(_value: string, _display: string): this { return this; }
  setValue(_v: string): this { return this; }
  onChange(_cb: (v: string) => void): this { return this; }
}
export class ToggleComponent {
  toggleEl: HTMLElement = document.createElement("div");
  setValue(_v: boolean): this { return this; }
  onChange(_cb: (v: boolean) => void): this { return this; }
}

export interface WorkspaceLeaf { app: App; }
export interface App {}
export interface PluginManifest { id: string; name: string; version: string; }
export interface MarkdownPostProcessorContext {
  sourcePath: string;
  getSectionInfo(el: HTMLElement): { lineStart: number; lineEnd: number; text: string } | null;
}
```

- [ ] **Step 0.7: Write stub `src/main.ts`**

```typescript
import { Plugin } from "obsidian";

export default class JsonEditorPlugin extends Plugin {
  async onload() {
    // Implementation added in Task 12.
  }
  onunload() {}
}
```

- [ ] **Step 0.8: Install dependencies**

Run: `npm install`
Expected: dependencies installed, no errors.

- [ ] **Step 0.9: Verify TypeScript compiles**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: exits with code 0, no output.

- [ ] **Step 0.10: Verify Vitest runs (no tests yet)**

Run: `npm test`
Expected: "No test files found, exiting with code 0" (or similar). Vitest may exit with code 1 if it considers "no tests" a failure; in that case, this is acceptable for now and verified by the next task.

- [ ] **Step 0.11: Commit**

```bash
git add package.json tsconfig.json esbuild.config.mjs vitest.config.ts manifest.json src/main.ts src/__mocks__/obsidian.ts
git commit -m "chore: initialize Obsidian plugin scaffold with TypeScript, esbuild, Vitest"
```

---

## Task 1: `core/types.ts` — shared type definitions

**Files:**
- Create: `src/core/types.ts`

No tests for this task — types only, exercised by downstream tests.

- [ ] **Step 1.1: Write `src/core/types.ts`**

```typescript
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonPath = (string | number)[];

export type ParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: string; line: number; col: number };

export type MarkerStyle = "modern" | "classic";

export interface RenderOptions {
  readonly?: boolean;
  markerStyle?: MarkerStyle;
  autoCollapseDepth?: number;
  onValueClick?: (path: JsonPath, currentValue: JsonValue) => void;
  onCollapse?: (path: JsonPath, collapsed: boolean) => void;
}

export interface SerializeOptions {
  indent: number | "\t";
}
```

- [ ] **Step 1.2: Verify TypeScript compiles**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: exits with code 0.

- [ ] **Step 1.3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(core): add JsonValue, JsonPath, ParseResult, and option types"
```

---

## Task 2: `core/parse.ts` — JSON parsing with line/col errors

**Files:**
- Create: `tests/core/parse.test.ts`
- Create: `src/core/parse.ts`

- [ ] **Step 2.1: Write failing tests**

`tests/core/parse.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/parse";

describe("parse", () => {
  it("parses primitives", () => {
    expect(parse("null")).toEqual({ ok: true, value: null });
    expect(parse("true")).toEqual({ ok: true, value: true });
    expect(parse("false")).toEqual({ ok: true, value: false });
    expect(parse("42")).toEqual({ ok: true, value: 42 });
    expect(parse('"hello"')).toEqual({ ok: true, value: "hello" });
  });

  it("parses arrays", () => {
    expect(parse("[1, 2, 3]")).toEqual({ ok: true, value: [1, 2, 3] });
    expect(parse("[]")).toEqual({ ok: true, value: [] });
  });

  it("parses objects", () => {
    expect(parse('{"a": 1, "b": true}')).toEqual({
      ok: true,
      value: { a: 1, b: true },
    });
    expect(parse("{}")).toEqual({ ok: true, value: {} });
  });

  it("parses nested structures", () => {
    const text = '{"users": [{"name": "jay", "active": true}]}';
    expect(parse(text)).toEqual({
      ok: true,
      value: { users: [{ name: "jay", active: true }] },
    });
  });

  it("reports error with line and column for malformed JSON", () => {
    const result = parse('{"a": 1,\n"b": }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.line).toBe(2);
      expect(result.col).toBeGreaterThan(0);
      expect(result.error).toMatch(/./);
    }
  });

  it("reports error at line 1 for single-line failures", () => {
    const result = parse("{not valid}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.line).toBe(1);
    }
  });

  it("handles empty input as error", () => {
    const result = parse("");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run tests/core/parse.test.ts`
Expected: tests fail with "Cannot find module '../../src/core/parse'" or similar.

- [ ] **Step 2.3: Implement `src/core/parse.ts`**

```typescript
import type { JsonValue, ParseResult } from "./types";

export function parse(text: string): ParseResult {
  if (text.trim() === "") {
    return { ok: false, error: "Empty input", line: 1, col: 1 };
  }
  try {
    const value = JSON.parse(text) as JsonValue;
    return { ok: true, value };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const { line, col } = extractPosition(text, message);
    return { ok: false, error: message, line, col };
  }
}

function extractPosition(text: string, message: string): { line: number; col: number } {
  // Node's JSON.parse error messages include "position N" (V8) or
  // "line N column M" depending on engine/version. Try both.
  const posMatch = /position\s+(\d+)/i.exec(message);
  if (posMatch) {
    const offset = parseInt(posMatch[1], 10);
    return offsetToLineCol(text, offset);
  }
  const lineColMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
  if (lineColMatch) {
    return { line: parseInt(lineColMatch[1], 10), col: parseInt(lineColMatch[2], 10) };
  }
  return { line: 1, col: 1 };
}

function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run tests/core/parse.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/core/parse.ts tests/core/parse.test.ts
git commit -m "feat(core): add parse() with line/column error positions"
```

---

## Task 3: `core/serialize.ts` — JSON serialization with indent options

**Files:**
- Create: `tests/core/serialize.test.ts`
- Create: `src/core/serialize.ts`

- [ ] **Step 3.1: Write failing tests**

`tests/core/serialize.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { serialize } from "../../src/core/serialize";
import { parse } from "../../src/core/parse";

describe("serialize", () => {
  it("serializes primitives with no indent (indent: 0)", () => {
    expect(serialize(null, { indent: 0 })).toBe("null");
    expect(serialize(true, { indent: 0 })).toBe("true");
    expect(serialize(42, { indent: 0 })).toBe("42");
    expect(serialize("hello", { indent: 0 })).toBe('"hello"');
  });

  it("serializes objects with 2-space indent", () => {
    const result = serialize({ a: 1, b: true }, { indent: 2 });
    expect(result).toBe('{\n  "a": 1,\n  "b": true\n}');
  });

  it("serializes objects with 4-space indent", () => {
    const result = serialize({ a: 1 }, { indent: 4 });
    expect(result).toBe('{\n    "a": 1\n}');
  });

  it("serializes objects with tab indent", () => {
    const result = serialize({ a: 1 }, { indent: "\t" });
    expect(result).toBe('{\n\t"a": 1\n}');
  });

  it("serializes nested structures", () => {
    const value = { users: [{ name: "jay" }] };
    const result = serialize(value, { indent: 2 });
    expect(result).toBe(
      '{\n  "users": [\n    {\n      "name": "jay"\n    }\n  ]\n}'
    );
  });

  it("round-trips: parse then serialize yields equivalent JSON", () => {
    const original = '{"a":1,"b":[true,null,"x"]}';
    const parsed = parse(original);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const back = serialize(parsed.value, { indent: 0 });
      expect(JSON.parse(back)).toEqual(JSON.parse(original));
    }
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run tests/core/serialize.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 3.3: Implement `src/core/serialize.ts`**

```typescript
import type { JsonValue, SerializeOptions } from "./types";

export function serialize(value: JsonValue, opts: SerializeOptions): string {
  const indent = opts.indent;
  if (indent === 0) {
    return JSON.stringify(value);
  }
  return JSON.stringify(value, null, indent);
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run tests/core/serialize.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/core/serialize.ts tests/core/serialize.test.ts
git commit -m "feat(core): add serialize() with indent options"
```

---

## Task 4: `core/edit.ts` — immutable value editing by path

**Files:**
- Create: `tests/core/edit.test.ts`
- Create: `src/core/edit.ts`

- [ ] **Step 4.1: Write failing tests**

`tests/core/edit.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { editValue } from "../../src/core/edit";

describe("editValue", () => {
  it("edits a top-level scalar by empty path", () => {
    expect(editValue("old", [], "new")).toBe("new");
  });

  it("edits a value in an object", () => {
    const original = { a: 1, b: 2 };
    const result = editValue(original, ["a"], 99);
    expect(result).toEqual({ a: 99, b: 2 });
  });

  it("does not mutate the original object", () => {
    const original = { a: 1, b: 2 };
    editValue(original, ["a"], 99);
    expect(original).toEqual({ a: 1, b: 2 });
  });

  it("edits a value in an array by numeric index", () => {
    const original = [1, 2, 3];
    const result = editValue(original, [1], 99);
    expect(result).toEqual([1, 99, 3]);
  });

  it("does not mutate the original array", () => {
    const original = [1, 2, 3];
    editValue(original, [1], 99);
    expect(original).toEqual([1, 2, 3]);
  });

  it("edits a nested value", () => {
    const original = { users: [{ name: "jay" }, { name: "alex" }] };
    const result = editValue(original, ["users", 1, "name"], "sam");
    expect(result).toEqual({ users: [{ name: "jay" }, { name: "sam" }] });
  });

  it("does not mutate the original nested structure", () => {
    const original = { users: [{ name: "jay" }] };
    const result = editValue(original, ["users", 0, "name"], "sam");
    expect(original.users[0].name).toBe("jay");
    expect(result).not.toBe(original);
  });

  it("throws on invalid path (key on non-object)", () => {
    expect(() => editValue(42, ["a"], 1)).toThrow();
  });

  it("throws on invalid path (index on non-array)", () => {
    expect(() => editValue({ a: 1 }, [0], 1)).toThrow();
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run tests/core/edit.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 4.3: Implement `src/core/edit.ts`**

```typescript
import type { JsonValue, JsonPath } from "./types";

export function editValue(value: JsonValue, path: JsonPath, newVal: JsonValue): JsonValue {
  if (path.length === 0) {
    return newVal;
  }
  const [head, ...rest] = path;

  if (Array.isArray(value)) {
    if (typeof head !== "number") {
      throw new Error(`Expected numeric index at array, got ${typeof head}`);
    }
    const copy = value.slice();
    copy[head] = editValue(value[head], rest, newVal);
    return copy;
  }

  if (value !== null && typeof value === "object") {
    if (typeof head !== "string") {
      throw new Error(`Expected string key at object, got ${typeof head}`);
    }
    const obj = value as { [k: string]: JsonValue };
    return { ...obj, [head]: editValue(obj[head], rest, newVal) };
  }

  throw new Error(`Cannot descend into ${typeof value} at path segment ${String(head)}`);
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run tests/core/edit.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/core/edit.ts tests/core/edit.test.ts
git commit -m "feat(core): add editValue() with path-based immutable updates"
```

---

## Task 5: `core/render.ts` — DOM tree rendering

**Files:**
- Create: `tests/core/render.test.ts`
- Create: `src/core/render.ts`

- [ ] **Step 5.1: Write failing tests**

`tests/core/render.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { renderTree } from "../../src/core/render";

describe("renderTree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns an HTMLElement", () => {
    const el = renderTree({ a: 1 }, {});
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("renders a string primitive with the json-string class", () => {
    const el = renderTree("hello", {});
    expect(el.querySelector(".json-string")).not.toBeNull();
    expect(el.textContent).toContain("hello");
  });

  it("renders a number primitive with the json-number class", () => {
    const el = renderTree(42, {});
    expect(el.querySelector(".json-number")).not.toBeNull();
    expect(el.textContent).toContain("42");
  });

  it("renders a boolean with the json-boolean class", () => {
    const el = renderTree(true, {});
    expect(el.querySelector(".json-boolean")).not.toBeNull();
    expect(el.textContent).toContain("true");
  });

  it("renders null with the json-null class", () => {
    const el = renderTree(null, {});
    expect(el.querySelector(".json-null")).not.toBeNull();
    expect(el.textContent).toContain("null");
  });

  it("renders object keys with the json-key class", () => {
    const el = renderTree({ name: "jay" }, {});
    const keyEl = el.querySelector(".json-key");
    expect(keyEl).not.toBeNull();
    expect(keyEl?.textContent).toContain("name");
  });

  it("renders nested objects with one container per level", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    const containers = el.querySelectorAll(".json-container");
    expect(containers.length).toBeGreaterThanOrEqual(2);
  });

  it("renders arrays with index labels", () => {
    const el = renderTree([10, 20], {});
    expect(el.textContent).toContain("10");
    expect(el.textContent).toContain("20");
  });

  it("calls onValueClick with path and current value when a value is clicked", () => {
    const calls: Array<{ path: (string | number)[]; value: unknown }> = [];
    const el = renderTree(
      { name: "jay" },
      {
        onValueClick: (path, value) => calls.push({ path, value }),
      }
    );
    document.body.appendChild(el);
    const valueEl = el.querySelector(".json-string") as HTMLElement;
    valueEl.click();
    expect(calls).toEqual([{ path: ["name"], value: "jay" }]);
  });

  it("does NOT bind value-click handlers when readonly: true", () => {
    const calls: number[] = [];
    const el = renderTree(
      { name: "jay" },
      {
        readonly: true,
        onValueClick: () => calls.push(1),
      }
    );
    document.body.appendChild(el);
    const valueEl = el.querySelector(".json-string") as HTMLElement;
    valueEl.click();
    expect(calls).toEqual([]);
  });

  it("collapses nodes deeper than autoCollapseDepth", () => {
    const el = renderTree({ a: { b: { c: 1 } } }, { autoCollapseDepth: 1 });
    // Depth 0 (root) and depth 1 (a) are expanded; depth 2 (b) starts collapsed.
    const collapsedContainers = el.querySelectorAll(".json-content.collapsed");
    expect(collapsedContainers.length).toBeGreaterThanOrEqual(1);
  });

  it("renders classic markers when markerStyle: 'classic'", () => {
    const el = renderTree({ a: 1, b: 2 }, { markerStyle: "classic" });
    const markers = el.querySelectorAll(".json-marker");
    expect(markers.length).toBeGreaterThan(0);
    const text = Array.from(markers).map((m) => m.textContent).join("");
    expect(text).toMatch(/[┐├┘]/);
  });

  it("does NOT render markers when markerStyle: 'modern' (default)", () => {
    const el = renderTree({ a: 1, b: 2 }, { markerStyle: "modern" });
    const markers = el.querySelectorAll(".json-marker");
    expect(markers.length).toBe(0);
  });

  it("toggles collapse state when disclosure triangle is clicked", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    document.body.appendChild(el);
    const toggle = el.querySelector(".json-collapse-toggle") as HTMLElement;
    const content = toggle.parentElement?.querySelector(".json-content") as HTMLElement;
    expect(content.classList.contains("collapsed")).toBe(false);
    toggle.click();
    expect(content.classList.contains("collapsed")).toBe(true);
    toggle.click();
    expect(content.classList.contains("collapsed")).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npx vitest run tests/core/render.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 5.3: Implement `src/core/render.ts`**

```typescript
import type { JsonValue, JsonPath, RenderOptions } from "./types";

export function renderTree(value: JsonValue, opts: RenderOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "json-tree-root";
  renderValue(root, value, [], 0, opts);
  return root;
}

function renderValue(
  parent: HTMLElement,
  value: JsonValue,
  path: JsonPath,
  depth: number,
  opts: RenderOptions
): void {
  if (value === null) {
    parent.appendChild(makePrimitive("null", "json-null", path, value, opts));
    return;
  }
  if (typeof value === "boolean") {
    parent.appendChild(makePrimitive(String(value), "json-boolean", path, value, opts));
    return;
  }
  if (typeof value === "number") {
    parent.appendChild(makePrimitive(String(value), "json-number", path, value, opts));
    return;
  }
  if (typeof value === "string") {
    parent.appendChild(makePrimitive(`"${value}"`, "json-string", path, value, opts));
    return;
  }
  if (Array.isArray(value)) {
    renderArray(parent, value, path, depth, opts);
    return;
  }
  renderObject(parent, value as { [k: string]: JsonValue }, path, depth, opts);
}

function makePrimitive(
  text: string,
  cls: string,
  path: JsonPath,
  value: JsonValue,
  opts: RenderOptions
): HTMLElement {
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text;
  if (!opts.readonly && opts.onValueClick && value !== null) {
    span.classList.add("json-editable");
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onValueClick?.(path, value);
    });
  }
  return span;
}

function renderObject(
  parent: HTMLElement,
  obj: { [k: string]: JsonValue },
  path: JsonPath,
  depth: number,
  opts: RenderOptions
): void {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    const span = document.createElement("span");
    span.className = "json-bracket";
    span.textContent = "{}";
    parent.appendChild(span);
    return;
  }
  const container = document.createElement("div");
  container.className = "json-container";

  const header = document.createElement("span");
  header.className = "json-header";
  const toggle = document.createElement("span");
  toggle.className = "json-collapse-toggle";
  toggle.textContent = "▼";
  header.appendChild(toggle);
  header.appendChild(document.createTextNode("{"));
  container.appendChild(header);

  const content = document.createElement("div");
  content.className = "json-content";
  const shouldCollapse =
    opts.autoCollapseDepth !== undefined && depth >= opts.autoCollapseDepth;
  if (shouldCollapse) content.classList.add("collapsed");
  if (shouldCollapse) toggle.textContent = "▶";

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = content.classList.toggle("collapsed");
    toggle.textContent = collapsed ? "▶" : "▼";
    opts.onCollapse?.(path, collapsed);
  });

  entries.forEach(([key, v], i) => {
    const row = document.createElement("div");
    row.className = "json-row";
    if (opts.markerStyle === "classic") {
      const marker = document.createElement("span");
      marker.className = "json-marker";
      marker.textContent = markerFor(i, entries.length);
      row.appendChild(marker);
    }
    const keyEl = document.createElement("span");
    keyEl.className = "json-key";
    keyEl.textContent = `"${key}"`;
    row.appendChild(keyEl);
    row.appendChild(document.createTextNode(": "));
    renderValue(row, v, [...path, key], depth + 1, opts);
    if (i < entries.length - 1) row.appendChild(document.createTextNode(","));
    content.appendChild(row);
  });

  container.appendChild(content);
  const closeBracket = document.createElement("span");
  closeBracket.className = "json-bracket";
  closeBracket.textContent = "}";
  container.appendChild(closeBracket);
  parent.appendChild(container);
}

function renderArray(
  parent: HTMLElement,
  arr: JsonValue[],
  path: JsonPath,
  depth: number,
  opts: RenderOptions
): void {
  if (arr.length === 0) {
    const span = document.createElement("span");
    span.className = "json-bracket";
    span.textContent = "[]";
    parent.appendChild(span);
    return;
  }
  const container = document.createElement("div");
  container.className = "json-container";

  const header = document.createElement("span");
  header.className = "json-header";
  const toggle = document.createElement("span");
  toggle.className = "json-collapse-toggle";
  toggle.textContent = "▼";
  header.appendChild(toggle);
  header.appendChild(document.createTextNode("["));
  container.appendChild(header);

  const content = document.createElement("div");
  content.className = "json-content";
  const shouldCollapse =
    opts.autoCollapseDepth !== undefined && depth >= opts.autoCollapseDepth;
  if (shouldCollapse) content.classList.add("collapsed");
  if (shouldCollapse) toggle.textContent = "▶";

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = content.classList.toggle("collapsed");
    toggle.textContent = collapsed ? "▶" : "▼";
    opts.onCollapse?.(path, collapsed);
  });

  arr.forEach((v, i) => {
    const row = document.createElement("div");
    row.className = "json-row";
    if (opts.markerStyle === "classic") {
      const marker = document.createElement("span");
      marker.className = "json-marker";
      marker.textContent = markerFor(i, arr.length);
      row.appendChild(marker);
    }
    const idx = document.createElement("span");
    idx.className = "json-index";
    idx.textContent = String(i);
    row.appendChild(idx);
    row.appendChild(document.createTextNode(": "));
    renderValue(row, v, [...path, i], depth + 1, opts);
    if (i < arr.length - 1) row.appendChild(document.createTextNode(","));
    content.appendChild(row);
  });

  container.appendChild(content);
  const closeBracket = document.createElement("span");
  closeBracket.className = "json-bracket";
  closeBracket.textContent = "]";
  container.appendChild(closeBracket);
  parent.appendChild(container);
}

function markerFor(index: number, length: number): string {
  if (length === 1) return "─";
  if (index === 0) return "┐";
  if (index === length - 1) return "┘";
  return "├";
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npx vitest run tests/core/render.test.ts`
Expected: all 13 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/core/render.ts tests/core/render.test.ts
git commit -m "feat(core): add renderTree() with collapse, markers, value-click events"
```

---

## Task 6: Expand `__mocks__/obsidian.ts` for adapter tests

**Files:**
- Modify: `src/__mocks__/obsidian.ts`

This task adds members needed by adapter tests in Tasks 7–11. The stub from Task 0 covered the immediately-needed surface; this adds `Notice`, `MarkdownView`, helper constructors, and tightens types.

- [ ] **Step 6.1: Replace `src/__mocks__/obsidian.ts` with the expanded version**

```typescript
// Vitest mock for Obsidian. Implements the subset of the API used by adapters
// and their tests. Mirrors the public shapes from obsidian.d.ts; behavior is
// minimal but observable.

export interface App {}
export interface WorkspaceLeaf { app: App }
export interface PluginManifest { id: string; name: string; version: string }
export interface MarkdownPostProcessorContext {
  sourcePath: string;
  getSectionInfo(el: HTMLElement): { lineStart: number; lineEnd: number; text: string } | null;
}

export class Plugin {
  app: App;
  manifest: PluginManifest;
  views: Record<string, (leaf: WorkspaceLeaf) => unknown> = {};
  postprocessors: Record<string, Function> = {};
  settingTabs: PluginSettingTab[] = [];
  storedData: unknown = null;
  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }
  registerView(type: string, factory: (leaf: WorkspaceLeaf) => unknown) {
    this.views[type] = factory;
  }
  registerMarkdownCodeBlockProcessor(
    lang: string,
    handler: (src: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
  ) {
    this.postprocessors[lang] = handler;
  }
  addSettingTab(tab: PluginSettingTab) {
    this.settingTabs.push(tab);
  }
  loadData(): Promise<unknown> {
    return Promise.resolve(this.storedData);
  }
  saveData(data: unknown): Promise<void> {
    this.storedData = data;
    return Promise.resolve();
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
  display() {}
  hide() {}
}

export class TextFileView {
  app: App;
  data: string = "";
  contentEl: HTMLElement;
  saveCount = 0;
  constructor(public leaf: WorkspaceLeaf) {
    this.app = (leaf as unknown as { app: App }).app;
    this.contentEl = document.createElement("div");
  }
  getViewData(): string {
    return this.data;
  }
  setViewData(data: string, _clear: boolean): void {
    this.data = data;
  }
  clear(): void {
    this.data = "";
  }
  requestSave(): void {
    this.saveCount += 1;
  }
  getViewType(): string {
    return "";
  }
}

export class Notice {
  constructor(public message: string, public timeout?: number) {}
}

export class Setting {
  settingEl: HTMLElement;
  nameValue = "";
  descValue = "";
  constructor(public containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    containerEl.appendChild(this.settingEl);
  }
  setName(name: string): this { this.nameValue = name; return this; }
  setDesc(desc: string): this { this.descValue = desc; return this; }
  addText(cb: (text: TextComponent) => void): this {
    const c = new TextComponent();
    this.settingEl.appendChild(c.inputEl);
    cb(c);
    return this;
  }
  addDropdown(cb: (dd: DropdownComponent) => void): this {
    const c = new DropdownComponent();
    this.settingEl.appendChild(c.selectEl);
    cb(c);
    return this;
  }
  addToggle(cb: (t: ToggleComponent) => void): this {
    const c = new ToggleComponent();
    this.settingEl.appendChild(c.toggleEl);
    cb(c);
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement = document.createElement("input");
  changeHandlers: Array<(v: string) => void> = [];
  setValue(v: string): this { this.inputEl.value = v; return this; }
  onChange(cb: (v: string) => void): this { this.changeHandlers.push(cb); return this; }
}
export class DropdownComponent {
  selectEl: HTMLSelectElement = document.createElement("select");
  changeHandlers: Array<(v: string) => void> = [];
  addOption(value: string, display: string): this {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = display;
    this.selectEl.appendChild(opt);
    return this;
  }
  setValue(v: string): this { this.selectEl.value = v; return this; }
  onChange(cb: (v: string) => void): this {
    this.changeHandlers.push(cb);
    this.selectEl.addEventListener("change", () => cb(this.selectEl.value));
    return this;
  }
}
export class ToggleComponent {
  toggleEl: HTMLElement = document.createElement("div");
  value = false;
  changeHandlers: Array<(v: boolean) => void> = [];
  setValue(v: boolean): this { this.value = v; return this; }
  onChange(cb: (v: boolean) => void): this { this.changeHandlers.push(cb); return this; }
}
```

- [ ] **Step 6.2: Run existing tests to verify nothing regressed**

Run: `npm test`
Expected: all core tests still pass.

- [ ] **Step 6.3: Commit**

```bash
git add src/__mocks__/obsidian.ts
git commit -m "test: expand Obsidian mock with Notice, Setting components, and behaviour"
```

---

## Task 7: `obsidian/TreeView.ts` — adapter for tree rendering and inline edits

**Files:**
- Create: `tests/obsidian/TreeView.test.ts`
- Create: `src/obsidian/TreeView.ts`

The TreeView wraps `core/render` and handles the inline-edit lifecycle: showing a typed input on click, applying the edit via `core/edit`, and emitting the updated full JSON value through a callback.

- [ ] **Step 7.1: Write failing tests**

`tests/obsidian/TreeView.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

describe("TreeView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders into its container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { markerStyle: "modern" });
    view.setValue({ a: 1 });
    expect(container.querySelector(".json-tree-root")).not.toBeNull();
  });

  it("opens a text input when a string value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("jay");
  });

  it("opens a number input when a number value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ n: 42 });
    const value = container.querySelector(".json-number") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='number']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("42");
  });

  it("opens a checkbox when a boolean value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ b: true });
    const value = container.querySelector(".json-boolean") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.checked).toBe(true);
  });

  it("does not open an editor when a null value is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ x: null });
    const value = container.querySelector(".json-null") as HTMLElement;
    value.click();
    expect(container.querySelector("input")).toBeNull();
  });

  it("emits onChange with the edited value when Enter is pressed on a text input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: unknown[] = [];
    const view = new TreeView(container, { onChange: (v) => changes.push(v) });
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(changes).toEqual([{ name: "sam" }]);
  });

  it("cancels edit on Escape without firing onChange", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: unknown[] = [];
    const view = new TreeView(container, { onChange: (v) => changes.push(v) });
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(changes).toEqual([]);
  });

  it("does not open an editor when readonly: true", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { readonly: true });
    view.setValue({ name: "jay" });
    const value = container.querySelector(".json-string") as HTMLElement;
    value.click();
    expect(container.querySelector("input")).toBeNull();
  });
});
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `npx vitest run tests/obsidian/TreeView.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 7.3: Implement `src/obsidian/TreeView.ts`**

```typescript
import type { JsonValue, JsonPath, MarkerStyle } from "../core/types";
import { renderTree } from "../core/render";
import { editValue } from "../core/edit";

export interface TreeViewOptions {
  readonly?: boolean;
  markerStyle?: MarkerStyle;
  autoCollapseDepth?: number;
  onChange?: (newValue: JsonValue) => void;
}

export class TreeView {
  private current: JsonValue = null;
  constructor(private container: HTMLElement, private opts: TreeViewOptions) {}

  setValue(value: JsonValue): void {
    this.current = value;
    this.render();
  }

  getValue(): JsonValue {
    return this.current;
  }

  private render(): void {
    this.container.empty?.();
    this.container.innerHTML = "";
    const el = renderTree(this.current, {
      readonly: this.opts.readonly,
      markerStyle: this.opts.markerStyle ?? "modern",
      autoCollapseDepth: this.opts.autoCollapseDepth,
      onValueClick: (path, value) => this.openEditor(path, value),
    });
    this.container.appendChild(el);
  }

  private openEditor(path: JsonPath, value: JsonValue): void {
    if (this.opts.readonly) return;
    if (value === null) return;
    const valueEl = this.findElementForPath(path);
    if (!valueEl) return;

    const finish = (newVal: JsonValue | undefined) => {
      if (newVal !== undefined) {
        const updated = editValue(this.current, path, newVal);
        this.current = updated;
        this.opts.onChange?.(updated);
      }
      this.render();
    };

    if (typeof value === "string") {
      replaceWithInput(valueEl, "text", value, (raw, committed) => {
        finish(committed ? raw : undefined);
      });
    } else if (typeof value === "number") {
      replaceWithInput(valueEl, "number", String(value), (raw, committed) => {
        if (!committed) return finish(undefined);
        const n = Number(raw);
        finish(Number.isFinite(n) ? n : undefined);
      });
    } else if (typeof value === "boolean") {
      replaceWithCheckbox(valueEl, value, (newVal, committed) => {
        finish(committed ? newVal : undefined);
      });
    }
  }

  private findElementForPath(path: JsonPath): HTMLElement | null {
    // We re-render after each edit, so finding the clicked element by query is
    // fine: the active edit always targets exactly one primitive element. We
    // locate it by traversing siblings down the rendered DOM. For v1.0 we use a
    // simpler approach: only one editor is open at a time, and the click event
    // already handed us the target via the value class. We rely on the freshly
    // rendered DOM by finding the most recent value of that path.
    let el: HTMLElement | null = this.container.querySelector(".json-tree-root");
    if (!el) return null;
    let current: HTMLElement | null = el;
    for (const seg of path) {
      if (!current) return null;
      current = locateChildForSegment(current, seg);
    }
    if (!current) return null;
    const primitive = current.querySelector(
      ".json-string, .json-number, .json-boolean, .json-null"
    ) as HTMLElement | null;
    return primitive ?? current;
  }
}

function locateChildForSegment(parent: HTMLElement, segment: string | number): HTMLElement | null {
  const rows = parent.querySelectorAll<HTMLElement>(":scope .json-content > .json-row");
  if (typeof segment === "string") {
    for (const row of Array.from(rows)) {
      const key = row.querySelector(".json-key");
      if (key && key.textContent === `"${segment}"`) return row;
    }
    return null;
  }
  const row = rows[segment];
  return row ?? null;
}

function replaceWithInput(
  target: HTMLElement,
  type: "text" | "number",
  initial: string,
  onDone: (rawValue: string, committed: boolean) => void
): void {
  const input = document.createElement("input");
  input.type = type;
  input.value = initial;
  input.className = "json-inline-edit";
  target.replaceWith(input);
  input.focus();
  input.select();
  let resolved = false;
  const commit = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.value, true);
  };
  const cancel = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.value, false);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", () => commit());
}

function replaceWithCheckbox(
  target: HTMLElement,
  initial: boolean,
  onDone: (newValue: boolean, committed: boolean) => void
): void {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = initial;
  input.className = "json-inline-edit";
  target.replaceWith(input);
  input.focus();
  let resolved = false;
  const commit = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.checked, true);
  };
  const cancel = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.checked, false);
  };
  input.addEventListener("change", () => commit());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", () => commit());
}
```

- [ ] **Step 7.4: Run tests to verify they pass**

Run: `npx vitest run tests/obsidian/TreeView.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/obsidian/TreeView.ts tests/obsidian/TreeView.test.ts
git commit -m "feat(obsidian): add TreeView adapter with inline value editing"
```

---

## Task 8: `obsidian/SourceView.ts` — CodeMirror 6 wrapper

**Files:**
- Create: `tests/obsidian/SourceView.test.ts`
- Create: `src/obsidian/SourceView.ts`

- [ ] **Step 8.1: Write failing tests**

`tests/obsidian/SourceView.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SourceView } from "../../src/obsidian/SourceView";

describe("SourceView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts a CodeMirror editor into its container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue('{"a":1}');
    expect(container.querySelector(".cm-editor")).not.toBeNull();
  });

  it("getValue returns the current document text", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue('{"a":1}');
    expect(view.getValue()).toBe('{"a":1}');
  });

  it("setValue replaces the entire document", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue('{"a":1}');
    view.setValue('{"b":2}');
    expect(view.getValue()).toBe('{"b":2}');
  });

  it("fires onChange after document is updated by user input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: string[] = [];
    const view = new SourceView(container, { onChange: (text) => changes.push(text) });
    view.setValue("{}");
    view.dispatchInsertForTest(1, "\"a\":1");
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(view.getValue()).toBe("{\"a\":1}");
  });

  it("does not fire onChange when setValue is called programmatically", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: string[] = [];
    const view = new SourceView(container, { onChange: (text) => changes.push(text) });
    view.setValue('{"a":1}');
    expect(changes).toEqual([]);
  });

  it("destroy unmounts the editor", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue("{}");
    view.destroy();
    expect(container.querySelector(".cm-editor")).toBeNull();
  });
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

Run: `npx vitest run tests/obsidian/SourceView.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 8.3: Implement `src/obsidian/SourceView.ts`**

```typescript
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

export interface SourceViewOptions {
  onChange?: (newText: string) => void;
}

export class SourceView {
  private view: EditorView | null = null;
  private suppressChange = false;
  constructor(private container: HTMLElement, private opts: SourceViewOptions) {
    this.mount("");
  }

  private mount(initial: string): void {
    const state = EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        json(),
        EditorView.updateListener.of((update) => {
          if (this.suppressChange) return;
          if (update.docChanged && this.opts.onChange) {
            this.opts.onChange(update.state.doc.toString());
          }
        }),
      ],
    });
    this.view = new EditorView({ state, parent: this.container });
  }

  setValue(text: string): void {
    if (!this.view) return;
    this.suppressChange = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      annotations: Transaction.addToHistory.of(false),
    });
    this.suppressChange = false;
  }

  getValue(): string {
    return this.view ? this.view.state.doc.toString() : "";
  }

  destroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  /** Test-only helper: simulates a user-initiated insert at position. */
  dispatchInsertForTest(from: number, text: string): void {
    if (!this.view) return;
    this.view.dispatch({ changes: { from, insert: text } });
  }
}
```

- [ ] **Step 8.4: Run tests to verify they pass**

Run: `npx vitest run tests/obsidian/SourceView.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add src/obsidian/SourceView.ts tests/obsidian/SourceView.test.ts
git commit -m "feat(obsidian): add SourceView (CodeMirror 6 + JSON language)"
```

---

## Task 9: `obsidian/SettingsTab.ts` — plugin settings UI

**Files:**
- Create: `tests/obsidian/SettingsTab.test.ts`
- Create: `src/obsidian/SettingsTab.ts`

Settings type:
```typescript
interface JsonEditorSettings {
  defaultMode: "tree" | "source";
  indent: 2 | 4 | "\t";
  markerStyle: "modern" | "classic";
  autoCollapseDepth: number;
}
```

- [ ] **Step 9.1: Write failing tests**

`tests/obsidian/SettingsTab.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { Plugin, type App } from "obsidian";
import { JsonEditorSettingsTab, DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

class FakePlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  async saveSettings() { await this.saveData(this.settings); }
}

describe("JsonEditorSettingsTab", () => {
  let app: App;
  let plugin: FakePlugin;
  let tab: JsonEditorSettingsTab;

  beforeEach(() => {
    app = {} as App;
    plugin = new FakePlugin(app, { id: "x", name: "x", version: "0.1.0" });
    tab = new JsonEditorSettingsTab(app, plugin);
  });

  it("DEFAULT_SETTINGS provides reasonable defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      defaultMode: "tree",
      indent: 2,
      markerStyle: "modern",
      autoCollapseDepth: 2,
    });
  });

  it("display() renders four settings rows", () => {
    tab.display();
    const settings = tab.containerEl.querySelectorAll(".setting-item, div");
    // The mock Setting class appends a div per Setting instance; we expect at least 4.
    const inputs = tab.containerEl.querySelectorAll("input, select");
    expect(inputs.length).toBeGreaterThanOrEqual(4);
  });

  it("display() pre-fills current settings into controls", () => {
    plugin.settings = { defaultMode: "source", indent: 4, markerStyle: "classic", autoCollapseDepth: 1 };
    tab.display();
    const select = tab.containerEl.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("source");
  });
});
```

- [ ] **Step 9.2: Run tests to verify they fail**

Run: `npx vitest run tests/obsidian/SettingsTab.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 9.3: Implement `src/obsidian/SettingsTab.ts`**

```typescript
import { App, PluginSettingTab, Setting } from "obsidian";
import type { Plugin } from "obsidian";

export interface JsonEditorSettings {
  defaultMode: "tree" | "source";
  indent: 2 | 4 | "\t";
  markerStyle: "modern" | "classic";
  autoCollapseDepth: number;
}

export const DEFAULT_SETTINGS: JsonEditorSettings = {
  defaultMode: "tree",
  indent: 2,
  markerStyle: "modern",
  autoCollapseDepth: 2,
};

interface PluginWithSettings extends Plugin {
  settings: JsonEditorSettings;
  saveSettings(): Promise<void>;
}

export class JsonEditorSettingsTab extends PluginSettingTab {
  constructor(app: App, private settingsPlugin: PluginWithSettings) {
    super(app, settingsPlugin);
  }

  display(): void {
    this.containerEl.empty?.();
    this.containerEl.innerHTML = "";
    const s = this.settingsPlugin.settings;

    new Setting(this.containerEl)
      .setName("Default mode")
      .setDesc("Which view opens by default when a .json file is opened.")
      .addDropdown((dd) => {
        dd.addOption("tree", "Tree");
        dd.addOption("source", "Source");
        dd.setValue(s.defaultMode);
        dd.onChange(async (v) => {
          s.defaultMode = v as "tree" | "source";
          await this.settingsPlugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("Indent")
      .setDesc("Spaces or tab used when serializing JSON from Tree edits.")
      .addDropdown((dd) => {
        dd.addOption("2", "2 spaces");
        dd.addOption("4", "4 spaces");
        dd.addOption("tab", "Tab");
        dd.setValue(s.indent === "\t" ? "tab" : String(s.indent));
        dd.onChange(async (v) => {
          s.indent = v === "tab" ? "\t" : (parseInt(v, 10) as 2 | 4);
          await this.settingsPlugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("Tree marker style")
      .setDesc("Visual style of the tree: modern (no markers) or classic (┐├┘).")
      .addDropdown((dd) => {
        dd.addOption("modern", "Modern (clean indent)");
        dd.addOption("classic", "Classic (┐├┘)");
        dd.setValue(s.markerStyle);
        dd.onChange(async (v) => {
          s.markerStyle = v as "modern" | "classic";
          await this.settingsPlugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("Auto-collapse depth")
      .setDesc(
        "Nodes strictly deeper than this depth start collapsed. 0 = collapse all but root."
      )
      .addText((text) => {
        text.setValue(String(s.autoCollapseDepth));
        text.onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            s.autoCollapseDepth = n;
            await this.settingsPlugin.saveSettings();
          }
        });
      });
  }
}
```

- [ ] **Step 9.4: Run tests to verify they pass**

Run: `npx vitest run tests/obsidian/SettingsTab.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 9.5: Commit**

```bash
git add src/obsidian/SettingsTab.ts tests/obsidian/SettingsTab.test.ts
git commit -m "feat(obsidian): add settings tab with defaults, indent, marker style, depth"
```

---

## Task 10: `obsidian/JsonFileView.ts` — the main `.json` file view

**Files:**
- Create: `tests/obsidian/JsonFileView.test.ts`
- Create: `src/obsidian/JsonFileView.ts`

`JsonFileView` extends `TextFileView`, owns the mode toggle, hosts a `TreeView` and a `SourceView`, and routes data through `core/parse` and `core/serialize`.

- [ ] **Step 10.1: Write failing tests**

`tests/obsidian/JsonFileView.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { JsonFileView, JSON_VIEW_TYPE } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { WorkspaceLeaf } from "obsidian";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} } as WorkspaceLeaf);

describe("JsonFileView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("exposes JSON_VIEW_TYPE = 'json-editor-view'", () => {
    expect(JSON_VIEW_TYPE).toBe("json-editor-view");
  });

  it("renders a toggle with Tree and Source pills", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const pills = v.contentEl.querySelectorAll(".json-mode-pill");
    expect(pills.length).toBe(2);
    expect(pills[0].textContent).toBe("Tree");
    expect(pills[1].textContent).toBe("Source");
  });

  it("starts in tree mode by default", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();
    expect(v.contentEl.querySelector(".cm-editor")).toBeNull();
  });

  it("starts in source mode when settings.defaultMode = source", () => {
    const v = new JsonFileView(fakeLeaf(), { ...DEFAULT_SETTINGS, defaultMode: "source" });
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-tree-root")).toBeNull();
  });

  it("toggles to source view when Source pill is clicked", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1}', false);
    const sourcePill = v.contentEl.querySelectorAll(".json-mode-pill")[1] as HTMLElement;
    sourcePill.click();
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-tree-root")).toBeNull();
  });

  it("forces source mode and shows error banner when JSON is invalid", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("{not valid}", false);
    expect(v.contentEl.querySelector(".cm-editor")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-error-banner")).not.toBeNull();
    const treePill = v.contentEl.querySelector(".json-mode-pill") as HTMLButtonElement;
    expect(treePill.disabled).toBe(true);
  });

  it("re-enables tree toggle when source content becomes valid again", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("{not valid}", false);
    v.setViewData('{"a":1}', false);
    const treePill = v.contentEl.querySelector(".json-mode-pill") as HTMLButtonElement;
    expect(treePill.disabled).toBe(false);
  });

  it("getViewData() returns the current text after tree edits", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    // Simulate a tree-edit by clicking the string value and committing a change.
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    const data = v.getViewData();
    expect(JSON.parse(data)).toEqual({ name: "sam" });
  });

  it("calls requestSave after a tree edit", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"name":"jay"}', false);
    const before = v.saveCount;
    const value = v.contentEl.querySelector(".json-string") as HTMLElement;
    value.click();
    const input = v.contentEl.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "sam";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(v.saveCount).toBe(before + 1);
  });

  it("getViewType returns the registered view type", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    expect(v.getViewType()).toBe("json-editor-view");
  });

  it("shows an empty-state UI with 'Initialize as {}' button when data is empty", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("", false);
    const empty = v.contentEl.querySelector(".json-empty-state");
    expect(empty).not.toBeNull();
    const btn = v.contentEl.querySelector(".json-empty-state-init") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(v.contentEl.querySelector(".json-error-banner")).toBeNull();
  });

  it("initializes data as '{}' when the empty-state button is clicked", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("", false);
    const btn = v.contentEl.querySelector(".json-empty-state-init") as HTMLButtonElement;
    btn.click();
    expect(JSON.parse(v.getViewData())).toEqual({});
    expect(v.contentEl.querySelector(".json-tree-root")).not.toBeNull();
    expect(v.contentEl.querySelector(".json-empty-state")).toBeNull();
  });
});
```

- [ ] **Step 10.2: Run tests to verify they fail**

Run: `npx vitest run tests/obsidian/JsonFileView.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 10.3: Implement `src/obsidian/JsonFileView.ts`**

```typescript
import { TextFileView, type WorkspaceLeaf } from "obsidian";
import { parse } from "../core/parse";
import { serialize } from "../core/serialize";
import type { JsonValue } from "../core/types";
import { TreeView } from "./TreeView";
import { SourceView } from "./SourceView";
import type { JsonEditorSettings } from "./SettingsTab";

export const JSON_VIEW_TYPE = "json-editor-view";

type Mode = "tree" | "source";

export class JsonFileView extends TextFileView {
  private mode: Mode;
  private treeView: TreeView | null = null;
  private sourceView: SourceView | null = null;
  private currentValue: JsonValue | null = null;
  private invalid = false;

  private toggleEl!: HTMLDivElement;
  private treePillEl!: HTMLButtonElement;
  private sourcePillEl!: HTMLButtonElement;
  private bodyEl!: HTMLDivElement;
  private bannerEl: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf, private settings: JsonEditorSettings) {
    super(leaf);
    this.mode = settings.defaultMode;
    this.buildChrome();
  }

  getViewType(): string {
    return JSON_VIEW_TYPE;
  }

  override getViewData(): string {
    return this.data;
  }

  override setViewData(data: string, _clear: boolean): void {
    this.data = data;
    if (data.trim() === "") {
      this.invalid = false;
      this.currentValue = null;
      this.clearBanner();
      this.treePillEl.disabled = false;
      this.renderEmptyState();
      return;
    }
    const parsed = parse(data);
    if (parsed.ok) {
      this.invalid = false;
      this.currentValue = parsed.value;
      this.clearBanner();
      this.treePillEl.disabled = false;
    } else {
      this.invalid = true;
      this.currentValue = null;
      this.mode = "source";
      this.showBanner(`Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`);
      this.treePillEl.disabled = true;
    }
    this.refreshMode();
  }

  private renderEmptyState(): void {
    this.bodyEl.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "json-empty-state";
    const msg = document.createElement("p");
    msg.textContent = "This file is empty.";
    const btn = document.createElement("button");
    btn.className = "json-empty-state-init";
    btn.textContent = "Initialize as {}";
    btn.addEventListener("click", () => {
      this.setViewData("{}", false);
      this.requestSave();
    });
    wrap.appendChild(msg);
    wrap.appendChild(btn);
    this.bodyEl.appendChild(wrap);
  }

  override clear(): void {
    this.data = "";
    this.currentValue = null;
    this.invalid = false;
    this.clearBanner();
    this.bodyEl.innerHTML = "";
  }

  private buildChrome(): void {
    this.toggleEl = document.createElement("div");
    this.toggleEl.className = "json-mode-toggle";
    this.treePillEl = document.createElement("button");
    this.treePillEl.className = "json-mode-pill";
    this.treePillEl.textContent = "Tree";
    this.treePillEl.addEventListener("click", () => this.switchTo("tree"));
    this.sourcePillEl = document.createElement("button");
    this.sourcePillEl.className = "json-mode-pill";
    this.sourcePillEl.textContent = "Source";
    this.sourcePillEl.addEventListener("click", () => this.switchTo("source"));
    this.toggleEl.appendChild(this.treePillEl);
    this.toggleEl.appendChild(this.sourcePillEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "json-editor-body";

    this.contentEl.appendChild(this.toggleEl);
    this.contentEl.appendChild(this.bodyEl);
  }

  private switchTo(target: Mode): void {
    if (this.mode === target) return;
    if (target === "tree" && this.invalid) return;
    if (this.mode === "source" && this.sourceView) {
      // Pull latest text from CM6 into this.data before switching away.
      this.data = this.sourceView.getValue();
      const parsed = parse(this.data);
      if (parsed.ok) {
        this.currentValue = parsed.value;
      } else {
        this.invalid = true;
        this.showBanner(`Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`);
        this.treePillEl.disabled = true;
        return;
      }
    }
    this.mode = target;
    this.refreshMode();
  }

  private refreshMode(): void {
    this.bodyEl.innerHTML = "";
    this.treeView?.setValue(null); // detach
    this.sourceView?.destroy();
    this.treeView = null;
    this.sourceView = null;

    this.treePillEl.classList.toggle("active", this.mode === "tree");
    this.sourcePillEl.classList.toggle("active", this.mode === "source");

    if (this.mode === "tree" && this.currentValue !== null) {
      this.treeView = new TreeView(this.bodyEl, {
        markerStyle: this.settings.markerStyle,
        autoCollapseDepth: this.settings.autoCollapseDepth,
        onChange: (newValue) => this.handleTreeChange(newValue),
      });
      this.treeView.setValue(this.currentValue);
    } else {
      this.sourceView = new SourceView(this.bodyEl, {
        onChange: (text) => this.handleSourceChange(text),
      });
      this.sourceView.setValue(this.data);
    }
  }

  private handleTreeChange(newValue: JsonValue): void {
    this.currentValue = newValue;
    this.data = serialize(newValue, { indent: this.settings.indent });
    this.requestSave();
  }

  private handleSourceChange(text: string): void {
    this.data = text;
    const parsed = parse(text);
    if (parsed.ok) {
      this.currentValue = parsed.value;
      this.invalid = false;
      this.clearBanner();
      this.treePillEl.disabled = false;
    } else {
      this.currentValue = null;
      this.invalid = true;
      this.showBanner(`Invalid JSON at line ${parsed.line}, column ${parsed.col}: ${parsed.error}`);
      this.treePillEl.disabled = true;
    }
    this.requestSave();
  }

  private showBanner(message: string): void {
    if (!this.bannerEl) {
      this.bannerEl = document.createElement("div");
      this.bannerEl.className = "json-error-banner";
      this.contentEl.insertBefore(this.bannerEl, this.bodyEl);
    }
    this.bannerEl.textContent = message;
  }

  private clearBanner(): void {
    this.bannerEl?.remove();
    this.bannerEl = null;
  }
}
```

- [ ] **Step 10.4: Run tests to verify they pass**

Run: `npx vitest run tests/obsidian/JsonFileView.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 10.5: Commit**

```bash
git add src/obsidian/JsonFileView.ts tests/obsidian/JsonFileView.test.ts
git commit -m "feat(obsidian): add JsonFileView with Tree↔Source toggle and error banner"
```

---

## Task 11: `obsidian/CodeblockProcessor.ts` — render ```json blocks in notes

**Files:**
- Create: `tests/obsidian/CodeblockProcessor.test.ts`
- Create: `src/obsidian/CodeblockProcessor.ts`

- [ ] **Step 11.1: Write failing tests**

`tests/obsidian/CodeblockProcessor.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { renderJsonCodeblock } from "../../src/obsidian/CodeblockProcessor";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { MarkdownPostProcessorContext } from "obsidian";

const fakeCtx = (): MarkdownPostProcessorContext => ({
  sourcePath: "fake/path.md",
  getSectionInfo: () => null,
});

describe("renderJsonCodeblock", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a tree for valid JSON", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock('{"a": 1}', el, fakeCtx(), DEFAULT_SETTINGS);
    expect(el.querySelector(".json-tree-root")).not.toBeNull();
  });

  it("does not bind value-click handlers (read-only)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock('{"name": "jay"}', el, fakeCtx(), DEFAULT_SETTINGS);
    const value = el.querySelector(".json-string") as HTMLElement;
    value.click();
    expect(el.querySelector("input")).toBeNull();
  });

  it("falls back to a default code-block render with an indicator on parse error", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock("{not valid}", el, fakeCtx(), DEFAULT_SETTINGS);
    expect(el.querySelector(".json-tree-root")).toBeNull();
    expect(el.querySelector(".json-codeblock-fallback")).not.toBeNull();
    expect(el.querySelector(".json-codeblock-error-indicator")).not.toBeNull();
    expect(el.textContent).toContain("{not valid}");
  });

  it("renders empty object {} as an empty tree", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderJsonCodeblock("{}", el, fakeCtx(), DEFAULT_SETTINGS);
    expect(el.querySelector(".json-tree-root")).not.toBeNull();
    expect(el.querySelector(".json-bracket")?.textContent).toBe("{}");
  });
});
```

- [ ] **Step 11.2: Run tests to verify they fail**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts`
Expected: tests fail with module-not-found.

- [ ] **Step 11.3: Implement `src/obsidian/CodeblockProcessor.ts`**

```typescript
import type { MarkdownPostProcessorContext } from "obsidian";
import { parse } from "../core/parse";
import { renderTree } from "../core/render";
import type { JsonEditorSettings } from "./SettingsTab";

export function renderJsonCodeblock(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
  settings: JsonEditorSettings
): void {
  const parsed = parse(source);
  if (!parsed.ok) {
    renderFallback(source, el, parsed.error);
    return;
  }
  const tree = renderTree(parsed.value, {
    readonly: true,
    markerStyle: settings.markerStyle,
    autoCollapseDepth: settings.autoCollapseDepth,
  });
  el.appendChild(tree);
}

function renderFallback(source: string, el: HTMLElement, errorMessage: string): void {
  const wrapper = document.createElement("div");
  wrapper.className = "json-codeblock-fallback";
  const indicator = document.createElement("span");
  indicator.className = "json-codeblock-error-indicator";
  indicator.title = `Invalid JSON: ${errorMessage}`;
  indicator.textContent = "⚠";
  wrapper.appendChild(indicator);
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.className = "language-json";
  code.textContent = source;
  pre.appendChild(code);
  wrapper.appendChild(pre);
  el.appendChild(wrapper);
}
```

- [ ] **Step 11.4: Run tests to verify they pass**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 11.5: Commit**

```bash
git add src/obsidian/CodeblockProcessor.ts tests/obsidian/CodeblockProcessor.test.ts
git commit -m "feat(obsidian): add read-only json codeblock postprocessor with fallback"
```

---

## Task 12: `main.ts` — plugin entry that wires everything together

**Files:**
- Modify: `src/main.ts`

No tests for this task — it is glue code; integration is verified by the manual E2E checklist in Task 14.

- [ ] **Step 12.1: Replace `src/main.ts`**

```typescript
import { Plugin, type WorkspaceLeaf } from "obsidian";
import { JsonFileView, JSON_VIEW_TYPE } from "./obsidian/JsonFileView";
import { renderJsonCodeblock } from "./obsidian/CodeblockProcessor";
import {
  DEFAULT_SETTINGS,
  JsonEditorSettingsTab,
  type JsonEditorSettings,
} from "./obsidian/SettingsTab";

export default class JsonEditorPlugin extends Plugin {
  settings: JsonEditorSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    const stored = (await this.loadData()) as Partial<JsonEditorSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };

    this.registerView(JSON_VIEW_TYPE, (leaf: WorkspaceLeaf) => new JsonFileView(leaf, this.settings));
    this.registerExtensions(["json"], JSON_VIEW_TYPE);

    this.registerMarkdownCodeBlockProcessor("json", (src, el, ctx) =>
      renderJsonCodeblock(src, el, ctx, this.settings)
    );

    this.addSettingTab(new JsonEditorSettingsTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

Note: `registerExtensions` is the Obsidian API call that binds a file extension to a view type. The mock in `__mocks__/obsidian.ts` does not implement this — production-only code path.

- [ ] **Step 12.2: Add `registerExtensions` to the Obsidian mock so production-shaped code type-checks under tests**

Edit `src/__mocks__/obsidian.ts`, adding inside the `Plugin` class:

```typescript
registerExtensions(_extensions: string[], _viewType: string) {}
```

- [ ] **Step 12.3: Verify TypeScript compiles**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: exits with code 0.

- [ ] **Step 12.4: Run all tests to make sure nothing regressed**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 12.5: Build the plugin in production mode**

Run: `npm run build`
Expected: `main.js` is created in the project root, no errors.

- [ ] **Step 12.6: Commit**

```bash
git add src/main.ts src/__mocks__/obsidian.ts
git commit -m "feat: wire view, codeblock processor, and settings tab into plugin"
```

---

## Task 13: `styles.css` — Obsidian-CSS-variable-based styles

**Files:**
- Create: `styles.css`

No tests — visual presentation is verified during the manual E2E run.

- [ ] **Step 13.1: Write `styles.css`**

```css
/* obsidian-json-editor — styles
   All colors reference Obsidian CSS variables so the plugin follows the active theme.
   Falls back to sensible JSON type colors when a variable is absent. */

/* ─── Mode toggle ─────────────────────────────────────────────────── */
.json-mode-toggle {
  display: flex;
  gap: 0;
  justify-content: flex-end;
  margin: 8px 12px;
}

.json-mode-pill {
  padding: 4px 14px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-ui-small);
  font-family: var(--font-interface);
}
.json-mode-pill:first-child { border-radius: 6px 0 0 6px; }
.json-mode-pill:last-child { border-radius: 0 6px 6px 0; border-left: none; }
.json-mode-pill:hover:not(:disabled) { background: var(--background-modifier-hover); }
.json-mode-pill.active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}
.json-mode-pill:disabled { opacity: 0.4; cursor: not-allowed; }

/* ─── Error banner ────────────────────────────────────────────────── */
.json-error-banner {
  margin: 4px 12px 8px;
  padding: 8px 12px;
  border-left: 3px solid var(--text-error, #d9534f);
  background: var(--background-modifier-error, rgba(217, 83, 79, 0.1));
  color: var(--text-error, #d9534f);
  font-family: var(--font-monospace);
  font-size: var(--font-ui-smaller);
  border-radius: 4px;
}

/* ─── Editor body ─────────────────────────────────────────────────── */
.json-editor-body {
  padding: 12px;
  font-family: var(--font-monospace);
  font-size: var(--font-ui-small);
  line-height: 1.6;
}

/* ─── Tree styling ────────────────────────────────────────────────── */
.json-tree-root {
  color: var(--text-normal);
}
.json-container {
  display: block;
}
.json-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.json-collapse-toggle {
  cursor: pointer;
  user-select: none;
  display: inline-block;
  width: 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 10px;
}
.json-collapse-toggle:hover { color: var(--text-normal); }
.json-content {
  display: block;
  padding-left: 18px;
  border-left: 1px solid var(--background-modifier-border);
  margin-left: 5px;
}
.json-content.collapsed { display: none; }

.json-row {
  display: block;
  padding: 1px 0;
}

.json-key {
  color: var(--text-accent, var(--color-cyan, #4ec9b0));
  font-weight: 600;
  margin-right: 4px;
}
.json-bracket { color: var(--text-muted); }
.json-index   { color: var(--text-faint); font-size: 0.9em; margin-right: 4px; }
.json-marker  { color: var(--text-faint); margin-right: 4px; opacity: 0.6; }

.json-string  { color: var(--color-green, #6a9955); word-break: break-word; }
.json-number  { color: var(--color-blue, #569cd6); }
.json-boolean { color: var(--color-purple, #c586c0); }
.json-null    { color: var(--text-faint); }

.json-editable {
  cursor: pointer;
  border-bottom: 1px dotted transparent;
}
.json-editable:hover {
  border-bottom-color: var(--text-muted);
}

.json-inline-edit {
  font-family: var(--font-monospace);
  font-size: inherit;
  padding: 1px 4px;
  border: 1px solid var(--interactive-accent);
  border-radius: 3px;
  background: var(--background-primary);
  color: var(--text-normal);
}

/* ─── Codeblock fallback ──────────────────────────────────────────── */
.json-codeblock-fallback {
  position: relative;
}
.json-codeblock-error-indicator {
  position: absolute;
  right: 8px;
  top: 4px;
  color: var(--text-error, #d9534f);
  cursor: help;
  font-size: 14px;
}
```

- [ ] **Step 13.2: Commit**

```bash
git add styles.css
git commit -m "feat: add Obsidian-CSS-variable-based plugin styles"
```

---

## Task 14: `README.md` and manual E2E checklist

**Files:**
- Create: `README.md`
- Create: `docs/superpowers/plans/2026-05-20-manual-e2e.md`

- [ ] **Step 14.1: Write `README.md`**

```markdown
# Obsidian JSON Editor

View and edit JSON files in Obsidian with a Tree↔Source toggle. Renders ```` ```json ```` code blocks inside Markdown notes as collapsible trees that respect your theme.

## Features

- **`.json` file view** with a mode toggle: a tree view for browsing and editing primitive values, and a CodeMirror 6 source view with JSON syntax highlighting.
- **Inline editing** of strings, numbers, and booleans in the tree (click a value).
- **Code-block rendering** — `` ```json `` blocks in Markdown notes show as read-only trees.
- **Theme-aware** — uses Obsidian's CSS variables, follows whichever theme you've selected.
- **Settings** — default mode, indent style (2 / 4 / tab), tree marker style (modern / classic), auto-collapse depth.

## Install (manual)

1. Build the plugin: `npm install && npm run build`.
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-json-editor/` directory.
3. In Obsidian: Settings → Community Plugins → enable "JSON Editor".

## Usage

- **Open a `.json` file** — the plugin's view opens by default.
- **Toggle mode** with the Tree / Source pills in the top-right of the view.
- **Edit values** by clicking them in tree mode. Press Enter to commit, Escape to cancel.
- **Structural changes** (add/rename/remove keys, change types) are done in Source mode.

## Development

```bash
npm install
npm test           # run all Vitest tests
npm run dev        # esbuild watch mode (rebuilds on change)
npm run build      # production build
```

## License

GPL-3.0
```

- [ ] **Step 14.2: Write manual E2E checklist**

`docs/superpowers/plans/2026-05-20-manual-e2e.md`:
```markdown
# Manual E2E Checklist

Run before tagging a release. Use a dedicated test vault, not your daily-driver vault.

## Setup
- [ ] Build with `npm run build`
- [ ] Copy `main.js`, `manifest.json`, `styles.css` to `<test-vault>/.obsidian/plugins/obsidian-json-editor/`
- [ ] Enable plugin in Settings → Community Plugins

## .json file view
- [ ] Open a small config file (e.g. `{"a": 1, "b": true}`) — opens in Tree mode
- [ ] Open a deeply nested file (≥4 levels) — auto-collapse at default depth works
- [ ] Open a large file (~1 MB) — works without freeze; warning shown if >2 MB
- [ ] Open a file with Unicode keys (`{"naïve": "café"}`) — renders correctly
- [ ] Open an empty file — empty state shown with "Initialize as {}" button (Task 10)
- [ ] Open a malformed file — forced to Source mode, error banner shown with line/col
- [ ] Open a >2 MB file — Tree mode functional but slow (see _Deferred_ note below; no warning UI in v1.0)

## Editing in Tree mode
- [ ] Click a string value, type a new value, press Enter — value updates, file saves
- [ ] Click a number value, change it, press Enter — value updates and is stored as a number
- [ ] Click a boolean value, toggle the checkbox — value updates
- [ ] Click a null value — no editor opens (tooltip explains "Edit in Source")
- [ ] Press Escape during an edit — no change persisted

## Mode toggle
- [ ] Tree → Source: tree view's current content appears in CM6 with JSON highlighting
- [ ] Source → Tree (valid): tree updates from edited source
- [ ] Source → Tree (invalid): tree toggle disabled, error banner shown
- [ ] Tree → Source preserves indent setting

## Code blocks in notes
- [ ] Create a note with a `` ```json `` block containing valid JSON — renders as read-only tree
- [ ] Note in Source mode — code block shows as plain text (Obsidian default)
- [ ] Code block with invalid JSON — fallback rendering with warning indicator

## Settings
- [ ] Change default mode to Source → next `.json` file opens in Source view
- [ ] Change indent to 4 → tree edits serialize with 4-space indent
- [ ] Change marker style to Classic → tree shows ┐├┘ markers
- [ ] Change auto-collapse depth → deep files respect the new depth
- [ ] Settings persist across Obsidian restart
```

- [ ] **Step 14.3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-05-20-manual-e2e.md
git commit -m "docs: add README and manual E2E checklist"
```

- [ ] **Step 14.4: Run final test suite**

Run: `npm test`
Expected: all tests across `tests/core/` and `tests/obsidian/` pass.

- [ ] **Step 14.5: Final production build**

Run: `npm run build`
Expected: `main.js`, `manifest.json`, `styles.css` are ready to be copied into a test vault.

---

## Definition-of-Done Verification

After all tasks complete, verify each spec requirement against the implemented code:

- [ ] `.json` files open in `JsonFileView` with default mode from settings (Task 10, 12)
- [ ] Tree↔Source toggle functional; Source uses CM6 with `@codemirror/lang-json` (Task 8, 10)
- [ ] Click-to-edit primitive values; edits persist via `requestSave()` (Task 7, 10)
- [ ] ```` ```json ```` postprocessor renders read-only trees (Task 11, 12)
- [ ] Invalid JSON → forced Source view with line/col error banner (Task 10)
- [ ] Settings tab with default mode, indent, marker style, auto-collapse depth (Task 9, 12)
- [ ] Core coverage ≥95% (Tasks 2–5); adapter tests for happy path + parse failure (Tasks 7–11)
- [ ] `manifest.json` (Task 0), `README.md` (Task 14)
- [ ] Manual E2E checklist run in test vault (Task 14)

## Deferred from spec to v1.1

These appear in the spec's Edge Cases table but are not in the v1.0 DoD list. Implementing them is straightforward but adds non-trivial test surface — pulled out to keep v1.0 lean:

- **Large-file warning (>2 MB)** — `setViewData` would check `data.length > 2_000_000` and show a notice. ~10 LOC + 1 test.
- **Tree-mode 10-step undo** — `JsonFileView` would keep a `JsonValue[]` stack pushed on every `handleTreeChange`, popped on Cmd/Ctrl+Z. ~20 LOC + 2 tests. (Source-mode Cmd+Z already works via CM6's `history()` extension from Task 8.)

If either becomes a real pain point during manual E2E, fold them into a follow-up patch.
