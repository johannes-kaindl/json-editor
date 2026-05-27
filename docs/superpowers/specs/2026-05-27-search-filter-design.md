# 0.2.0 — Search & Filter — Design-Spec

**Projekt:** `obsidian-json-editor`
**Datum:** 2026-05-27
**Status:** Spec, freigegeben zur Umsetzung (user-approved Direction C — Hybrid)
**Entstanden aus:** Brainstorming-Session 2026-05-27

Diese Spec beschreibt das Feature vollständig genug, dass daraus ein Implementierungs-Plan ohne weitere Designentscheidungen entstehen kann.

---

## 1. Ziel & Kontext

Bei großen JSON-Files (Settings-Files, API-Responses, Logs) ist der Tree heute nicht navigierbar — der User muss alle Container manuell aufklappen und visuell durchscannen. Ein Live-Filter, der nur die Pfade übrig lässt die zu einer Query passen, macht den Viewer für reale Daten erstmals praktisch nutzbar.

Aus dem Backlog (`AGENTS.md` §"Backlog"): _„Live search input in chrome (between breadcrumb and body), Filter to matching keys/values; expand all ancestors of matches, Clear-button + ESC to reset"_.

---

## 2. Design-Prinzipien

1. **Strict filter.** Nicht-matchende Geschwister werden ausgeblendet — nicht gedimmt. Search-Results-Feel, kein Browser-Find-Feel.
2. **Keine neuen Settings.** Defaults-on, keine Toggles für Modus/Case-Sensitivity/Regex.
3. **Ephemeral.** Query wird nicht persistiert. File-Switch oder Plugin-Reload → leerer State.
4. **Core-pure.** Die Match-Berechnung lebt in `src/core/` als reine Funktion, ohne DOM. Vollständig unit-testbar ohne Obsidian-Mock.
5. **Kein Re-Render.** Der bestehende Tree wird nicht neu gebaut. Filter klassifiziert via CSS-Klassen und überlässt das Verstecken dem Stylesheet.
6. **Keyboard-erstklassig.** Cmd/Ctrl+F öffnet/focussiert; ESC clear+blur; Enter no-op (Filter ist instant).

---

## 3. Scope

**In Scope:**

- Search-Input in der View-Toolbar (nur sichtbar in Tree-Mode).
- Match-Berechnung gegen Object-Keys + Primitive-Werte.
- Strict-Filter-Rendering im Tree (matches sichtbar, ancestors sichtbar, alles andere `display: none`).
- Auto-Expand aller Container die einen Match enthalten.
- Match-Count-Badge.
- ESC + Clear-Button (×).
- Cmd/Ctrl+F-Hotkey zum Fokussieren des Inputs.
- Theme-aware Highlight-Styling (`--jv-`-Token).

**Explizit Out of Scope:**

- Regex- oder Glob-Matching → später, falls überhaupt.
- Case-Sensitivity-Toggle → später, falls überhaupt.
- Substring-Highlighting innerhalb des matchenden Texts → nice-to-have, in dieser Iteration **nicht** enthalten (vereinfacht den DOM-Touch erheblich; kommt ggf. in 0.2.1).
- Match-Navigation (Cmd+G für next/prev) → 0.2.x oder 1.x.
- Filter in Source-Mode → CodeMirror hat sein eigenes Cmd+F, das reicht.
- Filter in Codeblock-Embeds (`CodeblockProcessor.ts`) → embedded Code-Blöcke sind kurz und read-only, hier hilft Browser-Find ausreichend.
- Persistenz der Query über File-Switches.

---

## 4. Architektur

**Hybrid-Ansatz (C aus Brainstorming):** Match-Set wird value-seitig berechnet, Klassen werden DOM-seitig appliziert.

```
SearchBar (Obsidian)              JsonFileView (Obsidian)
    │                                    │
    │  onQueryChange(q)                  │ (orchestriert)
    └────────────────────────────────────┤
                                         │
                                         ▼
                                   TreeView.applyFilter(q)
                                         │
                                         ├─► findMatches(value, q)    [core/search.ts — pur]
                                         │      returns Set<pathStr>
                                         │
                                         └─► DOM-Walk:
                                              ├─ markiere matches (.json-match)
                                              ├─ markiere ancestor-chain (.json-on-path)
                                              ├─ expandiere collapsed containers mit matches
                                              └─ toggle .json-filter-active auf .json-tree-root
```

**Warum diese Aufteilung:**
- `findMatches` ist eine pure `(JsonValue, string) → Set<string>` Funktion — TDD-perfekt.
- `TreeView.applyFilter` ist ein dünner Adapter (DOM-Lookup über `data-path`-Attribute, die schon existieren).
- `core/render.ts` wird nicht angefasst. Bleibt frei für den 0.3.0-Refactor.

---

## 5. Files

### 5.1 Neu

| Datei | Zweck |
|---|---|
| `src/core/search.ts` | `findMatches(value, query, opts?) → Set<string>`. Pure, kein DOM. |
| `src/obsidian/SearchBar.ts` | Input + Clear-Button + Match-Count-Badge. Emit `onQueryChange`. ESC-Handler. |
| `tests/core/search.test.ts` | Unit-Tests für `findMatches`. |
| `tests/obsidian/SearchBar.test.ts` | Unit-Tests für SearchBar (input event, clear, ESC). |

### 5.2 Geändert

| Datei | Änderung |
|---|---|
| `src/core/types.ts` | Optionaler `SearchOptions`-Type. |
| `src/obsidian/JsonFileView.ts` | SearchBar in `buildChrome()` einfügen; Show/Hide bei Mode-Switch; `Cmd/Ctrl+F`-Scope-Command via Plugin. |
| `src/obsidian/TreeView.ts` | Neue Methode `applyFilter(query: string): { matchCount: number }`. |
| `tests/obsidian/TreeView.test.ts` | Tests für `applyFilter`-API. |
| `tests/obsidian/JsonFileView.test.ts` | Tests für SearchBar-Integration. |
| `styles.css` | Neue Klassen + Token. |
| `src/main.ts` | Plugin-Command `Cmd/Ctrl+F` registrieren (View-scoped). |
| `manifest.json`, `package.json`, `versions.json`, `README.md`, `CHANGELOG.md` | Version-Bump 0.1.2 → 0.2.0 + Release-Notes. |

---

## 6. `findMatches`-API

```ts
// src/core/search.ts

import type { JsonValue } from "./types";

export interface SearchOptions {
  /** Wenn true, key-Strings werden gematched. Default: true. */
  matchKeys?: boolean;
  /** Wenn true, primitive Werte werden gematched. Default: true. */
  matchValues?: boolean;
}

export interface SearchResult {
  /** Set von path-strings (via pathToString), die direkt matchen. */
  matches: Set<string>;
  /** Set von path-strings, die als Ancestor eines Matches markiert sein müssen. */
  onPath: Set<string>;
  /** Match-Count, split nach Typ. */
  counts: { keys: number; values: number };
}

/**
 * Sucht alle Vorkommen von `query` (case-insensitive substring) in keys + primitive
 * values des Trees und gibt match + ancestor-Pfade zurück. Leerer Query → leeres
 * Result.
 */
export function findMatches(
  value: JsonValue,
  query: string,
  opts?: SearchOptions
): SearchResult;
```

### 6.1 Match-Semantik

- **Case-insensitive Substring.** `"Port"` matched `"port"`, `"PORT"`, `"importance"`.
- **Match-Targets:**
  - **Keys:** Objekt-Property-Namen (NICHT Array-Indizes — Zahlen sind keine semantische Suche).
  - **Values:** Nur Primitives. Serialisierte Form für Matching:
    - String: `"foo"` matched gegen `foo` (ohne die Quotes — User sucht den Inhalt, nicht die JSON-Syntax).
    - Number: `42` matched gegen `"42"` (toString).
    - Boolean: `true` / `false`.
    - `null` matched gegen `"null"`.
- **Container-Werte (Object/Array) matchen nie direkt.** Sie können nur als `onPath` markiert sein (weil ein Descendant matched).
- **Leerer Query (`""` oder nur Whitespace) → leeres `matches`-Set.** Caller-Code interpretiert das als "Filter aus".

### 6.2 Path-Encoding

`matches` und `onPath` verwenden `pathToString(JsonPath)` aus `src/core/path.ts`. Das ist die gleiche Encoding die in `data-path`-Attributen am DOM-Row landet — perfect-fit für DOM-Lookup ohne Re-Parse.

**Root-Pfad:** `"root"` (kommt aus `pathToString([])`). Wird in `onPath` aufgenommen, falls irgendein Descendant matched (so dass der Tree-Container die `.json-filter-active`-Klasse bekommt).

### 6.3 Pseudo-Code

```
findMatches(value, query, opts):
  if query.trim() === "": return empty result
  lower_q = query.toLowerCase()
  matches = Set()
  onPath = Set()
  counts = { keys: 0, values: 0 }

  walk(value, path=[]):
    if value is Object:
      for (key, v) in value:
        if matchKeys and key.toLowerCase().includes(lower_q):
          matches.add(pathToString([...path, key]))
          counts.keys++
          mark_ancestors([...path, key])   # add all prefixes to onPath
        walk(v, [...path, key])
    elif value is Array:
      for (i, v) in value:
        walk(v, [...path, i])
    else (primitive):
      if matchValues and serialize(value).toLowerCase().includes(lower_q):
        matches.add(pathToString(path))
        counts.values++
        mark_ancestors(path)
        # Note: "matches" auf einem primitive value ist auch der ancestor-add für sich selbst;
        # mark_ancestors fügt alle PRE FIX-pfade hinzu, nicht den path selbst.

  return { matches, onPath, counts }

mark_ancestors(path):
  for i in 0..path.length:
    onPath.add(pathToString(path.slice(0, i)))   # includes "root"
```

---

## 7. SearchBar-Component

### 7.1 DOM

```html
<div class="json-search-bar">
  <svg class="json-search-icon" .../>              <!-- magnifier icon -->
  <input class="json-search-input" type="text"
         placeholder="Search keys and values…"
         spellcheck="false" />
  <span class="json-search-count" hidden>3 / 12</span>
  <button class="json-search-clear" hidden
          aria-label="Clear search">×</button>
</div>
```

### 7.2 API

```ts
export interface SearchBarOptions {
  onQueryChange: (query: string) => void;
}

export class SearchBar {
  constructor(opts: SearchBarOptions);
  getElement(): HTMLElement;
  focus(): void;
  clear(): void;
  setMatchInfo(info: { matchCount: number } | null): void;
  destroy(): void;
}
```

### 7.3 Verhalten

- **`input`-Event:** debounced ist NICHT nötig für typische Files. Synchrone `onQueryChange` pro Keystroke.
- **ESC:** wenn Input leer → `blur()`. Sonst → `clear()` + `onQueryChange("")` + Input bleibt focused (User kann sofort neu tippen).
- **Clear-Button (×):** sichtbar gdw. Input non-empty. Click → `clear()` + `onQueryChange("")` + Input refocus.
- **Match-Count-Badge:** sichtbar gdw. Query non-empty. Format: `"3 matches"` bei >0, `"no matches"` bei 0. (Vereinfacht ggü. der Initial-Idee von "3 / 12 keys, 2 / 12 values" — weniger Lärm. Counts kommen aus `applyFilter`-Returnwert.)

### 7.4 Styling

In `styles.css`:
- `.json-search-bar` — Flex-Container, `background: var(--jv-bg-inset)`, `border-radius`, `padding`.
- `.json-search-input` — `border: none; outline: none; background: transparent;`
- Auf Focus: `box-shadow` mit `var(--jv-accent)`.

---

## 8. `TreeView.applyFilter`

### 8.1 Signatur

```ts
applyFilter(query: string): { matchCount: number };
```

### 8.2 Verhalten

```
applyFilter(query):
  result = findMatches(currentValue, query, { matchKeys: true, matchValues: true })
  treeRoot = container.querySelector(".json-tree-root")

  // 1. Reset prior filter classes
  treeRoot.classList.remove("json-filter-active")
  treeRoot.querySelectorAll(".json-match, .json-on-path")
          .forEach(el => el.classList.remove("json-match", "json-on-path"))

  if query.trim() === "":
    return { matchCount: 0, totalKeys: 0 }

  // 2. Mark matches
  for pathStr in result.matches:
    row = treeRoot.querySelector(`[data-path="${cssEscape(pathStr)}"]`)
    row?.classList.add("json-match")

  // 3. Mark on-path ancestors
  for pathStr in result.onPath:
    if pathStr === "root":
      continue   // Tree-Root selbst braucht keine on-path-Klasse, kriegt filter-active
    row = treeRoot.querySelector(`[data-path="${cssEscape(pathStr)}"]`)
    row?.classList.add("json-on-path")

  // 4. Aktiviere Filter-Modus (CSS macht das Hiding)
  treeRoot.classList.add("json-filter-active")

  // 5. Auto-expand alle Container die einen Match drin haben
  //    (on-path-Rows die ein .json-container enthalten)
  treeRoot.querySelectorAll(".json-on-path .json-container.is-collapsed")
          .forEach(c => openContainer(c))

  return { matchCount: result.matches.size }
```

`openContainer(c)` toggled die `.is-collapsed`/`.collapsed`-Klassen analog zum click-Handler in `render.ts`.

### 8.3 Aufruf

- Aus `JsonFileView` per `onQueryChange`-Callback durchgereicht.
- Nach `setValue` (Tree neu gebaut) muss der aktuelle Query erneut applied werden — `JsonFileView` cached den aktuellen Query und re-appliziert ihn nach jedem `refreshMode()` / `setValue()`.
- Nach inline-edit (TreeView.render() wird intern aufgerufen) ebenfalls re-apply.

---

## 9. CSS

### 9.1 Neue Tokens (in `.json-tree-root` block)

```css
--jv-match-bg: var(--text-highlight-bg, rgba(255, 214, 10, 0.3));
--jv-match-fg: var(--text-normal);
--jv-match-border: var(--color-yellow, #ffd60a);
```

### 9.2 Filter-Klassen

```css
/* Match-Highlight */
.json-tree-root .json-match > .json-key,
.json-tree-root .json-match > .json-string,
.json-tree-root .json-match > .json-number,
.json-tree-root .json-match > .json-boolean,
.json-tree-root .json-match > .json-null {
  background: var(--jv-match-bg);
  border-radius: 2px;
  padding: 0 2px;
}

/* Strict-Filter Hiding: Wenn Filter aktiv, verstecke alles was weder match
   noch ancestor ist. */
.json-tree-root.json-filter-active .json-row:not(.json-match):not(.json-on-path) {
  display: none;
}

/* Ancestor-Rows behalten visuelle Hierarchie aber kein Match-Highlight */
/* (keine speziellen Styles nötig — sie werden einfach NICHT versteckt) */

/* SearchBar */
.json-search-bar {
  display: flex;
  align-items: center;
  gap: var(--jv-space-2);
  background: var(--jv-bg-inset);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-sm);
  padding: var(--jv-space-1) var(--jv-space-2);
  flex: 1;
  min-width: 0;
  transition: border-color 0.15s ease;
}

.json-search-bar:focus-within {
  border-color: var(--jv-accent);
}

.json-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--jv-fg);
  font-family: var(--font-interface);
}

.json-search-count {
  color: var(--jv-fg-muted);
  font-size: 0.85em;
}

.json-search-clear {
  background: none;
  border: none;
  color: var(--jv-fg-muted);
  cursor: pointer;
  padding: 0 var(--jv-space-1);
}

.json-search-clear:hover {
  color: var(--jv-fg);
}
```

### 9.3 Layout-Änderung in Toolbar

Toolbar wird von 2-Spalten (Breadcrumb | Toggle) zu 3-Spalten (Breadcrumb | SearchBar | Toggle). Breadcrumb shrinkt mit `min-width: 0`, SearchBar grows mit `flex: 1`, Toggle bleibt natural-width.

```css
.json-toolbar {
  display: flex;
  align-items: center;
  gap: var(--jv-space-2);
  /* … bestehende Properties … */
}

.json-toolbar .json-breadcrumb {
  min-width: 0;
  flex-shrink: 1;
}

.json-toolbar .json-search-bar {
  flex: 1;
  max-width: 32em;   /* nicht über-stretchen bei riesigem Viewport */
}
```

---

## 10. Keyboard

- **Cmd+F** (Mac) / **Ctrl+F** (Win/Linux): Wenn JsonFileView aktiv → SearchBar fokussieren. Registriert via `addCommand({ id: "json-editor-focus-search", … })` in `src/main.ts`, mit checkCallback der den aktiven View prüft.
- **ESC** im Input: clear (wenn non-empty) oder blur (wenn leer). Lokal im SearchBar.
- **Enter**: no-op (Filter ist live). Verhindert default form-submit nur falls jemand das in einem `<form>` einbettet — wir nicht, also kein Handler nötig.

---

## 11. State & Lifecycle

- **`JsonFileView` cached `currentQuery: string`** als private property.
- **`onQueryChange(q)`**: `currentQuery = q; treeView.applyFilter(q); searchBar.setMatchInfo(...)`.
- **`refreshMode()` / `setViewData()`**: nach Tree-Build wird `treeView.applyFilter(currentQuery)` automatisch wieder aufgerufen.
- **Mode-Switch zu Source**: SearchBar wird per `.hidden`-Class versteckt. currentQuery bleibt im State (User klickt zurück zu Tree → Query ist sofort wieder da).
- **File-Switch (neue Datei in derselben View)**: `setViewData` wird mit neuem Inhalt aufgerufen. `currentQuery` wird NICHT zurückgesetzt — explizit Choice: wenn der User in einer 50-File-API-Doc-Suche durch Files browst, möchte er die Query behalten. Doku zeigt "no matches" wenn die neue Datei nichts hat.
- **`clear()` auf View-Unload**: SearchBar wird destroyed via `onunload`.

---

## 12. Edge Cases

| Fall | Verhalten |
|---|---|
| Query mit Whitespace nur (`"  "`) | Behandelt wie leer (kein Filter). |
| Query, der einen Container-Key matched (`"users"` in `{ users: [...] }`) | Container-Row matched, alle Descendants werden via on-path-Klasse + Re-Apply auf Sub-Tree exponiert. Aber **nur der direkte Container** ist `.json-match`. Descendants sind `.json-on-path` (nicht gehighlighted, aber sichtbar — User sieht den Match im Kontext). |
| Filter aktiv + User klickt Inline-Edit auf einen Match | Edit funktioniert normal. Nach Commit re-rendert TreeView → Filter wird neu applied (currentQuery noch da). |
| Filter aktiv + Source-Switch | SearchBar versteckt; Filter-Classes im Tree-DOM werden beim nächsten Tree-Switch wieder regeneriert. |
| Invalid JSON | Tree ist disabled, SearchBar auch (per `.disabled`-Class oder via `input.disabled = true`). Die SearchBar bleibt sichtbar, ist aber non-interactive. |
| Sehr viele Matches (>1000) | Match-Count zeigt `1000+` (kein Performance-Issue, nur Display-Hygiene). |
| Empty file `{}` | Query liefert immer 0 Matches. Tree-Empty-State würde sowieso die `.json-bracket` zeigen. Nichts Besonderes. |
| Match in einem auto-collapsed Container | Container wird programmatisch geöffnet. |

---

## 13. Performance

- `findMatches` ist O(n) im Tree-Size. Für JSON-Files <100 KB (typisch in Obsidian) ist das <1ms.
- DOM-Klassen-Toggle: O(matches + onPath) — typisch <100 Operations.
- Keine `requestAnimationFrame`, kein Debounce. Wenn User sehr schnell tippt und das ruckelt, sehen wir das in 0.2.1.

---

## 14. Test-Strategie (TDD-First)

### 14.1 `core/search.test.ts`

| Test | Erwartung |
|---|---|
| Empty query → empty matches | `{ matches: ∅, onPath: ∅, counts: 0/0 }` |
| Whitespace-only query → empty matches | wie oben |
| Key-only match in flat object | `matches = { "key" }`, `onPath = { "root" }`, `counts.keys = 1` |
| Value-only match (string) | matches with path |
| Value match (number) — `42` matches `"4"` | yes (substring) |
| Value match (boolean) — `true` matches `"ru"` | yes |
| Value match (null) — query `"null"` matches | yes |
| Case-insensitive: `"PORT"` matches key `"port"` | yes |
| Multiple matches at different depths | all in result; onPath has every ancestor of every match |
| Nested: match in deeply-nested array element | onPath chain includes all parents incl. array-index paths |
| String value contains substring partial | match (e.g. `"hello world"` matches `"world"`) |
| Quoted-key (`{ "weird/key": 1 }`) | match works; pathToString uses bracket-quote form |
| Array index is NOT matched as a key | search for `"0"` doesn't match `arr[0]` (only values/object-keys) |
| Mixed: query matches key in one place + value in another | both, counts split correctly |
| Opts.matchKeys=false | only value matches |
| Opts.matchValues=false | only key matches |
| Root-level primitive value match (e.g. value is just `"hello"`) | match path is `""` (root), onPath is `{ "root" }`? Edge case — accept match at root, onPath stays empty (no ancestors). |

### 14.2 `obsidian/SearchBar.test.ts`

| Test | Erwartung |
|---|---|
| Constructor builds DOM with input, clear, count, icon | yes |
| Input event → onQueryChange called with value | yes |
| Clear button hidden when input empty | yes |
| Clear button visible when input non-empty | yes |
| Click clear → input cleared, onQueryChange("") called, input refocused | yes |
| ESC with empty input → blur | yes |
| ESC with non-empty input → cleared, onQueryChange(""), still focused | yes |
| setMatchInfo({ matchCount: 3 }) → count shows "3 matches" | yes |
| setMatchInfo({ matchCount: 0 }) → "no matches" | yes |
| setMatchInfo(null) → count hidden | yes |
| destroy() removes listeners | (smoke) |

### 14.3 `obsidian/TreeView.test.ts` (additions)

| Test | Erwartung |
|---|---|
| applyFilter("") returns { matchCount: 0 } and clears all filter classes | yes |
| applyFilter(non-empty) returns matchCount | yes |
| applyFilter marks matching rows with `.json-match` | yes |
| applyFilter marks ancestor rows with `.json-on-path` | yes |
| applyFilter adds `.json-filter-active` to root | yes |
| applyFilter opens auto-collapsed containers that contain matches | yes |
| applyFilter on tree with no matches still sets `.json-filter-active` (so CSS hides everything) | yes |
| Re-render via setValue preserves no filter state (caller must re-apply) | yes |

### 14.4 `obsidian/JsonFileView.test.ts` (additions)

| Test | Erwartung |
|---|---|
| Chrome contains SearchBar in tree mode | yes |
| SearchBar is hidden in source mode | yes |
| Query persists through mode-switch tree→source→tree | yes |
| Query persists through inline edit | yes |
| Query is re-applied after setViewData (file switch) | yes |

---

## 15. Out of Scope (für 0.2.0, ggf. 0.2.x oder später)

- Substring-Highlighting innerhalb des matchenden Texts (würde DOM-Manipulation am Primitive-Span erfordern).
- Match-Navigation (Cmd+G next/prev).
- Regex/Glob-Modus.
- Case-Sensitivity-Toggle.
- Persistente Suche zwischen File-Switches in derselben View.
- Filter in Codeblock-Embeds.
- Filter in Source-Mode (CodeMirror hat Cmd+F nativ).
- Settings-Eintrag für "Filter mode" o.ä.

---

## 16. Definition of Done

- [ ] `core/search.test.ts` grün, ~15-20 Tests.
- [ ] `obsidian/SearchBar.test.ts` grün, ~10 Tests.
- [ ] `obsidian/TreeView.test.ts` mit neuen Tests grün.
- [ ] `obsidian/JsonFileView.test.ts` mit neuen Tests grün.
- [ ] Gesamt-Suite weiter grün (≥133 + neue Tests).
- [ ] `npm run build` clean.
- [ ] Plugin in `X1_v6t2b9`-Test-Vault installiert + manueller Smoke-Test mit nicht-trivialem JSON-File ist positiv.
- [ ] `CHANGELOG.md` Section `[0.2.0]` mit Add/Changed-Bullets.
- [ ] `README.md` Features-Section um Search-Bullet ergänzt.
- [ ] Version-Bump in `manifest.json`, `package.json`, `versions.json`.
- [ ] Merge auf `main` via `--no-ff` mit `feat/0.2.0-search-filter`.
- [ ] Tag `0.2.0` gepusht (braucht User-Approval wg. Auto-Mode-Klassifizierer).
