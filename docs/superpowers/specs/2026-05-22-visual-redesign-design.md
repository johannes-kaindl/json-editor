# Visual Redesign — Design-Spec

**Projekt:** `obsidian-json-editor`
**Datum:** 2026-05-22
**Status:** Spec, freigegeben zur Umsetzung
**Entstanden aus:** Brainstorming-Session 2026-05-22 (Visual Companion)

Diese Datei ist ein **Design-Brief**. Sie beschreibt das angestrebte Aussehen vollständig genug, dass daraus CSS und Mockups erstellt werden können, ohne dass weitere Designentscheidungen nötig sind. Sie ist *kein* Implementierungsplan — der folgt separat.

---

## 1. Ziel & Kontext

Der JSON-Viewer ist heute funktional, aber visuell flach: dünne 1px-Einrückungslinien, keine sichtbare Container-Tiefe, zusammengewürfeltes Chrome (Mode-Toggle und Breadcrumb als getrennte Kästen), Ad-hoc-Abstände. Ziel ist ein grafisch ansprechendes Redesign, das große JSON-Strukturen **lesbarer** macht und das Plugin für die Obsidian-Community-Store-Einreichung präsentabel macht.

Das Redesign wurde als **Direction B — „Structured / IDE"** gewählt: Verschachtelung wird durch dezent getönte, abgerundete Blöcke sichtbar gemacht.

---

## 2. Design-Prinzipien

1. **Theme-treu.** Alle Farben und Hintergründe stammen aus Obsidian-CSS-Variablen. Hardcodierte Werte ausschließlich als Fallback (`var(--obsidian-var, #fallback)`). Das Plugin funktioniert in jedem Theme — hell wie dunkel — und ist Community-Store-Review-konform.
2. **Politur über Struktur, nicht über Farbidentität.** Die optische Aufwertung passiert durch Layout, Tiefe, Spacing-Disziplin und Mikro-Interaktion — nicht durch eine eigene Markenpalette, die das Theme überschreibt.
3. **Keine neuen Settings.** Konvention aus `AGENTS.md`: Patch-Releases bekommen keine neuen Einstellungen. Das Redesign ist defaults-on.
4. **Kein Remote-Loading.** Keine Web-Fonts, keine externen Ressourcen. Es werden ausschließlich Obsidian-Schrift-Variablen (`--font-interface`, `--font-monospace`) verwendet.
5. **Bewegung respektiert `prefers-reduced-motion`.** Alle Transitions werden bei reduzierter Bewegung deaktiviert.
6. **Eine Spacing-Skala.** Schluss mit Ad-hoc-Abständen — jeder Abstand referenziert einen Token.

---

## 3. Scope

**In Scope:**

- Tree-Ansicht (Kern: Zeilen, Einrückung, Syntax-Farben, verschachtelte Blöcke, Collapse, Hover-/Edit-Zustände)
- View-Chrome (Toolbar mit Breadcrumb + Mode-Toggle, Error-Banner, Empty-State, Tooltip, Copy-Buttons)
- Codeblock-Embeds (read-only Trees aus ` ```json `-Blöcken in Markdown-Notizen)
- Marketing-Assets (Screenshot-Mockup-Vorlagen für Store + README)

**Explizit Out of Scope:**

- Die „Kuro Signal Protocol"-Lore-Schicht aus dem `design/`-Ordner (KuroLine-Persona, Aspekte, „Full chamber"-Modus) — gehört nicht in ein öffentliches General-Purpose-Plugin.
- Neue Settings jeglicher Art.
- Such-/Filter-Funktion → verschoben auf **v1.2** (Backlog).
- Keyboard-Navigation, Dirty-State-Indikator, Minimap → verschoben auf **v1.3** (Backlog).

---

## 4. Token-System

Alle neuen Tokens tragen das Präfix `--jv-` (json-viewer) und werden **plugin-scoped** deklariert (auf `.json-tree-root` und dem Codeblock-Wrapper), nie auf `:root`. Damit kollidiert nichts mit dem Vault.

### 4.1 Oberflächen & Vordergrund (theme-treu)

| Token | Wert | Zweck |
|---|---|---|
| `--jv-bg` | `var(--background-primary)` | Editor-Hintergrund |
| `--jv-bg-panel` | `var(--background-secondary)` | Toolbar, Breadcrumb-Leiste |
| `--jv-bg-inset` | `var(--background-secondary-alt, var(--background-secondary))` | Eingabefelder, Code-Flächen |
| `--jv-border` | `var(--background-modifier-border)` | Standard-Rahmen, Einrückungslinie |
| `--jv-border-hover` | `var(--background-modifier-border-hover, var(--background-modifier-border))` | Rahmen im Hover |
| `--jv-hover` | `var(--background-modifier-hover)` | Zeilen-Hover-Fläche |
| `--jv-fg` | `var(--text-normal)` | Primärtext |
| `--jv-fg-muted` | `var(--text-muted)` | Sekundärtext, Klammern |
| `--jv-fg-faint` | `var(--text-faint)` | Tertiärtext, Index, null |
| `--jv-accent` | `var(--interactive-accent)` | Akzent (aktiver Pfad, Fokus, Primär-Button) |
| `--jv-accent-text` | `var(--text-on-accent)` | Text auf Akzent-Fläche |

### 4.2 JSON-Syntax-Palette (Theme-Variable mit Fallback)

| Token | Wert | Anwendung |
|---|---|---|
| `--jv-syntax-key` | `var(--color-cyan, #4ec9b0)` | Objekt-Keys |
| `--jv-syntax-string` | `var(--color-green, #6a9955)` | String-Werte |
| `--jv-syntax-number` | `var(--color-blue, #569cd6)` | Zahlen |
| `--jv-syntax-boolean` | `var(--color-purple, #c586c0)` | true / false |
| `--jv-syntax-null` | `var(--text-faint)` | null (zusätzlich *italic*) |
| `--jv-syntax-punct` | `var(--text-muted)` | Klammern, Doppelpunkt, Komma |

### 4.3 Spacing-Skala

`--jv-space-1: 2px` · `--jv-space-2: 4px` · `--jv-space-3: 6px` · `--jv-space-4: 8px` · `--jv-space-5: 12px` · `--jv-space-6: 16px`

### 4.4 Radien

`--jv-radius-sm: 4px` · `--jv-radius-md: 6px` · `--jv-radius-lg: 8px`

### 4.5 Verschachtelungs-Tönung

`--jv-nest-tint`: empfohlen `color-mix(in srgb, var(--background-modifier-border) 22%, transparent)`.

Jeder verschachtelte Block ab Tiefe ≥ 1 erhält diese halbtransparente Tönung. Da Blöcke ineinander liegen, **stapeln** sich die Tönungen optisch und erzeugen automatisch wachsende Tiefe. **Deckelung:** Ab Tiefe 3 wird keine weitere Tönung addiert (Tiefen-Attribut, siehe §8), sonst werden tief verschachtelte Strukturen matschig. Exakte Opazität ist beim Umsetzen feinjustierbar — Ziel: in Dark *und* Light klar erkennbar, aber nie aufdringlich.

### 4.6 Motion

`--jv-dur-fast: 120ms` · `--jv-dur-base: 150ms` · `--jv-ease: ease-out`

Alle Transitions in `@media (prefers-reduced-motion: reduce)` auf `none`.

---

## 5. Komponenten-Specs

Referenz-Mockups: `.superpowers/brainstorm/*/content/` (Baseline, directions, design-tree, chrome, section3-marketing) — entstanden während des Brainstormings.

### 5.1 Toolbar

Ersetzt den heutigen getrennten Mode-Toggle und die separate Breadcrumb-Leiste durch **eine** horizontale Leiste am oberen Rand der `.json`-Dateiansicht.

- Hintergrund `--jv-bg-panel`, 1px Unterkante `--jv-border`, Padding `--jv-space-4` `--jv-space-5`.
- **Links:** Breadcrumb. Ein optionales Home-Glyph (`⌂`), dann Pfad-Segmente als kleine Pills. Jedes Segment `--jv-radius-sm`, Hintergrund `--jv-bg-inset`, Text `--jv-fg-muted`. Hover: `--jv-hover` + Text `--jv-fg`. Das **terminale** (letzte) Segment: Hintergrund Akzent (`--jv-accent`), Text `--jv-accent-text`, weight 600. Separatoren `›` in `--jv-fg-faint`. Klick auf ein Segment springt zum Pfad (bestehendes `scrollToPath`-Verhalten).
- **Rechts:** Mode-Toggle als segmentierte Steuerung (Tree / Source). Container `--jv-bg-inset`, `--jv-radius-md`, 2px Innen-Padding. Aktives Segment: Akzent-Fläche, Text `--jv-accent-text`. Inaktiv: Text `--jv-fg-muted`, Hover → `--jv-fg`. Deaktivierter Zustand (z.B. Source bei ungültigem JSON): `opacity: 0.4`, `cursor: not-allowed`.
- Bei sehr schmalem View bricht die Breadcrumb um (`flex-wrap`); der Mode-Toggle bleibt erhalten.

### 5.2 Tree-Ansicht — Grundgerüst

- Container `.json-tree-root`: `--font-monospace`, `font-size` ~12.5–13px, `line-height: 1.6`, Text `--jv-fg`. Body-Padding `--jv-space-5`.
- **Einrückungslinie:** verschachtelte Inhalte (`.json-content`) bekommen `border-left: 2px solid --jv-border` und linkes Padding `--jv-space-5`. Liegt der Teilbaum im **aktiven Pfad**, färbt sich die Linie `--jv-accent`.
- **Modern vs. Classic Marker:** Das bestehende Setting `markerStyle` bleibt. *Modern* (Default) = Einrückungslinie + getönte Blöcke wie hier beschrieben. *Classic* = das bestehende `├ └`-Präfix-Muster; es wird nur leicht nachgezogen (Präfix-Farbe `--jv-fg-faint`, Monospace), keine Blöcke, keine Tönung.

### 5.3 Zeile (`.json-row`) & Zustände

Anatomie einer Zeile: `[Collapse-Toggle?] [Key | Index] [:] [Wert] [Copy-Button →]`

- **Normal:** Padding `--jv-space-3` `--jv-space-3`, `--jv-radius-sm`. Key in `--jv-syntax-key`, weight 600, `--font-interface`. Index (in Arrays) in `--jv-fg-faint`, kleiner. Doppelpunkt + Komma in `--jv-syntax-punct`.
- **Hover:** Hintergrund `--jv-accent` bei ~8 % Deckung (`color-mix`), 2px Akzent-Balken am linken Rand (über negativen Margin in den Einrückungsraum gezogen), rechte Ecken `--jv-radius-sm`. Der Copy-Button wird sichtbar (siehe §5.9).
- **Inline-Edit aktiv:** Der Wert wird zum Eingabefeld — Rahmen 1.5px `--jv-accent`, `--jv-radius-sm`, Hintergrund `--jv-bg`, zusätzlicher Fokus-Ring (`box-shadow: 0 0 0 3px` Akzent bei ~15 %). Enter committet, Escape bricht ab (bestehendes Verhalten).
- **Flash (Segment-Sprung):** kurzzeitig volle Akzent-Fläche + `--jv-accent-text`, danach Transition zurück (bestehendes `json-row-flash`-Verhalten, nur an Tokens angeglichen).
- Werte: String/Number/Boolean/null in den Syntax-Tokens aus §4.2. `null` ist nicht editierbar (Typ-Wechsel nur im Source-Modus) — beibehalten.

### 5.4 Verschachtelter Block

Das Kernelement von Direction B. Jedes Objekt/Array ab Tiefe ≥ 1 wird als zusammenhängender Block dargestellt:

- Hintergrund `--jv-nest-tint` (stapelnd, gedeckelt — §4.5), `border-radius: --jv-radius-md`, vertikales Innen-Padding `--jv-space-2`, kleiner vertikaler Außenabstand zwischen Geschwister-Blöcken (`--jv-space-2`).
- Die öffnende Zeile (`"key": {`), die Kind-Zeilen und die schließende Klammer-Zeile (`}`) liegen **gemeinsam** im Block.
- Die Einrückungslinie innerhalb des Blocks (`border-left` an `.json-content`) bleibt; im aktiven Pfad Akzent-farbig.
- Tiefe-0 (das Wurzel-Objekt) bekommt **keine** Tönung — nur die verschachtelten Ebenen.

### 5.5 Collapse-Toggle & Collapse-Chip

- **Toggle:** ersetzt die Text-Glyphen `▼`/`▶` durch ein **SVG-Chevron** (aus dem `design/`-Ordner übernommen). Im offenen Zustand 90° rotiert, Transition `--jv-dur-base --jv-ease`. Farbe `--jv-fg-faint`, Hover `--jv-fg`.
- **Collapse-Chip:** Ist ein Knoten eingeklappt, zeigt die Zeile statt des eingeklappten Inhalts eine **Chip-Pill**:
  - Objekt → `{ N keys }` · Array → `[ N items ]` (N = Anzahl direkter Kinder; Singular bei N = 1).
  - Stil: Hintergrund `--jv-bg-inset`, Text `--jv-fg-muted`, `border-radius: --jv-radius-lg` (Pill-Form), `font-size` ~11px, Padding `--jv-space-1` `--jv-space-3`.
- **Collapse-Animation:** Höhen-/Opazitäts-Transition wie heute (`max-height` + `opacity`), an Token-Dauern angeglichen, `prefers-reduced-motion`-fest. Bekannte Limitierung (`max-height: 5000px` clippt sehr hohe Bäume) bleibt dokumentiert für v1.2.

### 5.6 Error-Banner

Erscheint bei ungültigem JSON (Parse-Fehler).

- Layout: Grid `[Icon] [Text] [Aktion]`. Hintergrund `color-mix` aus `var(--text-error)` ~10 %, Rahmen ~35 %, linke Kante 3px voll `var(--text-error)`, `border-radius: --jv-radius-md`, Padding `--jv-space-4` `--jv-space-5`, Außenabstand `--jv-space-4` `--jv-space-5`.
- Icon: ein Warn-SVG in `var(--text-error)`.
- Text: Monospace, Fehlermeldung mit **Zeile/Spalte** (z.B. „Unerwartetes Token `}` — Zeile 4, Spalte 3").
- Aktion: Button „→ Zu Zeile N" — Rahmen `--jv-border`, beim Klick Wechsel in Source-Modus mit Cursor auf der Zeile (Verhalten ggf. v1.2; CSS-seitig vorsehen).

### 5.7 Empty-State

Erscheint bei einer leeren `.json`-Datei.

- Zentriert, vertikal gestapelt, Padding großzügig (`--jv-space-6`+).
- Glyphe: ein `{ }` in großer Monospace, gedämpft (`--jv-fg-faint`), mit gestricheltem Rahmen `--jv-border`, `--jv-radius-lg`.
- Überschrift „Diese JSON-Datei ist leer" in `--jv-fg`, weight 600.
- Unterzeile in `--jv-fg-muted`.
- Primär-Button „Leeres Objekt erstellen": Akzent-Fläche, `--jv-accent-text`, `--jv-radius-md` (bestehendes `json-empty-state-init`-Verhalten).

### 5.8 Tooltip

Hover-Vorschau eines Wertes (bestehendes Singleton-Tooltip, 500ms Delay).

- Hintergrund `--jv-bg-panel`, Rahmen `--jv-border`, `--jv-radius-md`, weicher Schatten, Padding `--jv-space-3` `--jv-space-4`, `max-width` ~320px.
- Kopfzeile: Typ als kleines **Badge** (Akzent-Fläche, `--jv-accent-text`, uppercase, ~10px) + Meta-Info (z.B. „15 Zeichen") in `--jv-fg-muted`.
- Vorschau: Monospace, `--jv-fg`, `white-space: pre-wrap`, `word-break`.
- Bekannte Limitierung (`ttHeight` hardcodiert) bleibt für v1.2 dokumentiert.

### 5.9 Copy-Button

- Nur bei Zeilen-Hover sichtbar (`opacity` 0 → ~0.7), rechtsbündig (`margin-left: auto`).
- Icon: ein Copy-SVG (aus `design/` übernommen) + optionales Label. Rahmen `--jv-border`, `--jv-radius-sm`, Text `--jv-fg-muted`.
- Hover auf den Button selbst: volle Deckung, `--jv-fg`, Hintergrund `--jv-hover`.
- Zustand „kopiert": Text/Border `var(--text-success, --color-green)`, volle Deckung, kurz gehalten.
- Verhalten bleibt: Klick kopiert den Wert, Alt+Klick kopiert den Pfad.

### 5.10 Codeblock-Embed

Read-only Tree aus einem ` ```json `-Block in einer Markdown-Notiz. Soll erkennbar zum Plugin gehören, sich aber im Lesefluss nicht aufdrängen.

- Wrapper: dezente Karte — Rahmen `--jv-border`, `--jv-radius-md`, Hintergrund leicht abgesetzt (`--jv-bg-inset`), `overflow: hidden`, vertikaler Außenabstand `--jv-space-4`.
- Kopfzeile: kleine Leiste, Hintergrund `--jv-bg-panel`, Eck-Label „JSON" (uppercase, klein, Akzent-farbig) links, Copy-Button rechts.
- Body: derselbe Direction-B-Tree wie in der Dateiansicht — **getönte Blöcke und Collapse-Chips gelten auch hier** —, aber read-only: keine Inline-Edit-Affordances, kein Hover-Edit-Unterstrich.
- **Auto-Collapse:** Eingebettete Blöcke mit mehr als ~20 Zeilen starten **eingeklappt**, damit lange JSON-Blöcke den Notiz-Lesefluss nicht sprengen. (Im Brainstorming als Default bestätigt.)
- **Ungültiges JSON im Block:** dieselbe Karte, aber das Eck-Label wird rot („JSON · Fehler") und statt des Trees erscheint eine kompakte Fehlerzeile (Zeile/Spalte). Ersetzt den heutigen `json-codeblock-error-indicator`.

### 5.11 Source-Modus

Der Source-Modus ist ein CodeMirror-6-Wrapper mit `@codemirror/lang-json` — Syntax-Highlighting liefert CM6 selbst. Das Redesign fasst hier **nicht** tief ein:

- Die Toolbar (§5.1) wird geteilt — Source-Modus sitzt sauber darunter.
- Container-Hintergrund/-Padding an die Tokens angeglichen.
- CM6 folgt dem aktiven Obsidian-Theme automatisch — nicht überschreiben.

---

## 6. Asset-Inventar — Übernahme aus `design/`

Der `design/`-Ordner enthält einen vollständigen Alternativentwurf („Kuro Signal Protocol"). Daraus wird gezielt übernommen:

### 6.1 Jetzt übernehmen

| Asset | Quelle | Nutzung |
|---|---|---|
| Theme-aware Token-Mapping-Layer | `plugin-build/styles.css` §1–2 (aware-Modus) | Vorlage für das `--jv-`-Token-System (§4). Klassen-Präfix von `--je-` auf `--jv-` ändern. |
| SVG-Icon-Set | `plugin-build/styles.css` (inline SVGs) | Collapse-Chevron, Copy, Mode-Pills, Error, Empty-Glyphe — ersetzen Text-Glyphen. |
| Chrome-CSS | `plugin-build/styles.css` §3–9 | Stil-Referenz für Toolbar, Breadcrumb, Tooltip, Error-Banner, Empty-State — auf `.json-*`-Klassennamen umgemünzt (siehe §8). |
| Motion-Werte | `plugin-build/styles.css` | Dauern/Easing für die `--jv-`-Motion-Tokens. |

### 6.2 Später übernehmen (Backlog, nicht in diesem Paket)

| Asset | Quelle | Ziel |
|---|---|---|
| Filter-/Such-Logik | `patches.md` §render.ts (3), `je-search`-CSS | v1.2 |
| Keyboard-Navigation, `tabindex` | `patches.md` §JsonFileView (2) | v1.3 |
| `DirtyState`-Modul + Dirty-Indikator | `plugin-build/DirtyState.ts`, `je-dirty`-CSS | v1.3 (oder v2.0 Edit-Features) |
| Minimap, Keyboard-Hints-Leiste | `plugin-build/styles.css` §10, §12 | v1.3 |
| Classic-Marker `branchHints`-Präfix | `patches.md` §render.ts (1) | bei Bedarf, wenn Classic-Marker überarbeitet werden |

Die Spec verlinkt `design/plugin-build/patches.md` als Referenz für diese Backlog-Punkte — sie werden hier **nicht** umgesetzt.

### 6.3 Verworfen

`KuroLine.ts` und die Lore-`LINE_MAP` · Aspekte (`shugo`/`gunshi`/`kantoku`/`sensei`, `data-aspect`) · „Full chamber"-Modus (hardcodierte Void-Palette) · die 7 Lore-Settings · `tokens.css` (Google-Fonts-`@import` — Remote-Loading, Store-Blocker) · die React-Design-Scaffolding-Dateien (`design-canvas.jsx`, `prototype.jsx`, `variations.*`, `deck-stage.js`, `JSON Editor - *.html`).

---

## 7. Marketing-Screenshot-Brief

Reine Mockup-Vorlagen für die Store-Einreichung und das README — **kein CSS-Deliverable**.

**Screenshot-Set (5 Stück):**

1. **Hero** — Tree-Ansicht, Direction B, mit Toolbar, ein realer Beispiel-JSON (z.B. `manifest.json` oder ein Config-File), in einem populären Theme.
2. **Source-Modus** — derselbe Inhalt mit CM6-Syntax-Highlighting.
3. **Inline-Edit** — eine Zeile im aktiven Edit-Zustand.
4. **Codeblock-Embed** — der read-only Tree eingebettet im Lesefluss einer Markdown-Notiz.
5. **Light/Dark-Paar** — dasselbe Bild nebeneinander in hellem und dunklem Theme, als Theme-Treue-Beweis.

**Framing-Vorgaben:**

- Einheitliche Fenster-Titelleiste, realer (nicht Platzhalter-)JSON-Inhalt, weicher Akzent-Backdrop.
- Maße: Store-Screenshots ~1280×800; README-Inline-Bilder kleiner skaliert.
- Konsistente Dateinamen, im Spec/README-Kontext referenzierbar.

---

## 8. Implementierungs-Hinweise

Direction B ist **kein reines CSS-Projekt**. Folgende Code-Berührungen sind nötig (Details kommen in den separaten Implementierungsplan):

- **`src/core/render.ts`:**
  - Tiefen-Information an verschachtelte Container ausgeben (`data-depth`-Attribut oder Tiefen-Klasse) — die Tönungs-Deckelung (§4.5) braucht das. Der `depth`-Parameter existiert bereits in `renderObject`/`renderArray`, wird aber nicht ans DOM gegeben.
  - Collapse-Chip rendern: beim Einklappen Anzahl direkter Kinder ermitteln und als Chip-Element zeigen.
  - SVG-Chevron statt Text-Glyphe `▼`/`▶` ausgeben.
- **Klassen-Namen:** Die bestehenden `.json-*`-Klassennamen **bleiben** (`.json-row`, `.json-tree-root`, `.json-content`, `.json-container`, `.json-key`, …). Der `design/`-Ordner nutzt `.je-*`; das übernommene CSS wird auf die bestehenden Namen umgemünzt. Begründung: ein Rename würde `render.ts`, die obsidian-Adapter **und 122 Tests** anfassen, ohne funktionalen Gewinn.
- **`src/obsidian/JsonFileView.ts` / `Breadcrumb.ts`:** Mode-Toggle und Breadcrumb in die gemeinsame Toolbar (§5.1) zusammenführen.
- **`src/obsidian/CodeblockProcessor.ts`:** Auto-Collapse ab ~20 Zeilen (§5.10); Fehler-Darstellung als rote Karte statt Eck-Indikator.
- **Test-Auswirkung:** Da die Klassennamen bleiben, bleiben klassenbasierte Assertions gültig. Neues DOM (Collapse-Chip-Element, `data-depth`) erfordert **ergänzte/aktualisierte** Tests in `render.test.ts`. Es entsteht **kein** breiter Test-Rewrite.
- **Keine neuen Settings** — `SettingsTab.ts` wird nicht erweitert.

---

## 9. Definition of Done

- [ ] `styles.css` neu, vollständig token-basiert (`--jv-`), alle Komponenten aus §5 abgedeckt.
- [ ] Funktioniert sichtbar korrekt in Dark **und** Light (Obsidian-Default-Themes).
- [ ] Stichprobe in 2–3 populären Community-Themes — kein Bruch.
- [ ] Keine hardcodierten Farben außer als `var(..., #fallback)`-Fallback.
- [ ] Keine Remote-Ressourcen (keine Web-Fonts, keine externen URLs).
- [ ] Keine neuen Settings.
- [ ] `render.ts`-Änderungen umgesetzt (Tiefen-Attribut, Collapse-Chip, SVG-Chevron); `npm run build` läuft sauber.
- [ ] Test-Suite grün — bestehende Tests angepasst wo nötig, neue Tests für Chip + Tiefen-Attribut.
- [ ] `prefers-reduced-motion` deaktiviert alle Transitions.
- [ ] 5 Marketing-Screenshots nach §7 erstellt.

---

## 10. Bewusst zurückgestellt / offene Punkte

- **Such-/Filter-Funktion** → v1.2. Referenz: `design/plugin-build/patches.md`.
- **Keyboard-Navigation & Dirty-State** → v1.3. Referenzen: `patches.md`, `design/plugin-build/DirtyState.ts`.
- **Bekannte CSS-Limitierungen** (aus `AGENTS.md`) bleiben für v1.2 offen: `max-height: 5000px` clippt sehr hohe Bäume; `Tooltip`-`ttHeight` hardcodiert.
- **„comfortable"-Dichte-Variante** (luftigeres Editorial-Layout aus Direction C) wurde *nicht* aufgenommen — es kam keine umschaltbare Dichte in Scope (würde ein neues Setting bedeuten). Direction B bleibt bei seiner mittleren Dichte.
