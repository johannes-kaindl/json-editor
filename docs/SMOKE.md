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

⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
`quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
fällt nicht auf.

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
```

Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
`vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.

Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.

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

### Prüft der Prüfer? (`--klick-gegenprobe`, `--halten`)

Ein Prüfpunkt hinter einem Klick kann **grün am Falschen** sein: grün, obwohl der Klick nie
ankam, weil die gemessene Bedingung schon vorher wahr war. Das sieht man nur, wenn man den
Klick wegnimmt und Rot erwartet:

```bash
npm run smoke:gui -- --klick-gegenprobe   # klickt nicht — jeder Klick-Punkt MUSS rot werden
npm run smoke:gui -- --halten 150         # Press/Release mit Pause statt im selben Tick
```

`clickReal` schickt Press und Release ohne Haltedauer. Zeichnet die Ansicht sich dazwischen
neu, trifft das Release ein anderes Element und es entsteht **gar kein** `click`. Kippt ein
Punkt erst mit `--halten`, gehört die Schwelle notiert — der künftige Default der zentralen
Brücke wird aus gemessenen Zahlen gebildet, nicht geschätzt (beschlossen im Dach,
2026-08-30; die bekannten 150 ms stammen von *einem* Plugin).

**Gefahren wird im eigenen Staging-Vault** (`$STAGING_VAULTS_DIR/json-editor`), nicht im
Arbeits-Vault. Dort liegt bei den meisten Plugins der Store-Build statt des Repo-Stands,
und dort liegt fremdes Prüfmaterial — beides macht einen Lauf unbelegt.

### Läuft der Lauf gegen den eigenen Build? (seit 2026-09-02 erzwungen)

Vor dem ersten Prüfpunkt fragt der Treiber `requireEigenerBuild` (zentral in
`tools/obsidian-cdp/vault.ts`), ob die `main.js` im gemessenen Vault der frisch gebaute
Repo-Stand ist — entschieden am sha1, nicht an der Versionsnummer. **Die Versionsnummer
ist für diese Frage strukturell blind**: Store-Build und Repo-Build tragen dieselbe.

Der geprüfte Pfad kommt aus der **laufenden Instanz** (`app.vault.adapter.basePath`), nicht
aus `stagingVaultDir(...)` — der Treiber dockt per `--vault` an ein beliebiges Fenster an,
und ein Check gegen den konventionellen Pfad prüfte dann eine Datei, die mit dem Lauf
nichts zu tun hat. Drei Ausgänge: `store-installiert`/`fremd`/`fehlt` brechen ab,
`ungeklaert` warnt und hängt die Warnung in die Abschlusszeile.

Daraus folgt die Reihenfolge oben: **erst `npm run deploy`** (baut und kopiert), dann
fahren. Ohne frischen Build im Repo-Root bleibt nur die billige Aussage.

*Anlass:* der Lauf 18/18 vom 2026-08-28 lief gegen die Store-Installation, nicht gegen den
Repo-Stand — dachweit standen an dem Tag 69 von 150 grünen Prüfpunkten auf ungeprüftem
Code. Ein grüner Punkt wird nicht untersucht; deshalb ist ein solcher Lauf schlimmer als
gar keiner.

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
| 2026-08-22 | 1.13.7 | 1.11.2 + Fix | 18/18 (Vault `10_Pallas`) — **unbelegt**, s. u. | bestanden: Fix ausgebaut → genau D3 rot, kein anderer Punkt fällt mit |
| 2026-09-02 | 1.13.7 | 1.11.3 | **18/18** (Staging-Vault `json_viewer`, Herkunft `deployt`) | **bestanden**: `--klick-gegenprobe` → 12/18, exakt die sechs klickabhängigen Punkte fallen (C2, D1–D4, E3), kein anderer fällt mit |
| 2026-09-03 | 1.13.7 | 1.12.0 + A11y | **20/20** (Staging-Vault `json_viewer`) — neu: D5 (Reorder-Kommentar) und B5 (Ansage-Region) | **bestanden**: `display:none` ins Stylesheet → genau B5 rot (`0x0px, display: none`), kein anderer Punkt fällt mit |
| 2026-09-25 | 1.14.2 | 1.12.0 + LLM-Reparatur | **27/27** (Zweitinstanz Port 9303, Staging-Vault `json-editor`) — neu: Abschnitt F (F1–F6: Knopf, Modal mit Diff, Request-Inhalt, Anwenden byte-genau, Schließen, ungültige Antwort). Baseline vorher 21/21 (der Aufwärmlauf zählt nicht: 20/21, C2 Kaltstart) | **bestanden**: `--klick-gegenprobe` → 15/27, zwölf Punkte fallen (C2, D1–D5, E3, F2–F6). F5 war zuerst ohne Klick grün (Vorbedingung fehlte) und wurde korrigiert |
| 2026-09-02 (2) | 1.13.7 | 1.11.3 | **18/18** (Staging-Vault `json_viewer`) — Bestätigung nach dem `styles.css`-Guard | `buildHerkunft` für `styles.css` in allen drei Ausgängen einzeln hergestellt: `deployt` · `fremd` (30.239 statt 30.213 Bytes) · `fehlt` |

Der Lauf vom **2026-08-22 ist rückwirkend als unbelegt zu lesen**: er lief gegen `10_Pallas`,
und dort lag die Store-Installation, nicht der Repo-Stand. Aufgefallen ist das erst am
2026-08-30 bei einer dachweiten Zählung (69 von 150 grünen Prüfpunkten standen auf
ungeprüftem Code) — der Treiber selbst konnte es nicht sehen, weil er sich an
`manifest.version` orientierte und beide Builds dieselbe Nummer tragen. Seit dem
2026-09-02 verhindert `requireEigenerBuild` genau diesen Lauf.

**Was der belegte Lauf gefunden hat** — beides am Werkzeug, nichts am Plugin:

- **Ein Prüfpunkt war zu Unrecht rot.** E3 meldete „Knopf nicht gefunden" für einen Knopf,
  der einwandfrei da war. Eine Markdown-Ansicht hält Editor- und Lesemodus-Container
  **gleichzeitig** im DOM; der inaktive ist 0×0 groß und steht im Dokument **vorne**.
  `document.querySelector(".json-codeblock-copy")` traf deshalb zuverlässig den
  unsichtbaren Zwilling (gemessen: 4 Karten, 2 Knöpfe, ein einziges Blatt). Die Messungen
  liefen längst über `inView`, nur die *Klicks* nicht — jetzt tun sie es (`elImView`), und
  `klick()` unterscheidet im Protokoll „nicht im DOM" von „da, aber 0×0".
- **Ein Prüfpunkt war zu Unrecht grün.** In der Gegenprobe fielen fünf der sechs
  klickabhängigen Punkte, D3 nicht: er maß „steht der Ausgangswert in der Datei?" — und
  ohne die vorangegangene Änderung aus D2 ist das trivial wahr. Undo hatte nichts
  rückgängig zu machen und der Punkt bestätigte es trotzdem. Die Vorbedingung wird jetzt
  mitgeprüft.

**Zur Haltedauer** (offene Dach-Frage, ab wann `clickReal` Press/Release trennen muss): in
diesem Repo kippt **kein** Punkt bei 0 ms — die Läufe mit `--halten 0` und `--halten 150`
sind beide 18/18. Aus json_viewer kommt also **kein Beleg für einen Default > 0**; eine
Schwelle war nicht messbar, weil nichts zu kippen war.

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
