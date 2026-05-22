# Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Direction-B visual redesign of the obsidian-json-editor — nested tinted blocks, collapse chips, SVG icons, a unified toolbar and a fully token-based theme-aware stylesheet.

**Architecture:** The redesign is mostly a `styles.css` rewrite, plus targeted DOM changes in `core/render.ts` (depth attribute, SVG chevron, collapse chip), `obsidian/CodeblockProcessor.ts` (card wrapper, big-block auto-collapse, error card) and `obsidian/JsonFileView.ts` (unified toolbar, empty-state polish). Existing `.json-*` class names are kept so the 122-test suite stays largely intact. No new settings.

**Tech Stack:** TypeScript, Vitest (jsdom), esbuild, Obsidian plugin API, CodeMirror 6. CSS uses Obsidian CSS variables.

**Source of truth:** `docs/superpowers/specs/2026-05-22-visual-redesign-design.md`. Reference CSS: `design/plugin-build/styles.css` (theme-aware layer — adapt `.je-*` → `.json-*`, `--je-*`/`--kuro-*` → `--jv-*`).

**Out of scope:** Kuro lore layer, new settings, search/filter (v1.2), keyboard nav & dirty-state (v1.3), version bump / git tag / remote push (separate release step).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/core/render.ts` | Modify | Add `data-depth`, SVG chevron, collapse chip + `is-collapsed` class |
| `src/obsidian/CodeblockProcessor.ts` | Modify | Card wrapper + header, big-block auto-collapse, error card |
| `src/obsidian/JsonFileView.ts` | Modify | Unified `.json-toolbar`, empty-state DOM polish |
| `styles.css` | Rewrite | Full token-based theme-aware stylesheet, all components |
| `tests/core/render.test.ts` | Modify | +3 tests (depth, chevron, chip) |
| `tests/obsidian/CodeblockProcessor.test.ts` | Modify | Rewrite error test, +2 tests (card, auto-collapse) |
| `tests/obsidian/JsonFileView.test.ts` | Modify | Rewrite toolbar-structure test |

---

## Task 0: Feature branch

- [ ] **Step 1: Create and switch to the feature branch**

Run: `git checkout -b feat/visual-redesign`
Expected: `Switched to a new branch 'feat/visual-redesign'`

- [ ] **Step 2: Confirm clean baseline**

Run: `npm test`
Expected: all tests pass (122).

---

## Task 1: render.ts — `data-depth` on containers

The nesting-tint cap (spec §4.5) needs the depth on the DOM. `renderObject`/`renderArray` already receive a `depth` parameter; expose it.

**Files:**
- Modify: `src/core/render.ts`
- Test: `tests/core/render.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/core/render.test.ts` inside the `describe`:

```typescript
it("annotates containers with a data-depth attribute", () => {
  const el = renderTree({ a: { b: 1 } }, {});
  const root = el.querySelector(".json-container") as HTMLElement;
  expect(root.dataset.depth).toBe("0");
  const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
  expect(nested.dataset.depth).toBe("1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/render.test.ts -t "data-depth"`
Expected: FAIL — `dataset.depth` is `undefined`.

- [ ] **Step 3: Implement**

In `src/core/render.ts`, in **both** `renderObject` and `renderArray`, immediately after `container.className = "json-container";` add:

```typescript
  container.dataset.depth = String(depth);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/render.test.ts`
Expected: PASS (all render tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/render.ts tests/core/render.test.ts
git commit -m "$(cat <<'EOF'
feat(core): expose nesting depth as data-depth on tree containers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: render.ts — SVG chevron toggle

Replace the `▼`/`▶` text glyphs with a single SVG chevron rotated via the `is-open` class (spec §5.5).

**Files:**
- Modify: `src/core/render.ts`
- Test: `tests/core/render.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/core/render.test.ts`:

```typescript
it("renders the collapse toggle as an SVG chevron with is-open when expanded", () => {
  const el = renderTree({ a: { b: 1 } }, {});
  const toggle = el.querySelector(".json-collapse-toggle") as HTMLElement;
  expect(toggle.querySelector("svg")).not.toBeNull();
  expect(toggle.classList.contains("is-open")).toBe(true);
});

it("removes is-open from the toggle when collapsed", () => {
  const el = renderTree({ a: { b: 1 } }, {});
  document.body.appendChild(el);
  const toggle = el.querySelector(".json-collapse-toggle") as HTMLElement;
  toggle.click();
  expect(toggle.classList.contains("is-open")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/render.test.ts -t "chevron"`
Expected: FAIL — no `svg`, no `is-open` class.

- [ ] **Step 3: Implement**

In `src/core/render.ts`, add this helper near the bottom (next to `markerFor`):

```typescript
function makeChevron(): SVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 10 10");
  svg.setAttribute("width", "9");
  svg.setAttribute("height", "9");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "M3 1 L7 5 L3 9");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}
```

In **both** `renderObject` and `renderArray`, replace `toggle.textContent = "▼";` with:

```typescript
  toggle.appendChild(makeChevron());
```

Replace the initial-collapse glyph line `if (shouldCollapse) toggle.textContent = "▶";` with:

```typescript
  if (!shouldCollapse) toggle.classList.add("is-open");
```

In the toggle `click` handler, replace `toggle.textContent = collapsed ? "▶" : "▼";` with:

```typescript
    toggle.classList.toggle("is-open", !collapsed);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/render.test.ts`
Expected: PASS (incl. the existing "toggles collapse state" test).

- [ ] **Step 5: Commit**

```bash
git add src/core/render.ts tests/core/render.test.ts
git commit -m "$(cat <<'EOF'
feat(core): use an SVG chevron for the collapse toggle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: render.ts — collapse chip + `is-collapsed` class

When a node is collapsed, show a pill chip (`{ N keys }` / `[ N items ]`) instead of the empty brackets (spec §5.5). CSS keys off `is-collapsed` on `.json-container`.

**Files:**
- Modify: `src/core/render.ts`
- Test: `tests/core/render.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/core/render.test.ts`:

```typescript
it("renders a collapse chip with the child count for objects", () => {
  const el = renderTree({ a: { x: 1, y: 2 } }, {});
  const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
  const chip = nested.querySelector(".json-collapse-chip") as HTMLElement;
  expect(chip).not.toBeNull();
  expect(chip.textContent).toBe("{ 2 keys }");
});

it("renders a singular collapse chip for arrays with one item", () => {
  const el = renderTree({ a: [99] }, {});
  const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
  const chip = nested.querySelector(".json-collapse-chip") as HTMLElement;
  expect(chip.textContent).toBe("[ 1 item ]");
});

it("adds is-collapsed to the container when collapsed", () => {
  const el = renderTree({ a: { b: 1 } }, {});
  document.body.appendChild(el);
  const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
  const toggle = nested.querySelector(".json-collapse-toggle") as HTMLElement;
  expect(nested.classList.contains("is-collapsed")).toBe(false);
  toggle.click();
  expect(nested.classList.contains("is-collapsed")).toBe(true);
});

it("starts collapsed containers with is-collapsed set", () => {
  const el = renderTree({ a: { b: { c: 1 } } }, { autoCollapseDepth: 1 });
  const collapsed = el.querySelector(".json-container.is-collapsed");
  expect(collapsed).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/render.test.ts -t "chip"`
Expected: FAIL — no `.json-collapse-chip`.

- [ ] **Step 3: Implement**

In `src/core/render.ts`, add this helper near `markerFor`:

```typescript
function collapseChipLabel(count: number, kind: "object" | "array"): string {
  const noun = kind === "object" ? "key" : "item";
  const text = `${count} ${noun}${count === 1 ? "" : "s"}`;
  return kind === "object" ? `{ ${text} }` : `[ ${text} ]`;
}
```

In `renderObject`, **replace** `container.appendChild(document.createTextNode("{"));` with an open-bracket span (so CSS can hide it when collapsed) followed by the chip:

```typescript
  const openBracket = document.createElement("span");
  openBracket.className = "json-bracket";
  openBracket.textContent = "{";
  container.appendChild(openBracket);

  const chip = document.createElement("span");
  chip.className = "json-collapse-chip";
  chip.textContent = collapseChipLabel(entries.length, "object");
  container.appendChild(chip);
```

Change the `shouldCollapse` block so it also flags the container. Replace:

```typescript
  if (shouldCollapse) content.classList.add("collapsed");
  if (!shouldCollapse) toggle.classList.add("is-open");
```

with:

```typescript
  if (shouldCollapse) {
    content.classList.add("collapsed");
    container.classList.add("is-collapsed");
  } else {
    toggle.classList.add("is-open");
  }
```

In the `click` handler, after `const collapsed = content.classList.toggle("collapsed");` add:

```typescript
    container.classList.toggle("is-collapsed", collapsed);
```

Apply the identical edits to `renderArray`: replace `container.appendChild(document.createTextNode("["));` with an open-bracket span (`"["`) plus the chip using `collapseChipLabel(arr.length, "array")`, the `shouldCollapse` block, and the click-handler container toggle.

> Note: the empty-object/empty-array early-return branches are unchanged — they have no toggle and no chip.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/render.test.ts`
Expected: PASS (all render tests, incl. existing collapse/autoCollapse tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/render.ts tests/core/render.test.ts
git commit -m "$(cat <<'EOF'
feat(core): show a count chip for collapsed tree nodes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: CodeblockProcessor — card wrapper + header

Wrap the embedded read-only tree in a `.json-codeblock` card with a `.json-codeblock-head` (a "JSON" label + a copy button that copies the raw source). Spec §5.10.

**Files:**
- Modify: `src/obsidian/CodeblockProcessor.ts`
- Test: `tests/obsidian/CodeblockProcessor.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/obsidian/CodeblockProcessor.test.ts`:

```typescript
it("wraps valid JSON in a .json-codeblock card with a header label", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderJsonCodeblock('{"a": 1}', el, fakeCtx(), DEFAULT_SETTINGS);
  const card = el.querySelector(".json-codeblock");
  expect(card).not.toBeNull();
  expect(card?.querySelector(".json-codeblock-head")).not.toBeNull();
  expect(card?.querySelector(".json-codeblock-copy")).not.toBeNull();
  expect(card?.querySelector(".json-tree-root")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts -t "card"`
Expected: FAIL — no `.json-codeblock`.

- [ ] **Step 3: Implement**

Rewrite the success branch of `renderJsonCodeblock` in `src/obsidian/CodeblockProcessor.ts`. Replace the body of the function's `if (parsed.ok)` path so that instead of `el.appendChild(tree)` it builds a card:

```typescript
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
  const card = document.createElement("div");
  card.className = "json-codeblock";

  const head = document.createElement("div");
  head.className = "json-codeblock-head";
  const label = document.createElement("span");
  label.className = "json-codeblock-label";
  label.textContent = "JSON";
  head.appendChild(label);
  head.appendChild(makeCopyButton(source));
  card.appendChild(head);

  const tree = renderTree(parsed.value, {
    readonly: true,
    markerStyle: settings.markerStyle,
    autoCollapseDepth: settings.autoCollapseDepth,
  });
  card.appendChild(tree);
  el.appendChild(card);
}

function makeCopyButton(source: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "json-codeblock-copy";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", () => {
    navigator.clipboard?.writeText(source).then(
      () => {
        btn.classList.add("copied");
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = "Copy";
        }, 800);
      },
      () => {
        /* clipboard unavailable — no UI */
      }
    );
  });
  return btn;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts`
Expected: PASS — note the existing "renders a tree", "read-only", "empty object" tests still pass (the tree is now inside the card).

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/CodeblockProcessor.ts tests/obsidian/CodeblockProcessor.test.ts
git commit -m "$(cat <<'EOF'
feat(obsidian): wrap embedded JSON blocks in a titled card

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CodeblockProcessor — auto-collapse big blocks

Embedded blocks longer than 20 lines start collapsed so they don't flood the note (spec §5.10). Achieved by passing `autoCollapseDepth: -1` (collapses the root container itself).

**Files:**
- Modify: `src/obsidian/CodeblockProcessor.ts`
- Test: `tests/obsidian/CodeblockProcessor.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/obsidian/CodeblockProcessor.test.ts`:

```typescript
it("starts blocks longer than 20 lines collapsed", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const obj: Record<string, number> = {};
  for (let i = 0; i < 25; i++) obj[`k${i}`] = i;
  const source = JSON.stringify(obj, null, 2); // 27 lines
  renderJsonCodeblock(source, el, fakeCtx(), DEFAULT_SETTINGS);
  expect(el.querySelector(".json-content.collapsed")).not.toBeNull();
});

it("keeps short blocks expanded", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderJsonCodeblock('{"a": {"b": 1}}', el, fakeCtx(), DEFAULT_SETTINGS);
  const root = el.querySelector(".json-tree-root > .json-container") as HTMLElement;
  expect(root.classList.contains("is-collapsed")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts -t "20 lines"`
Expected: FAIL — big block is not collapsed.

- [ ] **Step 3: Implement**

In `src/obsidian/CodeblockProcessor.ts`, inside `renderJsonCodeblock`, before the `renderTree` call, compute the collapse depth:

```typescript
  const lineCount = source.split("\n").length;
  const autoCollapseDepth = lineCount > 20 ? -1 : settings.autoCollapseDepth;
```

Change the `renderTree` options to use it:

```typescript
  const tree = renderTree(parsed.value, {
    readonly: true,
    markerStyle: settings.markerStyle,
    autoCollapseDepth,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/CodeblockProcessor.ts tests/obsidian/CodeblockProcessor.test.ts
git commit -m "$(cat <<'EOF'
feat(obsidian): auto-collapse embedded JSON blocks over 20 lines

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CodeblockProcessor — error card

Replace the `.json-codeblock-fallback` / `.json-codeblock-error-indicator` fallback with a `.json-codeblock` card whose header is error-styled and whose body is a compact error line (spec §5.10).

**Files:**
- Modify: `src/obsidian/CodeblockProcessor.ts`
- Test: `tests/obsidian/CodeblockProcessor.test.ts`

- [ ] **Step 1: Rewrite the failing test**

In `tests/obsidian/CodeblockProcessor.test.ts`, **replace** the existing test `"falls back to a default code-block render with an indicator on parse error"` with:

```typescript
it("renders an error card on parse error", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderJsonCodeblock("{not valid}", el, fakeCtx(), DEFAULT_SETTINGS);
  expect(el.querySelector(".json-tree-root")).toBeNull();
  const card = el.querySelector(".json-codeblock.is-error");
  expect(card).not.toBeNull();
  expect(card?.querySelector(".json-codeblock-head")).not.toBeNull();
  expect(card?.querySelector(".json-codeblock-error")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts -t "error card"`
Expected: FAIL — no `.json-codeblock.is-error`.

- [ ] **Step 3: Implement**

In `src/obsidian/CodeblockProcessor.ts`, **replace** the `renderFallback` function with:

```typescript
function renderFallback(_source: string, el: HTMLElement, errorMessage: string): void {
  const card = document.createElement("div");
  card.className = "json-codeblock is-error";

  const head = document.createElement("div");
  head.className = "json-codeblock-head";
  const label = document.createElement("span");
  label.className = "json-codeblock-label";
  label.textContent = "JSON · Error";
  head.appendChild(label);
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "json-codeblock-error";
  body.textContent = `Invalid JSON: ${errorMessage}`;
  card.appendChild(body);

  el.appendChild(card);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/CodeblockProcessor.test.ts`
Expected: PASS (all 6 codeblock tests).

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/CodeblockProcessor.ts tests/obsidian/CodeblockProcessor.test.ts
git commit -m "$(cat <<'EOF'
feat(obsidian): show a styled error card for invalid embedded JSON

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: JsonFileView — unified toolbar

Wrap the mode-toggle and the breadcrumb in a single `.json-toolbar` row (breadcrumb left, toggle right). Spec §5.1.

**Files:**
- Modify: `src/obsidian/JsonFileView.ts`
- Test: `tests/obsidian/JsonFileView.test.ts`

- [ ] **Step 1: Rewrite the failing test**

In `tests/obsidian/JsonFileView.test.ts`, **replace** the test `"renders a .json-breadcrumb between the toggle and the body"` with:

```typescript
it("renders a .json-toolbar holding the breadcrumb and the mode toggle", () => {
  const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
  document.body.appendChild(v.contentEl);
  v.setViewData('{"a":1}', false);
  const toolbar = v.contentEl.querySelector(".json-toolbar");
  expect(toolbar).not.toBeNull();
  expect(toolbar?.querySelector(".json-breadcrumb")).not.toBeNull();
  expect(toolbar?.querySelector(".json-mode-toggle")).not.toBeNull();
  const children = Array.from(v.contentEl.children);
  const toolbarIdx = children.findIndex((c) => c.classList.contains("json-toolbar"));
  const bodyIdx = children.findIndex((c) => c.classList.contains("json-editor-body"));
  expect(toolbarIdx).toBeGreaterThanOrEqual(0);
  expect(bodyIdx).toBeGreaterThan(toolbarIdx);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/JsonFileView.test.ts -t "json-toolbar"`
Expected: FAIL — no `.json-toolbar`.

- [ ] **Step 3: Implement**

In `src/obsidian/JsonFileView.ts`, add a field next to the other element fields:

```typescript
  private toolbarEl!: HTMLDivElement;
```

In `buildChrome()`, **replace** the chrome-assembly section. The toggle and breadcrumb construction stays; only the parenting changes. Replace:

```typescript
    this.contentEl.appendChild(this.toggleEl);

    this.breadcrumb = new Breadcrumb({
      onSegmentClick: (subPath) => this.treeView?.scrollToPath(subPath),
    });
    this.contentEl.appendChild(this.breadcrumb.getElement());

    this.tooltip = new Tooltip();

    this.contentEl.appendChild(this.bodyEl);
```

with:

```typescript
    this.breadcrumb = new Breadcrumb({
      onSegmentClick: (subPath) => this.treeView?.scrollToPath(subPath),
    });

    this.toolbarEl = document.createElement("div");
    this.toolbarEl.className = "json-toolbar";
    this.toolbarEl.appendChild(this.breadcrumb.getElement());
    this.toolbarEl.appendChild(this.toggleEl);
    this.contentEl.appendChild(this.toolbarEl);

    this.tooltip = new Tooltip();

    this.contentEl.appendChild(this.bodyEl);
```

> `showBanner()` still does `contentEl.insertBefore(this.bannerEl, this.bodyEl)` — the banner lands between toolbar and body, which is correct. No change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/JsonFileView.test.ts`
Expected: PASS (all JsonFileView tests — pill/breadcrumb queries still resolve through the toolbar).

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/JsonFileView.ts tests/obsidian/JsonFileView.test.ts
git commit -m "$(cat <<'EOF'
feat(obsidian): merge breadcrumb and mode toggle into one toolbar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: JsonFileView — empty-state polish

Give the empty state a heading + hint structure (the `{ }` glyph is drawn via CSS `::before`). Spec §5.7.

**Files:**
- Modify: `src/obsidian/JsonFileView.ts`
- Test: `tests/obsidian/JsonFileView.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/obsidian/JsonFileView.test.ts`:

```typescript
it("empty state has a title and a hint line", () => {
  const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
  document.body.appendChild(v.contentEl);
  v.setViewData("", false);
  expect(v.contentEl.querySelector(".json-empty-state-title")).not.toBeNull();
  expect(v.contentEl.querySelector(".json-empty-state-hint")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/JsonFileView.test.ts -t "title and a hint"`
Expected: FAIL — no `.json-empty-state-title`.

- [ ] **Step 3: Implement**

In `src/obsidian/JsonFileView.ts`, **replace** the body of `renderEmptyState()` after `wrap.className = "json-empty-state";`. Replace:

```typescript
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
```

with:

```typescript
    const title = document.createElement("div");
    title.className = "json-empty-state-title";
    title.textContent = "This file is empty";
    const hint = document.createElement("div");
    hint.className = "json-empty-state-hint";
    hint.textContent = "Create an empty object to get started.";
    const btn = document.createElement("button");
    btn.className = "json-empty-state-init";
    btn.textContent = "Create empty object";
    btn.addEventListener("click", () => {
      this.setViewData("{}", false);
      this.requestSave();
    });
    wrap.appendChild(title);
    wrap.appendChild(hint);
    wrap.appendChild(btn);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/JsonFileView.test.ts`
Expected: PASS (incl. existing empty-state tests).

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/JsonFileView.ts tests/obsidian/JsonFileView.test.ts
git commit -m "$(cat <<'EOF'
feat(obsidian): give the empty state a title and hint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: styles.css — full token-based rewrite

Rewrite `styles.css` completely, per spec §4 (tokens) and §5 (components). No tests (CSS is not unit-tested); verified by build + manual install.

**Files:**
- Rewrite: `styles.css`

- [ ] **Step 1: Write the token block**

`styles.css` opens with the `--jv-` tokens scoped to the plugin roots (`.json-tree-root, .json-codeblock`). Verbatim:

```css
/* obsidian-json-editor — styles
   Direction B visual redesign. Theme-aware: colours derive from Obsidian
   CSS variables; hardcoded values appear only as var() fallbacks. */

.json-tree-root,
.json-codeblock,
.json-editor-body {
  /* Surfaces & foreground */
  --jv-bg: var(--background-primary);
  --jv-bg-panel: var(--background-secondary);
  --jv-bg-inset: var(--background-secondary-alt, var(--background-secondary));
  --jv-border: var(--background-modifier-border);
  --jv-border-hover: var(--background-modifier-border-hover, var(--background-modifier-border));
  --jv-hover: var(--background-modifier-hover);
  --jv-fg: var(--text-normal);
  --jv-fg-muted: var(--text-muted);
  --jv-fg-faint: var(--text-faint);
  --jv-accent: var(--interactive-accent);
  --jv-accent-text: var(--text-on-accent);

  /* JSON syntax palette */
  --jv-syntax-key: var(--color-cyan, #4ec9b0);
  --jv-syntax-string: var(--color-green, #6a9955);
  --jv-syntax-number: var(--color-blue, #569cd6);
  --jv-syntax-boolean: var(--color-purple, #c586c0);
  --jv-syntax-null: var(--text-faint);
  --jv-syntax-punct: var(--text-muted);

  /* Spacing */
  --jv-space-1: 2px;
  --jv-space-2: 4px;
  --jv-space-3: 6px;
  --jv-space-4: 8px;
  --jv-space-5: 12px;
  --jv-space-6: 16px;

  /* Radii */
  --jv-radius-sm: 4px;
  --jv-radius-md: 6px;
  --jv-radius-lg: 8px;

  /* Nesting tint */
  --jv-nest-tint: color-mix(in srgb, var(--background-modifier-border) 22%, transparent);

  /* Motion */
  --jv-dur-fast: 120ms;
  --jv-dur-base: 150ms;
  --jv-ease: ease-out;
}
```

- [ ] **Step 2: Write the component rules**

Append rules covering every component below. Use only `--jv-*` tokens for colour/spacing/radius. Keep the existing `.json-*` class names. Each component maps to a spec section:

- **`.json-toolbar`** (§5.1) — `display:flex; align-items:center; justify-content:space-between; gap:var(--jv-space-5); padding:var(--jv-space-4) var(--jv-space-5); background:var(--jv-bg-panel); border-bottom:1px solid var(--jv-border);`. The `.json-breadcrumb` inside flexes to fill; `.json-mode-toggle` stays auto-width.
- **`.json-breadcrumb` / `.bc-seg` / `.bc-sep`** (§5.1) — breadcrumb loses its own background/margin (toolbar owns those); `flex:1; display:flex; flex-wrap:wrap; gap:var(--jv-space-2); font-family:var(--font-interface); font-size:var(--font-ui-smaller);`. `.bc-seg` is a pill: `padding:var(--jv-space-1) var(--jv-space-3); border-radius:var(--jv-radius-sm); color:var(--jv-fg-muted); cursor:pointer;`. `.bc-seg:hover { background:var(--jv-hover); color:var(--jv-fg); }`. `.bc-seg-terminal { background:var(--jv-accent); color:var(--jv-accent-text); font-weight:600; }`. `.bc-sep { color:var(--jv-fg-faint); }`.
- **`.json-mode-toggle` / `.json-mode-pill`** (§5.1) — toggle is a segmented control: container `display:inline-flex; background:var(--jv-bg-inset); border:1px solid var(--jv-border); border-radius:var(--jv-radius-md); padding:var(--jv-space-1);`. Pills lose their individual borders/radius-corners; `border:0; background:transparent; border-radius:var(--jv-radius-sm); padding:var(--jv-space-2) var(--jv-space-5); color:var(--jv-fg-muted); font-size:var(--font-ui-small);`. `.json-mode-pill:hover:not(:disabled){ color:var(--jv-fg); }`. `.json-mode-pill.active { background:var(--jv-accent); color:var(--jv-accent-text); }`. `.json-mode-pill:disabled { opacity:0.4; cursor:not-allowed; }`.
- **`.json-editor-body`** — `padding:var(--jv-space-5); background:var(--jv-bg);`.
- **`.json-tree-root`** (§5.2) — `font-family:var(--font-monospace); font-size:var(--font-ui-small); line-height:1.6; color:var(--jv-fg);`.
- **`.json-container`** (§5.4) — nested blocks: `.json-container[data-depth="1"], .json-container[data-depth="2"], .json-container[data-depth="3"] { background:var(--jv-nest-tint); border-radius:var(--jv-radius-md); padding:var(--jv-space-2) 0; margin:var(--jv-space-2) 0; }`. Depth 0 and depth ≥ 4 get no tint (the cap — depth ≥ 4 sits visually on the depth-3 tint already).
- **`.json-content`** (§5.2, §5.5) — `display:block; padding-left:var(--jv-space-5); border-left:2px solid var(--jv-border); margin-left:var(--jv-space-3); max-height:5000px; opacity:1; overflow:hidden; transition:max-height var(--jv-dur-base) var(--jv-ease), opacity var(--jv-dur-fast) var(--jv-ease);`. `.json-content.collapsed { max-height:0; opacity:0; }`.
- **`.json-collapse-toggle`** (§5.5) — `display:inline-flex; align-items:center; justify-content:center; width:14px; cursor:pointer; color:var(--jv-fg-faint);`. The SVG: `transition:transform var(--jv-dur-base) var(--jv-ease);`. `.json-collapse-toggle.is-open svg { transform:rotate(90deg); }`. `.json-collapse-toggle:hover { color:var(--jv-fg); }`.
- **`.json-collapse-chip`** (§5.5) — hidden by default (`display:none;`), shown only when the container is collapsed: `.json-container.is-collapsed > .json-collapse-chip { display:inline-block; background:var(--jv-bg-inset); color:var(--jv-fg-muted); border-radius:var(--jv-radius-lg); padding:var(--jv-space-1) var(--jv-space-3); font-size:0.85em; }`. When collapsed, hide the literal brackets so only the chip shows: `.json-container.is-collapsed > .json-bracket { display:none; }` — both the open and close brackets are spans (Task 3 made the open one a span). The children are already hidden via `.json-content.collapsed`.

- [ ] **Step 2b: Remaining component rules**

- **`.json-row`** (§5.3) — `display:flex; align-items:center; padding:var(--jv-space-3) var(--jv-space-3); border-radius:var(--jv-radius-sm); transition:background var(--jv-dur-fast) var(--jv-ease); position:relative;`. Hover: `.json-row:hover { background:color-mix(in srgb, var(--jv-accent) 8%, transparent); box-shadow:inset 2px 0 0 0 var(--jv-accent); }`.
- **`.json-key`** — `color:var(--jv-syntax-key); font-family:var(--font-interface); font-weight:600; margin-right:var(--jv-space-3);`.
- **`.json-bracket`** — `color:var(--jv-syntax-punct);`. **`.json-index`** — `color:var(--jv-fg-faint); font-size:0.9em; margin-right:var(--jv-space-2);`. **`.json-marker`** — `color:var(--jv-fg-faint); margin-right:var(--jv-space-2); opacity:0.6;` (classic style, §5.2).
- **Value types** — `.json-string{color:var(--jv-syntax-string);word-break:break-word;}` `.json-number{color:var(--jv-syntax-number);}` `.json-boolean{color:var(--jv-syntax-boolean);}` `.json-null{color:var(--jv-syntax-null);font-style:italic;}`.
- **`.json-editable`** — `cursor:pointer; border-bottom:1px dotted transparent;` hover `border-bottom-color:var(--jv-fg-muted);`.
- **`.json-inline-edit`** (§5.3) — `font-family:var(--font-monospace); padding:var(--jv-space-1) var(--jv-space-3); border:1.5px solid var(--jv-accent); border-radius:var(--jv-radius-sm); background:var(--jv-bg); color:var(--jv-fg); box-shadow:0 0 0 3px color-mix(in srgb, var(--jv-accent) 15%, transparent);`.
- **`.json-copy-btn`** (§5.9) — `margin-left:auto; padding:0 var(--jv-space-3); font-size:0.85em; background:transparent; color:var(--jv-fg-muted); border:1px solid var(--jv-border); border-radius:var(--jv-radius-sm); cursor:pointer; opacity:0; transition:opacity var(--jv-dur-fast) var(--jv-ease);`. `.json-row:hover .json-copy-btn { opacity:0.7; }`. Hover-on-button → `opacity:1; color:var(--jv-fg); background:var(--jv-hover);`. `.copied { color:var(--text-success, var(--jv-syntax-string)); opacity:1; }`.
- **`.json-row-flash`** (§5.3) — `background:var(--jv-accent) !important; color:var(--jv-accent-text) !important;`.
- **`.json-error-banner`** (§5.6) — card: `margin:var(--jv-space-4) var(--jv-space-5); padding:var(--jv-space-4) var(--jv-space-5); background:color-mix(in srgb, var(--text-error) 10%, transparent); border:1px solid color-mix(in srgb, var(--text-error) 35%, transparent); border-left:3px solid var(--text-error); border-radius:var(--jv-radius-md); color:var(--text-error); font-family:var(--font-monospace); font-size:var(--font-ui-smaller);`. Icon via `::before { content:"⚠"; margin-right:var(--jv-space-3); }`.
- **`.json-empty-state`** (§5.7) — `display:flex; flex-direction:column; align-items:center; justify-content:center; gap:var(--jv-space-5); padding:64px var(--jv-space-6); color:var(--jv-fg-muted);`. Glyph via `::before { content:"{ }"; font-family:var(--font-monospace); font-size:34px; color:var(--jv-fg-faint); border:2px dashed var(--jv-border); border-radius:var(--jv-radius-lg); padding:var(--jv-space-4) var(--jv-space-6); }`. `.json-empty-state-title { color:var(--jv-fg); font-weight:600; font-size:1.1em; }`. `.json-empty-state-hint { color:var(--jv-fg-muted); font-size:var(--font-ui-smaller); }`. `.json-empty-state-init { padding:var(--jv-space-3) var(--jv-space-6); background:var(--jv-accent); color:var(--jv-accent-text); border:none; border-radius:var(--jv-radius-md); cursor:pointer; font-family:var(--font-interface); }`.
- **`.json-tooltip`** (§5.8) — `position:absolute; z-index:var(--layer-tooltip,100); padding:var(--jv-space-3) var(--jv-space-4); background:var(--jv-bg-panel); border:1px solid var(--jv-border); border-radius:var(--jv-radius-md); box-shadow:0 4px 14px rgba(0,0,0,0.3); font-size:var(--font-ui-smaller); max-width:320px; pointer-events:none;`. `.json-tooltip[hidden]{display:none;}`. `.tt-type` becomes a badge: `background:var(--jv-accent); color:var(--jv-accent-text); border-radius:var(--jv-radius-sm); padding:0 var(--jv-space-3); font-size:0.85em; font-weight:600; text-transform:uppercase;`. `.tt-meta{color:var(--jv-fg-muted);margin-bottom:var(--jv-space-3);}` `.tt-path{color:var(--jv-fg-muted);}` `.tt-preview{font-family:var(--font-monospace);color:var(--jv-fg);word-break:break-word;white-space:pre-wrap;}`.
- **`.json-codeblock`** (§5.10) — card: `margin:var(--jv-space-4) 0; border:1px solid var(--jv-border); border-radius:var(--jv-radius-md); background:var(--jv-bg-inset); overflow:hidden;`. `.json-codeblock-head{display:flex;align-items:center;justify-content:space-between;padding:var(--jv-space-3) var(--jv-space-5);background:var(--jv-bg-panel);border-bottom:1px solid var(--jv-border);}`. `.json-codeblock-label{font-size:0.8em;letter-spacing:0.05em;text-transform:uppercase;color:var(--jv-accent);}`. `.json-codeblock.is-error .json-codeblock-label{color:var(--text-error);}`. `.json-codeblock-copy{background:transparent;border:1px solid var(--jv-border);border-radius:var(--jv-radius-sm);color:var(--jv-fg-muted);font-size:0.8em;padding:0 var(--jv-space-3);cursor:pointer;}` `.json-codeblock-copy.copied{color:var(--text-success,var(--jv-syntax-string));}`. `.json-codeblock-error{padding:var(--jv-space-4) var(--jv-space-5);font-family:var(--font-monospace);font-size:var(--font-ui-smaller);color:var(--text-error);}`. `.json-codeblock .json-tree-root{padding:var(--jv-space-4) var(--jv-space-5);}`.
- **Reduced motion** — `@media (prefers-reduced-motion: reduce) { .json-content, .json-collapse-toggle svg, .json-row, .json-copy-btn { transition:none; } }`.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: `tsc` check passes, esbuild writes `main.js`. (CSS is shipped as-is, not bundled — the build only validates the TypeScript.)

- [ ] **Step 4: Commit**

```bash
git add styles.css src/core/render.ts
git commit -m "$(cat <<'EOF'
feat: token-based theme-aware stylesheet (Direction B redesign)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests pass (~129 — 122 original minus 2 rewritten plus ~9 added).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: clean build, `main.js` written.

- [ ] **Step 3: Visual smoke check**

Render the new `styles.css` against representative tree DOM in the Visual Companion browser (or install into the test vault `/Users/Shared/10_ObsidianVaults/X1_v6t2b9/.obsidian/plugins/obsidian-json-editor/` per `AGENTS.md` and reload Obsidian). Check: nested tinted blocks, collapse chips, toolbar, error banner, empty state, codeblock embed — in dark and light theme.

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: visual redesign polish after smoke testing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done criteria (from spec §9)

- [ ] `styles.css` fully token-based (`--jv-`), all §5 components covered.
- [ ] Works in dark and light; spot-checked in 2-3 community themes.
- [ ] No hardcoded colours except `var(..., #fallback)` fallbacks.
- [ ] No remote resources, no new settings.
- [ ] `render.ts` changes done; `npm run build` clean.
- [ ] Test suite green.
- [ ] `prefers-reduced-motion` disables transitions.
- [ ] Marketing screenshots — separate follow-up (needs the running plugin).

## Follow-ups (not in this plan)

- Marketing screenshots (spec §7) — produced once the redesigned plugin runs.
- Version bump, git tag, push to both remotes — release step, needs explicit go-ahead.
- Search/filter (v1.2), keyboard nav & dirty-state (v1.3) — see spec §10.
