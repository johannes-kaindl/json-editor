# Mobile-Interaktionsmodell — Design-Spec

**Datum:** 2026-06-13
**Status:** Design (vor Implementierung)
**Audit-Basis:** `docs/superpowers/specs/2026-06-12-gap-audit.md` §4.2–4.5, §4.8, §6.10
**Voraussichtliche Version:** `1.8.0` (Feature-Release; eigener `feat/`-Branch, `--no-ff`-Merge)

---

## 1. Kontext & Ziel

Das Plugin deklariert `manifest.json:9 → isDesktopOnly: false` — verifiziert ehrlich (keine
Node/Electron-Imports in `src/`; das Flag deklariert formal nur die API-Wahl, **keine**
Feature-Parität). Mobile ist daher **kein Submission-Blocker** (Obsidian-Review:
„test on mobile *or* set isDesktopOnly to true"; der Portal-Bot prüft kein Mobile-Runtime).

Trotzdem wurde bewusst entschieden, das **volle Mobile-Interaktionsmodell vor der Submission**
zu bauen, statt das Plugin via `isDesktopOnly: true` auf Mobile zu verstecken oder nur einen
Minimal-Pass zu machen. Ziel: Auf Touch sind **alle** Tree-Operationen erreichbar und es gibt
keine toten/irreführenden Affordanzen.

Heutiger Mobile-Zustand (verifiziert):
- Read-only-Tree, Breadcrumb-Nav, ```json-Codeblock-Rendering funktionieren.
- 4 von 5 Tree-Mutationen (Rename/Delete/Add/Change-Type) sind per Tap über `:focus-within`
  erreichbar, aber über **unsichtbare Buttons** (`opacity:0` lässt die Hit-Box stehen →
  Fehl-Tap kann unbestätigt löschen, §4.3).
- **Drag-Reorder ist auf Touch tot** (HTML5-DnD feuert nicht bei Fingerdrag, `TreeView.ts:292–367`);
  `draggable="true"` auf der ganzen Row kollidiert zusätzlich mit Scroll/Long-press (§4.8).
- **Kein Touch-erreichbares Undo/Redo** (nur Commands `main.ts:39–59`; Palette braucht man), bei
  gleichzeitig bestätigungslosem Ein-Tap-Delete (§4.5).
- Tap-Targets ~12–19px, weit unter 44pt/48dp (§4.4).
- `Platform`/`is-mobile` kommen **nirgends** im Code vor; einzige `@media` ist
  `prefers-reduced-motion` (`styles.css:771`).

---

## 2. Entscheidungen (ratifiziert)

| # | Entscheidung | Wahl | Begründung |
|---|---|---|---|
| D1 | Trigger des Aktionsmenüs auf Mobile | **Long-press auf die Zeile → Obsidian-`Menu`** | Plattform-Standard (6.10). Ruhiges Layout; löst 4.3/4.4/4.8 in einem Zug, weil auf Touch gar keine Inline-Affordanzen mehr rendern. Single-Tap = „Wert editieren" bleibt frei. Tradeoff: Geste muss im README dokumentiert werden. |
| D2 | Tastatur-Reorder `Alt+ArrowUp/Down` (auch Desktop) | **Ja** | Nutzt die vorhandene Move-Primitive; schließt die Tastatur-/a11y-Reorder-Lücke (4.2), die sonst offen bliebe. |
| D3 | Undo/Redo-Toolbar-Buttons | **Nur auf Mobile** (`Platform.isMobile`) | Desktop hat `Mod+Z`/`Mod+Shift+Z` via Scope; Desktop-Chrome bleibt unverändert. Bounded change. |
| D4 | Schema-Validierungsfehler auf Mobile | **Ja — als deaktivierter Kopf-Eintrag im Long-press-Menu** | Heute nur als natives `title`-Attribut (auf Touch unlesbar). Billig; schließt eine echte Mobile-Lücke (Teil 2.11). |

---

## 3. Scope

**In Scope (dieses Milestone):**
- §4.2 Reorder-Fallback (Move up/down im Menu + `Alt+Arrow` Desktop-Keyboard)
- §4.3 Touch-Affordanzen (Inline-Hover-UI auf Touch nicht rendern; `:focus-within`-Fix für CopyButton auf Desktop)
- §4.4 Tap-Targets (Collapse-Toggle ≥44px auf Mobile via transparentes Padding)
- §4.5 Undo/Redo-UI (Mobile-Toolbar-Buttons)
- §4.8 `draggable` (auf Mobile nicht setzen)
- §6.10 Konsolidiertes Long-press-Menu

**Out of Scope (separate Milestones / Follow-ups):**
- §4.1 **Virtualisierung/Lazy-Render** — *Hinweis:* der 4.1-**Guard** gegen Freeze/OOM beim
  Öffnen (`exceedsRenderBudget` → Auto-Source-Modus + `LargeFileBanner`, `JsonFileView.ts:134–139`)
  **ist bereits in 1.5.0/1.6.0 ausgeliefert**. Das echte Mobile-Freeze-Risiko beim Öffnen ist
  damit abgedeckt; die strukturelle Virtualisierung bleibt 2.x.
- §4.6 Source-Modus Parse-Debounce pro Keystroke (Performance-Milestone)
- §4.7 Such-Debounce (Performance-Milestone)
- Pointer-Events-basiertes **echtes Touch-Drag** (langfristig; Move up/down deckt Reorder ab)
- Rechtsklick-Kontextmenü auf **Desktop** (das `Menu` ließe sich billig wiederverwenden — bewusst
  zurückgestellt, um Desktop-Verhalten in diesem Milestone nicht zu ändern)

---

## 4. Architektur

### 4.1 Plattform-Erkennung & Testbarkeit
- `JsonFileView` liest `Platform.isMobile` (Import aus `obsidian`) **einmal** und reicht ein
  injiziertes Flag `touchMode: boolean` über `TreeViewOptions` an `TreeView` weiter.
- **Warum injizieren statt `Platform` in `TreeView` importieren:** hält die Adapter-Logik
  unit-testbar (Tests setzen `touchMode: true/false` ohne Obsidian-Runtime) und vermeidet, dass
  `Platform` quer durch die Komponente streut. `TreeView` selbst bleibt frei von `Platform`.
- **CSS** nutzt die von Obsidian gesetzte `body.is-mobile`-Klasse (kein `@media (pointer:coarse)`),
  konsistent mit `Platform.isMobile` und mit 6.10. So bleibt Desktop (auch Touch-Laptops)
  unangetastet — eine bewusst enge, plattform-konforme Definition von „Touch".

### 4.2 Neue Komponente `src/obsidian/RowMenu.ts`
Exportiert `openRowMenu(evt, opts)`, baut ein Obsidian-`Menu` und zeigt es an der Long-press-Position
(`menu.showAtMouseEvent(evt)` bzw. `showAtPosition({x, y})`).

```ts
export interface RowMenuOptions {
  value: JsonValue;
  path: JsonPath;
  canRename: boolean;            // last segment ist string (Object-Key)
  currentType: JsonType;
  readonly: boolean;             // lossy/read-only Tree → nur Copy-Einträge
  validationError?: string;      // D4: deaktivierter Kopf-Eintrag, falls gesetzt
  moveUpEnabled: boolean;        // false an oberer Grenze
  moveDownEnabled: boolean;      // false an unterer Grenze
  onCopyValue: () => void;
  onCopyPath: () => void;
  onRename: () => void;
  onChangeType: (t: JsonType) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}
```

Menü-Aufbau (Reihenfolge):
1. **[Fehlermeldung]** — nur wenn `validationError` gesetzt: `item.setDisabled(true)` als Kopf + Separator (D4).
2. **Copy value**, **Copy path** (immer).
3. *(wenn `!readonly`:)* **Rename key** (nur `canRename`) · **Change type ▸** (Submenu via
   `item.setSubmenu()`; 6 Typen aus geteilten `TYPES`/`LABELS`, aktueller Typ deaktiviert) ·
   Separator · **Move up** (`setDisabled(!moveUpEnabled)`) · **Move down** (`setDisabled(!moveDownEnabled)`) ·
   Separator · **Delete** (`item.setWarning(true)`).
4. Bei `readonly`: nur die Copy-Einträge.

> **Verifikation:** `MenuItem.setSubmenu()` ist ab unserer `minAppVersion` (1.5.7) verfügbar — im
> Smoke-Test bestätigen. Fällt das aus, „Change type" auf flache Einträge `String/Number/…` im
> Hauptmenü umstellen (kein Architektur-Risiko).

### 4.3 `src/obsidian/TreeView.ts`
- Neues Feld aus `TreeViewOptions.touchMode?: boolean`.
- In `attachStructuralActions` (Z. 232–281): bei `touchMode`
  - **kein** Drag-Handle, **kein** `row.setAttribute("draggable","true")`, **kein** `wireDragEvents`;
  - **keine** Inline-`RowActions` (kein `T`/`✎`/`✕` → eliminiert §4.3-Phantom-Hit-Box & §4.4).
  - `AddAffordance` bleibt (nicht hover-gatet, auf Touch nutzbar — im Smoke-Test bestätigen).
- In `attachCopyButtons` (Z. 667–677): bei `touchMode` **keine** Inline-CopyButtons (Copy läuft übers Menu).
- **Long-press-Wiring (nur `touchMode`):** je Row ein `contextmenu`-Listener (Obsidian/Mobile löst
  Long-press → `contextmenu` aus) → `openRowMenu`. Touch-Hold-Fallback (`touchstart` + ~500ms-Timer,
  abgebrochen bei `touchmove`/`touchend`) nur falls `contextmenu` auf Zielgeräten unzuverlässig ist
  (im Smoke-Test entscheiden). Das ausgelöste Long-press darf **nicht** zusätzlich den Single-Tap-
  Editor öffnen — `preventDefault()`/Click-Suppression nach Menü-Öffnung.
- **`handleKeydown` (Z. 578–665):** neue Fälle `Alt+ArrowUp`/`Alt+ArrowDown` (D2) — berechnet
  aus dem aktiven Row-Pfad die Move-Operation und ruft `onMoveItem`/`onMoveKey`. Gilt
  plattformübergreifend (auch Desktop). Bound-Checks wie bei D-Menü.
- Die Move-Index-Logik (Array: `toIdx = fromIdx ± 1`; Object: `toPos = currentPos ± 1`, mit
  Clamping an `[0, len-1]`) wird in eine kleine private Hilfsfunktion gezogen und sowohl von
  `Alt+Arrow` als auch vom Menü-`onMoveUp/Down` genutzt.

### 4.4 `src/obsidian/JsonFileView.ts`
- `Platform.isMobile` einmal lesen; `touchMode` an `TreeView` (in `refreshMode`, Z. 388) übergeben.
- Menü-Callbacks auf die **vorhandenen** Handler verdrahten: `onMoveUp/Down` → berechnen Ziel-Index
  und rufen `handleMoveItem`/`handleMoveKey` (`JsonFileView.ts:515/525`); `onDelete` → `handleDelete`;
  `onRename` → bestehender Rename-Flow; `onChangeType` → `handleChangeType`; Copy → extrahierte
  Copy-Funktionen (s. 4.6); `validationError` aus der vorhandenen Validierungs-Map.
- **Undo/Redo-Buttons (D3, nur Mobile):** in `buildChrome` (Z. 231–275) bei `Platform.isMobile`
  zwei Buttons in `json-toolbar` ergänzen (`setIcon`, z. B. `rotate-ccw`/`rotate-cw`); disabled-State
  über `canUndo()`/`canRedo()`. Neue private `refreshUndoButtons()`, aufgerufen aus `applyMutation`,
  `undo`, `redo`, `restoreText`, `setViewData` und `refreshMode`.

### 4.5 `styles.css` — `body.is-mobile`-Block
- Collapse-Toggle (`.json-collapse-toggle`, heute 14px / 9×9-Chevron): unter `body.is-mobile`
  Mindest-Tap-Fläche ~44px via transparentes Padding (sichtbares Chevron unverändert).
- Da Inline-Affordanzen auf Mobile gar nicht rendern, entfällt das Phantom-Hit-Box-Problem (§4.3) —
  **keine** `opacity:0`-Buttons mehr in der Hit-Testing-Ebene.
- **Desktop-Fix (billig, §4.3.1):** `:focus-within`-Reveal für `.json-copy-btn` ergänzen (analog zu
  RowActions/Drag-Handle), damit der CopyButton auch ohne Hover (Tastatur-Fokus / Touch-Laptop) erscheint.

### 4.6 Copy-Logik extrahieren
Aus `CopyButton.ts` die Kopier-Aktion in wiederverwendbare Funktionen ziehen (inkl. des bereits
vorhandenen `navigator.clipboard`-Guards, 2.19): `copyJsonValue(value)` / `copyJsonPath(path)`
(jeweils Clipboard-Write + Erfolg/Fehler-`Notice`). `CopyButton` (Desktop) **und** `RowMenu` (Mobile)
nutzen dieselbe Logik. Verhalten unverändert: Value = `JSON.stringify(value, null, 2)`, Path = `pathToString(path)`.

### 4.7 `TypeMenu.ts` (minor)
Auf Mobile wird der custom `TypeMenu` **nicht** verwendet (Change-Type läuft über das Obsidian-Menu-
Submenu), womit der mousedown-Close-Bug auf Touch ohnehin entfällt. Optionales billiges Hardening
für Desktop-Touch: `mousedown`-Close-Listener (Z. 62–68) zusätzlich auf `pointerdown` hören. Nicht
blockierend für dieses Milestone.

---

## 5. Interaktions-Flows (Mobile)

| Geste | Ergebnis |
|---|---|
| **Single-Tap auf Primitiv-Wert** | Inline-Editor (unverändert) |
| **Single-Tap auf Chevron** | Container collapse/expand (vergrößertes Tap-Target) |
| **Long-press auf Zeile** | Obsidian-`Menu` mit allen Operationen |
| **`+ Add key/item`** (Container-Ende) | bestehende `AddAffordance` (Tap) |
| **Undo/Redo** | Toolbar-Buttons (disabled, wenn nicht möglich) |
| **Reorder** | Menü-Einträge *Move up/Move down* (Desktop zusätzlich `Alt+Arrow`) |

Read-only/lossy-Tree (`lossyRoundtrip` → `readonly`): Long-press-Menu zeigt nur **Copy value/path**.

---

## 6. Edge Cases
- **Reorder-Grenzen:** erstes Element → „Move up" disabled; letztes → „Move down" disabled (Menü &
  `Alt+Arrow` no-op). Identitäts-Move wird ohnehin von `handleMoveItem/Key` (`=== this.currentValue`) abgefangen.
- **Array-Index vs. Object-Key:** „Rename" nur bei String-Last-Segment; „Move" greift in beiden Fällen
  (Index- bzw. Key-Reihenfolge).
- **Long-press vs. Scroll:** da `draggable` auf Mobile nicht gesetzt wird, kollidiert Long-press nicht
  mehr mit Scroll (§4.8 gelöst). Touch-Hold-Timer (falls genutzt) bricht bei `touchmove` ab.
- **Long-press öffnet nicht zusätzlich den Editor:** Click-Suppression nach Menü-Öffnung.
- **Codeblock-Tree (read-only):** unverändert; kein Long-press-Menu nötig (keine Mutationen).
- **Popout-Fenster:** `Menu` an `evt`/Position gebunden; keine globalen `document`-Annahmen.

---

## 7. Testing-Strategie
- **Unit (Vitest, Obsidian-Mock):**
  - `RowMenu`: korrekte Einträge je Kontext (readonly → nur Copy; Array-Index → kein Rename;
    Move-Bounds disabled; `validationError` → deaktivierter Kopf-Eintrag).
  - `TreeView` mit `touchMode: true`: kein `draggable`, keine Inline-RowActions/CopyButtons; Long-press
    ruft `openRowMenu`; mit `touchMode: false`: Verhalten unverändert (DnD + Inline-UI bleiben).
  - `Alt+ArrowUp/Down` ruft `onMoveItem`/`onMoveKey` mit korrekten Indizes, no-op an den Grenzen.
  - Copy-Funktionen: Value/Path-Format unverändert; Clipboard-Guard greift.
  - `JsonFileView`: Undo/Redo-Buttons nur bei Mobile; disabled-State folgt `canUndo/canRedo`.
- **Regression:** bestehende 537 Tests bleiben grün (Desktop-Pfad unverändert).
- **Smoke (Pflicht, 6.10):** `this.app.emulateMobile(true)` **und** echtes Gerät — Long-press-Menu,
  alle Operationen, Reorder, Undo/Redo, Tap-Targets, Submenu-Verfügbarkeit, `AddAffordance` auf Touch.

---

## 8. Akzeptanzkriterien
1. Auf Mobile sind **alle** Tree-Operationen (Copy value/path, Rename, Change type, Move up/down,
   Delete, Add) ohne Hardware-Tastatur erreichbar.
2. Keine unsichtbaren, aber antippbaren Buttons mehr auf Mobile (kein versehentlicher Delete).
3. Reorder funktioniert auf Touch (Menü) und per Tastatur (`Alt+Arrow`, auch Desktop).
4. Undo/Redo auf Mobile per Toolbar erreichbar, mit korrektem disabled-State.
5. Collapse-Toggle ≥44px Tap-Fläche auf Mobile.
6. Schema-Fehlertext auf Mobile lesbar (Menü-Kopf).
7. Desktop-Verhalten **unverändert** (DnD, Hover-Buttons, `Mod+Z`), abgesehen vom additiven
   `Alt+Arrow` und dem `:focus-within`-CopyButton-Fix.
8. 537+ Tests grün, `npm run build` + Biome + `lint:obsidian` clean.

---

## 9. Datei-Änderungsliste
| Datei | Art | Inhalt |
|---|---|---|
| `src/obsidian/RowMenu.ts` | **neu** | `openRowMenu` (Obsidian-`Menu`-Builder) |
| `src/obsidian/TreeView.ts` | ändern | `touchMode`-Flag; touch-bedingt kein DnD/Inline-UI; Long-press→Menu; `Alt+Arrow`-Reorder; Move-Index-Helper |
| `src/obsidian/JsonFileView.ts` | ändern | `Platform.isMobile`→`touchMode`; Menü-Callbacks; Mobile-Undo/Redo-Buttons + `refreshUndoButtons` |
| `src/obsidian/CopyButton.ts` | ändern | Copy-Logik in `copyJsonValue`/`copyJsonPath` extrahieren (Wiederverwendung) |
| `src/obsidian/TypeMenu.ts` | (optional) | `mousedown`→ zusätzlich `pointerdown` (Desktop-Touch-Hardening) |
| `styles.css` | ändern | `body.is-mobile`: Toggle-Tap-Target; `:focus-within`-CopyButton-Fix |
| `manifest.json` / `package.json` / `versions.json` | ändern | Version-Bump `1.8.0` |
| `CHANGELOG.md` | ändern | `1.8.0`-Eintrag |
| `README.md` | ändern | Mobile-Abschnitt (Long-press-Geste dokumentieren) |
| Tests | neu/ändern | siehe §7 |
