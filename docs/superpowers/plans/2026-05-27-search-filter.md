# 0.2.0 — Search & Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live search input to the JSON tree view that strict-filters the tree to matches and their ancestors, case-insensitive substring matching on keys + primitive values.

**Architecture:** Hybrid. Pure `findMatches()` in `src/core/search.ts` computes match + on-path sets from a `JsonValue` + query string. `TreeView.applyFilter()` applies CSS classes to the existing rendered DOM via `data-path` lookup. CSS handles strict hiding. Renderer (`core/render.ts`) is not touched.

**Tech Stack:** TypeScript, Vitest + happy-dom, no new runtime deps.

**Spec:** [`docs/superpowers/specs/2026-05-27-search-filter-design.md`](../specs/2026-05-27-search-filter-design.md)

**Branch:** `feat/0.2.0-search-filter` (already created)

---

## Files Map

**New:**
- `src/core/search.ts` — pure `findMatches(value, query, opts?) → SearchResult`
- `src/obsidian/SearchBar.ts` — input + clear + count component
- `tests/core/search.test.ts`
- `tests/obsidian/SearchBar.test.ts`

**Modified:**
- `src/core/types.ts` — add `SearchOptions`, `SearchResult` interfaces
- `src/obsidian/TreeView.ts` — add `applyFilter(query)` method
- `src/obsidian/JsonFileView.ts` — wire up SearchBar, cache currentQuery, re-apply on render
- `src/main.ts` — register `Cmd/Ctrl+F` plugin command (focus search)
- `styles.css` — `.json-search-bar`, `.json-match`, `.json-on-path`, `.json-filter-active`
- `tests/obsidian/TreeView.test.ts` — applyFilter tests
- `tests/obsidian/JsonFileView.test.ts` — SearchBar integration tests
- `tests/obsidian/SourceView.test.ts` — n/a (no changes)
- `manifest.json`, `package.json`, `versions.json` — bump to 0.2.0
- `README.md` — Features bullet for search; badge bump
- `CHANGELOG.md` — `## [0.2.0] — 2026-05-27` section

---

## Task 1: `core/search.ts` — empty query baseline

**Files:**
- Create: `src/core/search.ts`
- Create: `tests/core/search.test.ts`
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add types to `src/core/types.ts`**

Append:

```ts
export interface SearchOptions {
  matchKeys?: boolean;
  matchValues?: boolean;
}

export interface SearchResult {
  matches: Set<string>;
  onPath: Set<string>;
  counts: { keys: number; values: number };
}
```

- [ ] **Step 2: Create failing test for empty/whitespace query**

`tests/core/search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findMatches } from "../../src/core/search";

describe("findMatches", () => {
  it("returns empty result for empty query", () => {
    const result = findMatches({ a: 1 }, "");
    expect(result.matches.size).toBe(0);
    expect(result.onPath.size).toBe(0);
    expect(result.counts).toEqual({ keys: 0, values: 0 });
  });

  it("returns empty result for whitespace-only query", () => {
    const result = findMatches({ a: 1 }, "   ");
    expect(result.matches.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run — verify failure**

`npx vitest run tests/core/search.test.ts` → fails (`findMatches` not defined).

- [ ] **Step 4: Minimal implementation**

`src/core/search.ts`:

```ts
import type { JsonValue, SearchOptions, SearchResult } from "./types";

export function findMatches(
  _value: JsonValue,
  query: string,
  _opts?: SearchOptions
): SearchResult {
  const empty: SearchResult = {
    matches: new Set(),
    onPath: new Set(),
    counts: { keys: 0, values: 0 },
  };
  if (query.trim() === "") return empty;
  return empty;
}
```

- [ ] **Step 5: Run — verify pass**

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/search.ts tests/core/search.test.ts
git commit -m "feat(core): search.ts skeleton + empty-query behavior

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Key matching (flat object)

**Files:**
- Modify: `src/core/search.ts`
- Modify: `tests/core/search.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/core/search.test.ts` (inside describe):

```ts
it("matches a key in a flat object", () => {
  const r = findMatches({ port: 8080, host: "localhost" }, "port");
  expect(r.matches).toEqual(new Set(["port"]));
  expect(r.onPath).toEqual(new Set(["root"]));
  expect(r.counts).toEqual({ keys: 1, values: 0 });
});

it("substring-matches a key", () => {
  const r = findMatches({ portName: 1 }, "port");
  expect(r.matches.has("portName")).toBe(true);
});

it("case-insensitive key match", () => {
  const r = findMatches({ Port: 1 }, "POR");
  expect(r.matches.has("Port")).toBe(true);
});

it("multiple key matches at flat level", () => {
  const r = findMatches({ port: 1, portMap: 2, host: 3 }, "port");
  expect(r.matches.has("port")).toBe(true);
  expect(r.matches.has("portMap")).toBe(true);
  expect(r.counts.keys).toBe(2);
});
```

- [ ] **Step 2: Verify failure** — run vitest, expect 4 failing tests.

- [ ] **Step 3: Implement key matching**

Replace `src/core/search.ts`:

```ts
import type { JsonValue, SearchOptions, SearchResult } from "./types";
import { pathToString } from "./path";

export function findMatches(
  value: JsonValue,
  query: string,
  opts?: SearchOptions
): SearchResult {
  const result: SearchResult = {
    matches: new Set(),
    onPath: new Set(),
    counts: { keys: 0, values: 0 },
  };
  if (query.trim() === "") return result;

  const lowerQ = query.toLowerCase();
  const matchKeys = opts?.matchKeys ?? true;
  const matchValues = opts?.matchValues ?? true;

  function markAncestors(path: (string | number)[]): void {
    for (let i = 0; i <= path.length - 1; i++) {
      result.onPath.add(pathToString(path.slice(0, i)));
    }
  }

  function walk(v: JsonValue, path: (string | number)[]): void {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [key, child] of Object.entries(v)) {
        const childPath = [...path, key];
        if (matchKeys && key.toLowerCase().includes(lowerQ)) {
          result.matches.add(pathToString(childPath));
          result.counts.keys++;
          markAncestors(childPath);
        }
        walk(child, childPath);
      }
    }
  }

  walk(value, []);
  return result;
}
```

- [ ] **Step 4: Run — verify all tests pass**

- [ ] **Step 5: Commit**

```bash
git add src/core/search.ts tests/core/search.test.ts
git commit -m "feat(core): match object keys (case-insensitive substring)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Value matching (primitives) + nesting

**Files:** as above.

- [ ] **Step 1: Add failing tests**

```ts
it("matches a string value", () => {
  const r = findMatches({ env: "production" }, "prod");
  expect(r.matches).toEqual(new Set(["env"]));
  expect(r.counts.values).toBe(1);
});

it("matches a number value", () => {
  const r = findMatches({ port: 8080 }, "808");
  expect(r.matches).toEqual(new Set(["port"]));
  expect(r.counts.values).toBe(1);
});

it("matches a boolean value", () => {
  const r = findMatches({ enabled: true }, "tru");
  expect(r.matches).toEqual(new Set(["enabled"]));
});

it("matches a null value when searching 'null'", () => {
  const r = findMatches({ x: null }, "null");
  expect(r.matches).toEqual(new Set(["x"]));
});

it("matches inside a nested object", () => {
  const r = findMatches({ db: { connection: { port: 5432 } } }, "543");
  expect(r.matches).toEqual(new Set(["db.connection.port"]));
  expect(r.onPath).toEqual(
    new Set(["root", "db", "db.connection"])
  );
});

it("walks arrays and records ancestor chain", () => {
  const r = findMatches({ users: [{ name: "alice" }, { name: "bob" }] }, "bob");
  expect(r.matches).toEqual(new Set(["users[1].name"]));
  expect(r.onPath).toEqual(
    new Set(["root", "users", "users[1]"])
  );
});

it("matches at root-level primitive value", () => {
  const r = findMatches("hello world" as JsonValue, "world");
  expect(r.matches).toEqual(new Set(["root"]));
  expect(r.counts.values).toBe(1);
});

it("does not match array index as a key", () => {
  const r = findMatches([1, 2, 3], "0");
  expect(r.matches.size).toBe(0);
});

it("opts.matchKeys=false skips key matches", () => {
  const r = findMatches({ port: 5432 }, "port", { matchKeys: false });
  expect(r.matches.size).toBe(0);
});

it("opts.matchValues=false skips value matches", () => {
  const r = findMatches({ port: 5432 }, "543", { matchValues: false });
  expect(r.matches.size).toBe(0);
});

it("counts split between keys and values", () => {
  const r = findMatches({ port: "portable" }, "port");
  expect(r.counts).toEqual({ keys: 1, values: 1 });
});
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Extend implementation**

Replace `walk` in `src/core/search.ts`:

```ts
function walk(v: JsonValue, path: (string | number)[]): void {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    for (const [key, child] of Object.entries(v)) {
      const childPath = [...path, key];
      if (matchKeys && key.toLowerCase().includes(lowerQ)) {
        result.matches.add(pathToString(childPath));
        result.counts.keys++;
        markAncestors(childPath);
      }
      walk(child, childPath);
    }
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((child, i) => walk(child, [...path, i]));
    return;
  }
  // primitive
  if (matchValues && primitiveMatches(v, lowerQ)) {
    result.matches.add(pathToString(path));
    result.counts.values++;
    markAncestors(path);
  }
}
```

Add helper at top of file:

```ts
function primitiveMatches(v: JsonValue, lowerQ: string): boolean {
  if (v === null) return "null".includes(lowerQ);
  if (typeof v === "boolean") return String(v).includes(lowerQ);
  if (typeof v === "number") return String(v).toLowerCase().includes(lowerQ);
  if (typeof v === "string") return v.toLowerCase().includes(lowerQ);
  return false;
}
```

Note: for root-level primitive (path=[]), the existing `markAncestors([])` adds no entries (correct — no ancestors). The match itself is added under path "root" via pathToString.

- [ ] **Step 4: Run — verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/core/search.ts tests/core/search.test.ts
git commit -m "feat(core): match primitive values + walk arrays/nesting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Edge-case sweep for `findMatches`

**Files:** as above.

- [ ] **Step 1: Add failing tests**

```ts
it("matches keys with non-identifier characters (quoted-bracket form)", () => {
  const r = findMatches({ "weird key": 1 }, "weird");
  // path encoding uses bracket-quote form via pathToString
  expect(r.matches).toEqual(new Set(['["weird key"]']));
});

it("string substring match works on multi-word values", () => {
  const r = findMatches({ greeting: "Hello, World!" }, "world");
  expect(r.matches).toEqual(new Set(["greeting"]));
});

it("does not double-count when key and value both match", () => {
  const r = findMatches({ port: "port" }, "port");
  // one match per pathStr (Set dedup), but counts split independently
  expect(r.matches).toEqual(new Set(["port"]));
  expect(r.counts).toEqual({ keys: 1, values: 1 });
});

it("handles empty object", () => {
  const r = findMatches({}, "anything");
  expect(r.matches.size).toBe(0);
});

it("handles empty array", () => {
  const r = findMatches([], "anything");
  expect(r.matches.size).toBe(0);
});
```

- [ ] **Step 2: Verify** — these should pass already if Task 3 was implemented correctly. If not, fix.

- [ ] **Step 3: Commit if all green**

```bash
git add tests/core/search.test.ts
git commit -m "test(core): edge-case sweep for findMatches

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `SearchBar.ts` — DOM skeleton + first tests

**Files:**
- Create: `src/obsidian/SearchBar.ts`
- Create: `tests/obsidian/SearchBar.test.ts`

- [ ] **Step 1: Failing test**

`tests/obsidian/SearchBar.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SearchBar } from "../../src/obsidian/SearchBar";

describe("SearchBar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("getElement returns an HTMLElement with the search-bar class", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const el = sb.getElement();
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.classList.contains("json-search-bar")).toBe(true);
  });

  it("contains an input, clear button, and count element", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const el = sb.getElement();
    expect(el.querySelector(".json-search-input")).toBeInstanceOf(HTMLInputElement);
    expect(el.querySelector(".json-search-clear")).toBeInstanceOf(HTMLButtonElement);
    expect(el.querySelector(".json-search-count")).toBeInstanceOf(HTMLElement);
  });

  it("clear button and count are hidden initially", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const el = sb.getElement();
    const clear = el.querySelector<HTMLElement>(".json-search-clear")!;
    const count = el.querySelector<HTMLElement>(".json-search-count")!;
    expect(clear.hidden).toBe(true);
    expect(count.hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Implement**

`src/obsidian/SearchBar.ts`:

```ts
export interface SearchBarOptions {
  onQueryChange: (query: string) => void;
}

export class SearchBar {
  private el: HTMLDivElement;
  private input: HTMLInputElement;
  private clearBtn: HTMLButtonElement;
  private countEl: HTMLSpanElement;

  constructor(private opts: SearchBarOptions) {
    this.el = document.createElement("div");
    this.el.className = "json-search-bar";

    const icon = this.makeIcon();
    this.el.appendChild(icon);

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "json-search-input";
    this.input.placeholder = "Search keys and values…";
    this.input.spellcheck = false;
    this.el.appendChild(this.input);

    this.countEl = document.createElement("span");
    this.countEl.className = "json-search-count";
    this.countEl.hidden = true;
    this.el.appendChild(this.countEl);

    this.clearBtn = document.createElement("button");
    this.clearBtn.className = "json-search-clear";
    this.clearBtn.type = "button";
    this.clearBtn.setAttribute("aria-label", "Clear search");
    this.clearBtn.textContent = "×";
    this.clearBtn.hidden = true;
    this.el.appendChild(this.clearBtn);

    this.wire();
  }

  getElement(): HTMLElement {
    return this.el;
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  clear(): void {
    this.input.value = "";
    this.clearBtn.hidden = true;
    this.countEl.hidden = true;
  }

  setMatchInfo(info: { matchCount: number } | null): void {
    if (info === null) {
      this.countEl.hidden = true;
      return;
    }
    this.countEl.hidden = false;
    if (info.matchCount === 0) {
      this.countEl.textContent = "no matches";
      this.countEl.classList.add("is-empty");
    } else {
      const noun = info.matchCount === 1 ? "match" : "matches";
      this.countEl.textContent = `${info.matchCount} ${noun}`;
      this.countEl.classList.remove("is-empty");
    }
  }

  destroy(): void {
    this.el.remove();
  }

  private wire(): void {
    this.input.addEventListener("input", () => {
      const v = this.input.value;
      this.clearBtn.hidden = v.length === 0;
      this.opts.onQueryChange(v);
    });
    this.clearBtn.addEventListener("click", () => {
      this.input.value = "";
      this.clearBtn.hidden = true;
      this.countEl.hidden = true;
      this.opts.onQueryChange("");
      this.input.focus();
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (this.input.value === "") {
          this.input.blur();
        } else {
          this.input.value = "";
          this.clearBtn.hidden = true;
          this.countEl.hidden = true;
          this.opts.onQueryChange("");
        }
      }
    });
  }

  private makeIcon(): SVGElement {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "json-search-icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "7");
    circle.setAttribute("cy", "7");
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "currentColor");
    circle.setAttribute("stroke-width", "1.5");
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", "11");
    line.setAttribute("y1", "11");
    line.setAttribute("x2", "14");
    line.setAttribute("y2", "14");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(circle);
    svg.appendChild(line);
    return svg;
  }
}
```

- [ ] **Step 4: Run — verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/SearchBar.ts tests/obsidian/SearchBar.test.ts
git commit -m "feat(obsidian): SearchBar skeleton (DOM + class API)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: SearchBar — input + clear + ESC + match-count behavior

**Files:**
- Modify: `tests/obsidian/SearchBar.test.ts`

- [ ] **Step 1: Add behavior tests**

```ts
it("input event fires onQueryChange with current value", () => {
  const calls: string[] = [];
  const sb = new SearchBar({ onQueryChange: (q) => calls.push(q) });
  document.body.appendChild(sb.getElement());
  const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
  input.value = "port";
  input.dispatchEvent(new Event("input"));
  expect(calls).toEqual(["port"]);
});

it("clear button becomes visible when input has content", () => {
  const sb = new SearchBar({ onQueryChange: () => {} });
  document.body.appendChild(sb.getElement());
  const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
  const clear = sb.getElement().querySelector<HTMLElement>(".json-search-clear")!;
  expect(clear.hidden).toBe(true);
  input.value = "x";
  input.dispatchEvent(new Event("input"));
  expect(clear.hidden).toBe(false);
});

it("clicking clear empties the input and fires onQueryChange('')", () => {
  const calls: string[] = [];
  const sb = new SearchBar({ onQueryChange: (q) => calls.push(q) });
  document.body.appendChild(sb.getElement());
  const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
  const clear = sb.getElement().querySelector<HTMLButtonElement>(".json-search-clear")!;
  input.value = "x";
  input.dispatchEvent(new Event("input"));
  clear.click();
  expect(input.value).toBe("");
  expect(calls).toEqual(["x", ""]);
});

it("ESC with content clears input and fires onQueryChange('')", () => {
  const calls: string[] = [];
  const sb = new SearchBar({ onQueryChange: (q) => calls.push(q) });
  document.body.appendChild(sb.getElement());
  const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
  input.value = "x";
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(input.value).toBe("");
  expect(calls).toEqual(["x", ""]);
});

it("setMatchInfo({matchCount:3}) shows '3 matches'", () => {
  const sb = new SearchBar({ onQueryChange: () => {} });
  const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
  sb.setMatchInfo({ matchCount: 3 });
  expect(count.hidden).toBe(false);
  expect(count.textContent).toBe("3 matches");
});

it("setMatchInfo({matchCount:1}) shows '1 match' (singular)", () => {
  const sb = new SearchBar({ onQueryChange: () => {} });
  const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
  sb.setMatchInfo({ matchCount: 1 });
  expect(count.textContent).toBe("1 match");
});

it("setMatchInfo({matchCount:0}) shows 'no matches' and adds is-empty class", () => {
  const sb = new SearchBar({ onQueryChange: () => {} });
  const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
  sb.setMatchInfo({ matchCount: 0 });
  expect(count.textContent).toBe("no matches");
  expect(count.classList.contains("is-empty")).toBe(true);
});

it("setMatchInfo(null) hides the count", () => {
  const sb = new SearchBar({ onQueryChange: () => {} });
  const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
  sb.setMatchInfo({ matchCount: 3 });
  sb.setMatchInfo(null);
  expect(count.hidden).toBe(true);
});

it("clear() method resets input and hides clear button + count", () => {
  const sb = new SearchBar({ onQueryChange: () => {} });
  const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
  const clear = sb.getElement().querySelector<HTMLElement>(".json-search-clear")!;
  input.value = "x";
  input.dispatchEvent(new Event("input"));
  sb.setMatchInfo({ matchCount: 5 });
  sb.clear();
  expect(input.value).toBe("");
  expect(clear.hidden).toBe(true);
});
```

- [ ] **Step 2: Verify pass** — should all pass with the Task-5 implementation.

- [ ] **Step 3: Commit**

```bash
git add tests/obsidian/SearchBar.test.ts
git commit -m "test(obsidian): SearchBar input/clear/ESC/match-count

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `TreeView.applyFilter` — class application

**Files:**
- Modify: `src/obsidian/TreeView.ts`
- Modify: `tests/obsidian/TreeView.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/obsidian/TreeView.test.ts`:

```ts
describe("TreeView.applyFilter", () => {
  let container: HTMLElement;
  let tv: TreeView;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    tv = new TreeView(container, {});
    tv.setValue({
      config: { server: { port: 8080, host: "localhost" } },
      database: { connection: { port: 5432 } },
    });
  });

  it("empty query returns matchCount 0 and adds no filter classes", () => {
    const r = tv.applyFilter("");
    expect(r.matchCount).toBe(0);
    expect(container.querySelectorAll(".json-match").length).toBe(0);
    expect(container.querySelector(".json-tree-root")?.classList.contains("json-filter-active")).toBe(false);
  });

  it("non-empty query marks matching rows with json-match", () => {
    const r = tv.applyFilter("port");
    expect(r.matchCount).toBe(2);
    const matched = container.querySelectorAll(".json-match");
    const paths = Array.from(matched).map((el) => el.getAttribute("data-path"));
    expect(paths).toContain("config.server.port");
    expect(paths).toContain("database.connection.port");
  });

  it("marks ancestor rows with json-on-path", () => {
    tv.applyFilter("port");
    const onPath = Array.from(container.querySelectorAll(".json-on-path"))
      .map((el) => el.getAttribute("data-path"));
    expect(onPath).toContain("config");
    expect(onPath).toContain("config.server");
    expect(onPath).toContain("database");
    expect(onPath).toContain("database.connection");
  });

  it("adds json-filter-active to the tree root", () => {
    tv.applyFilter("port");
    const root = container.querySelector(".json-tree-root")!;
    expect(root.classList.contains("json-filter-active")).toBe(true);
  });

  it("applyFilter('') after a non-empty query removes all filter classes", () => {
    tv.applyFilter("port");
    tv.applyFilter("");
    expect(container.querySelectorAll(".json-match").length).toBe(0);
    expect(container.querySelectorAll(".json-on-path").length).toBe(0);
    expect(container.querySelector(".json-tree-root")?.classList.contains("json-filter-active")).toBe(false);
  });

  it("returns matchCount 0 for non-empty query with no matches", () => {
    const r = tv.applyFilter("nonexistent");
    expect(r.matchCount).toBe(0);
    // filter-active still set so CSS hides everything
    expect(container.querySelector(".json-tree-root")?.classList.contains("json-filter-active")).toBe(true);
  });
});
```

(Add `import { describe, it, expect, beforeEach } from "vitest"` if not already present; the existing test file has its own describe — these can sit alongside as a second `describe` block.)

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Implement `applyFilter`**

Add to `src/obsidian/TreeView.ts` (alongside existing methods):

```ts
applyFilter(query: string): { matchCount: number } {
  const treeRoot = this.container.querySelector<HTMLElement>(".json-tree-root");
  if (!treeRoot) return { matchCount: 0 };

  // Clear prior filter state
  treeRoot.classList.remove("json-filter-active");
  treeRoot.querySelectorAll(".json-match, .json-on-path").forEach((el) => {
    el.classList.remove("json-match", "json-on-path");
  });

  if (query.trim() === "") return { matchCount: 0 };

  const result = findMatches(this.current, query, { matchKeys: true, matchValues: true });

  // Mark matches
  for (const pathStr of result.matches) {
    const row = treeRoot.querySelector<HTMLElement>(
      `[data-path="${cssEscapeAttr(pathStr)}"]`
    );
    row?.classList.add("json-match");
  }

  // Mark on-path ancestors
  for (const pathStr of result.onPath) {
    if (pathStr === "root") continue;
    const row = treeRoot.querySelector<HTMLElement>(
      `[data-path="${cssEscapeAttr(pathStr)}"]`
    );
    row?.classList.add("json-on-path");
  }

  treeRoot.classList.add("json-filter-active");
  this.openContainersWithMatches(treeRoot);

  return { matchCount: result.matches.size };
}

private openContainersWithMatches(treeRoot: HTMLElement): void {
  treeRoot
    .querySelectorAll<HTMLElement>(".json-on-path .json-container.is-collapsed, .json-match .json-container.is-collapsed")
    .forEach((container) => {
      const content = container.querySelector<HTMLElement>(":scope > .json-content");
      const toggle = container.querySelector<HTMLElement>(":scope > .json-collapse-toggle");
      if (content) content.classList.remove("collapsed");
      container.classList.remove("is-collapsed");
      toggle?.classList.add("is-open");
    });
}
```

Add import at top of `TreeView.ts`:

```ts
import { findMatches } from "../core/search";
```

- [ ] **Step 4: Run — verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/TreeView.ts tests/obsidian/TreeView.test.ts
git commit -m "feat(obsidian): TreeView.applyFilter — strict-filter CSS class application

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Auto-expand collapsed containers with matches

**Files:**
- Modify: `tests/obsidian/TreeView.test.ts`

- [ ] **Step 1: Add failing test**

```ts
it("auto-expands auto-collapsed containers that contain a match", () => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  tv = new TreeView(container, { autoCollapseDepth: 0 });
  tv.setValue({ outer: { inner: { needle: 1 } } });

  // Verify outer is collapsed before filtering
  const outerContainer = container.querySelector(".json-row[data-path='outer'] .json-container");
  // (depending on render structure — adjust selector if needed)

  tv.applyFilter("needle");
  // After filter: all on-path containers should be open (is-collapsed removed)
  const collapsed = container.querySelectorAll(".json-on-path .json-container.is-collapsed");
  expect(collapsed.length).toBe(0);
});
```

- [ ] **Step 2: Verify pass** — should pass with Task-7 impl.

- [ ] **Step 3: Commit**

```bash
git add tests/obsidian/TreeView.test.ts
git commit -m "test(obsidian): verify applyFilter auto-expands collapsed containers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `JsonFileView` — SearchBar integration

**Files:**
- Modify: `src/obsidian/JsonFileView.ts`
- Modify: `tests/obsidian/JsonFileView.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe("JsonFileView SearchBar integration", () => {
  // Use the existing test scaffolding pattern — create view, set data, assert chrome

  it("toolbar contains a SearchBar in tree mode", async () => {
    const { view } = await makeView({ defaultMode: "tree" });
    view.setViewData('{"port": 8080}', false);
    const sb = view.contentEl.querySelector(".json-search-bar");
    expect(sb).toBeInstanceOf(HTMLElement);
  });

  it("SearchBar is hidden in source mode", async () => {
    const { view } = await makeView({ defaultMode: "source" });
    view.setViewData('{"port": 8080}', false);
    const sb = view.contentEl.querySelector<HTMLElement>(".json-search-bar");
    expect(sb?.hidden).toBe(true);
  });

  it("typing in SearchBar filters the tree", async () => {
    const { view } = await makeView({ defaultMode: "tree" });
    view.setViewData('{"port": 8080, "host": "localhost"}', false);
    const input = view.contentEl.querySelector<HTMLInputElement>(".json-search-input")!;
    input.value = "port";
    input.dispatchEvent(new Event("input"));
    const matches = view.contentEl.querySelectorAll(".json-match");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("query persists through mode-switch tree→source→tree", async () => {
    const { view } = await makeView({ defaultMode: "tree" });
    view.setViewData('{"port": 8080, "host": "localhost"}', false);
    const input = view.contentEl.querySelector<HTMLInputElement>(".json-search-input")!;
    input.value = "port";
    input.dispatchEvent(new Event("input"));
    // Switch to source
    view.contentEl.querySelector<HTMLButtonElement>(".json-mode-pill:nth-child(2)")?.click();
    // Switch back to tree
    view.contentEl.querySelector<HTMLButtonElement>(".json-mode-pill:nth-child(1)")?.click();
    // Filter should re-applied
    const matches = view.contentEl.querySelectorAll(".json-match");
    expect(matches.length).toBeGreaterThan(0);
    const newInput = view.contentEl.querySelector<HTMLInputElement>(".json-search-input")!;
    expect(newInput.value).toBe("port");
  });
});
```

(Use whatever existing `makeView` helper the test file uses; if there isn't one, follow the existing test setup pattern in `JsonFileView.test.ts`.)

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Wire SearchBar into JsonFileView**

In `src/obsidian/JsonFileView.ts`:

Add property:

```ts
private searchBar!: SearchBar;
private currentQuery = "";
```

Add import:

```ts
import { SearchBar } from "./SearchBar";
```

In `buildChrome()`, insert SearchBar after Breadcrumb and before toggleEl:

```ts
this.searchBar = new SearchBar({
  onQueryChange: (q) => this.onQueryChange(q),
});
this.toolbarEl.appendChild(this.breadcrumb.getElement());
this.toolbarEl.appendChild(this.searchBar.getElement());
this.toolbarEl.appendChild(this.toggleEl);
```

Add method:

```ts
private onQueryChange(query: string): void {
  this.currentQuery = query;
  if (this.treeView) {
    const result = this.treeView.applyFilter(query);
    this.searchBar.setMatchInfo(query.trim() === "" ? null : { matchCount: result.matchCount });
  }
}
```

In `refreshMode()`, after creating treeView/sourceView, re-apply filter and toggle visibility:

```ts
// At the end of refreshMode(), after this.treeView.setValue / this.sourceView.setValue:
this.searchBar.getElement().hidden = this.mode !== "tree";
if (this.mode === "tree" && this.treeView && this.currentQuery !== "") {
  const result = this.treeView.applyFilter(this.currentQuery);
  this.searchBar.setMatchInfo({ matchCount: result.matchCount });
}
```

In `onunload`:

```ts
this.searchBar.destroy();
```

In `renderEmptyState`, hide the search bar too:

```ts
this.searchBar.getElement().hidden = true;
```

- [ ] **Step 4: Run — verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/JsonFileView.ts tests/obsidian/JsonFileView.test.ts
git commit -m "feat(obsidian): wire SearchBar into JsonFileView with query persistence

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Plugin command — `Cmd/Ctrl+F` focus

**Files:**
- Modify: `src/main.ts`
- Modify: `src/obsidian/JsonFileView.ts`

- [ ] **Step 1: Add public `focusSearch()` method to JsonFileView**

```ts
focusSearch(): void {
  if (this.mode !== "tree") {
    this.switchTo("tree");
  }
  this.searchBar.focus();
}
```

- [ ] **Step 2: Register command in `src/main.ts`**

In `onload()`, after `registerExtensions`:

```ts
this.addCommand({
  id: "focus-search",
  name: "Focus JSON search",
  hotkeys: [{ modifiers: ["Mod"], key: "f" }],
  checkCallback: (checking: boolean) => {
    const view = this.app.workspace.getActiveViewOfType(JsonFileView);
    if (!view) return false;
    if (!checking) view.focusSearch();
    return true;
  },
});
```

- [ ] **Step 3: Run all tests — confirm no regression**

(No test for the command — it's plumbing that obsidian's mock doesn't easily simulate. Manual smoke test will catch it.)

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/obsidian/JsonFileView.ts
git commit -m "feat(obsidian): Cmd/Ctrl+F focuses the JSON search bar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Styles — SearchBar + match-highlight + strict-hide

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add tokens to `.json-tree-root` block**

Find the existing `.json-tree-root { ... }` token block. Append:

```css
--jv-match-bg: var(--text-highlight-bg, rgba(255, 214, 10, 0.3));
--jv-match-fg: var(--text-normal);
```

- [ ] **Step 2: Add SearchBar styles**

Anywhere in the toolbar section of `styles.css`:

```css
.json-search-bar {
  display: flex;
  align-items: center;
  gap: var(--jv-space-2, 0.5em);
  background: var(--jv-bg-inset);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-sm, 4px);
  padding: var(--jv-space-1, 0.25em) var(--jv-space-2, 0.5em);
  flex: 1;
  min-width: 0;
  max-width: 32em;
  transition: border-color 0.15s ease;
}

.json-search-bar:focus-within {
  border-color: var(--jv-accent);
}

.json-search-icon {
  flex-shrink: 0;
  color: var(--jv-fg-muted);
}

.json-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--jv-fg);
  font-family: var(--font-interface);
  font-size: inherit;
}

.json-search-count {
  color: var(--jv-fg-muted);
  font-size: 0.85em;
  white-space: nowrap;
}

.json-search-count.is-empty {
  color: var(--jv-fg-faint);
}

.json-search-clear {
  background: none;
  border: none;
  color: var(--jv-fg-muted);
  cursor: pointer;
  padding: 0 var(--jv-space-1, 0.25em);
  font-size: 1.2em;
  line-height: 1;
}

.json-search-clear:hover {
  color: var(--jv-fg);
}
```

- [ ] **Step 3: Add filter-mode styles**

```css
/* Strict-filter hiding */
.json-tree-root.json-filter-active .json-row:not(.json-match):not(.json-on-path) {
  display: none;
}

/* Match highlight — applies to the key or primitive inside the matched row */
.json-tree-root .json-match > .json-key,
.json-tree-root .json-match > .json-string,
.json-tree-root .json-match > .json-number,
.json-tree-root .json-match > .json-boolean,
.json-tree-root .json-match > .json-null {
  background: var(--jv-match-bg);
  border-radius: 2px;
  padding: 0 2px;
}
```

- [ ] **Step 4: Update toolbar to host the search bar properly**

Find existing `.json-toolbar` rule. Make sure it has flex behavior compatible with a stretching SearchBar between Breadcrumb and toggle. If not already there:

```css
.json-toolbar {
  display: flex;
  align-items: center;
  gap: var(--jv-space-2, 0.5em);
}

.json-toolbar .json-breadcrumb {
  flex-shrink: 1;
  min-width: 0;
}
```

(Leave existing properties intact — only add/adjust if missing.)

- [ ] **Step 5: Run `npm run build` to confirm clean build**

- [ ] **Step 6: Commit**

```bash
git add styles.css
git commit -m "feat: SearchBar + match highlight + strict-filter hiding styles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Version bump + CHANGELOG + README

**Files:**
- Modify: `manifest.json`, `package.json`, `versions.json`
- Modify: `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Bump versions**

`manifest.json`: `0.1.2` → `0.2.0`
`package.json`: `0.1.2` → `0.2.0`
`versions.json`: append `"0.2.0": "1.4.0"`

- [ ] **Step 2: CHANGELOG**

Replace `## [Unreleased]` block with:

```markdown
## [Unreleased]

## [0.2.0] — 2026-05-27

### Added
- **Search & Filter** — live search bar in the tree-view toolbar, strict-filters the tree to keys and primitive values matching the query (case-insensitive substring). Ancestors of matches stay visible; everything else is hidden. Cmd/Ctrl+F focuses the search; ESC clears or blurs. Match count shown next to the input.

### Changed
- Toolbar layout now hosts SearchBar between Breadcrumb and mode toggle (flex-stretch up to 32em).
- TreeView gains `applyFilter(query) → { matchCount }` API.
- `core/search.ts` adds pure `findMatches(value, query, opts?)` for match computation.
```

Update link footer:

```markdown
[Unreleased]: https://codeberg.org/jkaindl/json-editor/compare/0.2.0...HEAD
[0.2.0]: https://codeberg.org/jkaindl/json-editor/releases/tag/0.2.0
```

- [ ] **Step 3: README**

Update badge:

```markdown
[![Codeberg Release](https://img.shields.io/badge/codeberg-v0.2.0-green)](https://codeberg.org/jkaindl/json-editor/releases)
```

Update Status callout to mention 0.2.0.

Add bullet to Features:

```markdown
- **Search & filter** — Cmd/Ctrl+F in tree mode opens a live filter that hides everything except matching keys/values and their ancestor chain. Case-insensitive substring.
```

Update test-count badge if applicable.

- [ ] **Step 4: Run all tests + build — confirm clean**

```bash
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add manifest.json package.json versions.json CHANGELOG.md README.md
git commit -m "chore(release): 0.2.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Merge feature branch to main

**Files:** none.

- [ ] **Step 1: Final test + build sanity check**

```bash
npm test
npm run build
```

- [ ] **Step 2: Merge with --no-ff**

```bash
git checkout main
git merge --no-ff feat/0.2.0-search-filter -m "Merge branch 'feat/0.2.0-search-filter' into main

0.2.0 — Search & Filter: live filter in tree-view toolbar, strict-hides
non-matches, keeps ancestor chain visible. Pure findMatches() in core,
DOM-class applicator in TreeView, no renderer changes. Cmd/Ctrl+F to
focus, ESC to clear/blur, match count in the bar.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Delete feature branch**

```bash
git branch -d feat/0.2.0-search-filter
```

- [ ] **Step 4: Push main** (to both remotes — Codeberg + GitHub)

```bash
git push origin main
git push github main
```

(Tag push happens separately — pause here for user approval since auto-mode classifier blocks tag pushes that trigger the GitHub Release workflow.)

---

## Task 14: Tag + push 0.2.0 release

**Files:** none.

- [ ] **Step 1: Annotated tag**

```bash
git tag -a 0.2.0 -m "0.2.0 — Search & Filter

Live filter in tree-view toolbar. Strict-hides non-matches, keeps
ancestor chain visible. Cmd/Ctrl+F to focus, ESC to clear/blur.
Pure core/search.ts + TreeView.applyFilter() — renderer untouched."
```

- [ ] **Step 2: Push tag (REQUIRES USER APPROVAL — auto-mode blocks otherwise)**

```bash
git push origin 0.2.0
git push github 0.2.0
```

GitHub Actions release workflow will then build + create the release page automatically.

---

## Definition of Done (mirrors spec §16)

- [ ] All tasks above completed in order with commits.
- [ ] `npm test` green (133 + ~30 new tests ≈ 165+).
- [ ] `npm run build` clean.
- [ ] Plugin copied into `/Users/Shared/10_ObsidianVaults/X1_v6t2b9/.obsidian/plugins/obsidian-json-editor/` and manual Cmd+R smoke-tested.
- [ ] Merge commit on `main`, both remotes pushed.
- [ ] Tag `0.2.0` pushed (after user approval).
- [ ] GitHub Release page live with assets.
