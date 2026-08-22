# GUI-Smoke — Checkliste gegen ein laufendes Obsidian

Was hier steht, prüft die **Naht zum Host**: echtes CSS und echte Geometrie, echtes
Live-Preview-DOM, echte Klicks (`isTrusted`), echter Speicherpfad, echter Lebenszyklus.
Die vitest-Suite (76 Dateien / 722 Tests) misst das strukturell nicht — sie läuft gegen
happy-dom und einen Obsidian-Mock.

Dass das kein theoretischer Unterschied ist, ist hier zweimal belegt:

- **1.10.1** — Bindestriche in `.jsonc`-Kommentaren lösten den Lossy-Number-Guard aus
  (`Number("-")` = `NaN`) und sperrten das Tree-Editieren auf unbedenklichen Dateien.
  633 Tests grün.
- **1.11.0** — `scrollToPath` expandierte die Vorfahren seines Ziels nie, und 1.10.2's
  Umstellung auf `display: none` hatte daraus einen vollständigen No-Op gemacht: der
  Brotkrumen-Klick war **einen Monat lang tot**. 705 Tests grün.

## Automatisiert: `npm run smoke:gui`

Voraussetzung — der eine Handgriff, der Handarbeit bleibt (Obsidian muss dafür neu
starten):

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/json-editor" npm run deploy
npm run smoke:gui -- --vault <vault-name>
```

Der Plugin-Ordner heißt nach der `manifest.json`-`id` (`json-editor`), nicht nach dem Repo.
`--keep` lässt die angelegten Prüfdateien stehen, `--section <key>` fährt nur einen
Abschnitt (`ansicht`, `layout`, `navigation`, `editieren`, `codeblock`).

Der Treiber legt seine Prüfdateien selbst an, lädt das Plugin im Renderer neu (sonst misst
er den zuletzt geladenen Stand statt des gerade gebauten), schreibt die Plugin-Settings am
Ende auf den Vorwert zurück und wirft die Prüfdateien in den **Papierkorb** — auch nach
einem Abbruch.

| # | Prüfpunkt | Warum kein Unit-Test |
|---|---|---|
| **A — Datei-Ansicht** | | |
| A1 | `.json` öffnet in `json-editor-view`, nicht als Markdown/Text | `registerExtensions` ist ein Host-Claim; Kollisionen sieht nur der echte Host |
| A2 | Tree rendert mit den erwarteten Schlüsseln | Live-DOM statt happy-dom |
| A3 | `.jsonc` mit Kommentaren ist editierbar (kein Lossy-Banner) | historischer Defekt 1.10.1 |
| A4 | Kaputtes JSON erzwingt Source-Modus + Fehler-Banner | Modus-Erzwingen ist Host-Lebenszyklus |
| **B — Layout & Theme** | | |
| B1 | Trennkomma dockt am Wert an statt frei zu schweben | echte Flex-Geometrie; historischer Defekt 1.10.2 |
| B2 | Eingeklappter Subtree beansprucht keine Breite (`display:none`) | „Höhe 0 heißt nicht Platz 0" — nur im echten Layout messbar |
| B3 | Theme-Variablen greifen: Key- und String-Farbe verschieden und gesetzt | `getComputedStyle` gegen echtes Theme-CSS |
| B4 | Über `hidden` versteckte Elemente sind wirklich unsichtbar | die `[hidden]`-Spezifitätsfalle (1.8.0) — CSS-Kaskade |
| **C — Navigation** | | |
| C1 | collapse-all / expand-all wirken auf alle Container | Befehls-Registrierung im Host |
| C2 | Sprung auf einen Pfad **in einem eingeklappten Ast** macht die Zeile sichtbar | der einen Monat tote Brotkrumen-Klick (1.11.0) |
| C3 | Suche zählt Treffer und Enter wandert von Treffer zu Treffer | Fokus + Scroll im echten Fenster |
| **D — Editieren** | | |
| D1 | Echter Mausklick auf einen Wert öffnet das Inline-Feld | `isTrusted:false` läuft an Host-Pfaden vorbei |
| D2 | Geänderter Wert landet auf der Platte | echter `requestSave`-Weg statt Mock |
| D3 | Undo stellt den Dateiinhalt wieder her | Befehl + History über den echten Host |
| D4 | `.jsonc`-Edit erhält die Kommentare in der Datei | dualer Mutationspfad, echter Schreibweg |
| **E — Codeblock in Notizen** | | |
| E1 | ```` ```json ````-Block rendert im Lesemodus als Tree | Markdown-Post-Processor, echtes Preview-DOM |
| E2 | Kaputter Block fällt auf die Fehler-Karte zurück | dito |
| E3 | Der Copy-Knopf schreibt wirklich in die Zwischenablage | der Knopf hatte bis 1.11.2 **gar keinen** Guard |

## Bleibt Handarbeit

Mechanisch nicht entscheidbar — dafür bleibt die Runde von Hand:

- Ob das Ergebnis **gut aussieht** (Abstände, Kontrast, Ruhe im Bild).
- **Mobile/Touch** (Long-press-Menü, 44-px-Ziele, Alt+Arrow-Reorder): braucht ein echtes
  iOS-Gerät, kein Debug-Port.
- **Drag-and-Drop-Reorder**: HTML5-DnD ist über CDP nicht ehrlich nachstellbar.
- **Popout-Fenster** (`activeDocument`-Pfade) und das Verhalten über einen
  Obsidian-Neustart hinweg.
- **Große Dateien** (mehrere MB): Laufzeit-Eindruck statt Messwert.

## Durchläufe

| Datum | Obsidian | Plugin | Ergebnis | Gegenprobe |
|---|---|---|---|---|
| 2026-08-22 | 1.13.7 | 1.11.2 + Fix | **18/18** (Vault `10_Pallas`) | **bestanden**: Fix ausgebaut → genau D3 rot, kein anderer Punkt fällt mit |

**Was der erste Lauf gefunden hat** — ein echter Defekt und drei Mängel am Werkzeug selbst:

- **Befund (behoben):** Das **erste** Ctrl/Cmd+Z nach einem Tree-Edit tat nichts. Der
  Inline-Editor ließ den Fokus auf seinem bereits aus dem Dokument entfernten `<input>`;
  der nächste `replaceChildren()` löste darauf einen blur aus, und Chromium brach die
  ganze Operation ab (`NotFoundError`). Der Befehl fing die Ausnahme und meldete sich als
  „nicht anwendbar" — erst das zweite Undo wirkte. Die Suite (726 Tests) sieht das
  strukturell nicht: happy-dom rechnet kein Layout und stellt diesen Fokus-Sonderfall
  nicht nach. Nur der Rename-Pfad war auch dort messbar und ist als Regressionstest
  festgehalten (`tests/obsidian/TreeView.editfocus.test.ts`).
- **Werkzeug:** Ein Prüfpunkt fragte nach der *Existenz* des Lossy-Banners statt nach
  seiner Sichtbarkeit — er wäre in jedem Lauf rot gewesen. Ein zweiter verglich Chip und
  Komma verschiedener Verschachtelungsebenen (−437 px). Und der Treiber meldete die
  Version aus Obsidians beim Start eingelesenem Manifest statt aus der deployten Datei:
  „1.11.1" für einen 1.11.2-Deploy — eine Zahl, die genau dann irreführt, wenn man ihr
  glaubt.
- **Aufräumen:** Das Zurückschreiben der Einstellungen wirkte nicht, weil der
  per-Datei-Collapse-Zustand gar nicht in `settings` liegt, sondern in `collapseStates` —
  `persist()` schreibt beides zusammen, also setzte jedes Speichern die Prüfdateien wieder
  in `data.json`. Der Treiber räumt jetzt beide Felder und **verifiziert an der Datei**,
  nicht am Objekt im Speicher.
