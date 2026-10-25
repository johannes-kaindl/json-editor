# GUI-Smoke — Checkliste gegen ein laufendes Obsidian

Was hier steht, prüft die **Naht zum Host**: echtes CSS und echte Geometrie, echtes
Live-Preview-DOM, echte Klicks (`isTrusted`), echter Speicherpfad, echter Lebenszyklus.
Die vitest-Suite misst das strukturell nicht — sie läuft gegen
happy-dom und einen Obsidian-Mock.

**Bilanz-Format und Exit-Codes (seit Welle 18, 2026-10-12):** Der Treiber nutzt `tools/obsidian-cdp/bilanz.ts`. Die Schlusszeile heißt `N gruen · N rot · N uebersprungen · N nichts gemessen · von N Pruefpunkten`, die Marker je Punkt sind `[ok]`, `[ROT]`, `[--]`, `[??]`. Exit 0 bei grün und übersprungen, **Exit 1 bei rot ODER nichts gemessen**, **Exit 2 bei einem Abbruch des Treibers** (vorher 1). Vor und nach dem Umbau, jeweils im frischen Prozess (Port 9388): 31 grün · 0 rot · 0 übersprungen · 0 nichts gemessen.

Dass das kein theoretischer Unterschied ist, ist hier zweimal belegt:

- **1.10.1** — Bindestriche in `.jsonc`-Kommentaren lösten den Lossy-Number-Guard aus
  (`Number("-")` = `NaN`) und sperrten das Tree-Editieren auf unbedenklichen Dateien.
  633 Tests grün.
- **1.11.0** — `scrollToPath` expandierte die Vorfahren seines Ziels nie, und 1.10.2's
  Umstellung auf `display: none` hatte daraus einen vollständigen No-Op gemacht: der
  Brotkrumen-Klick war **einen Monat lang tot**. 705 Tests grün.

## Automatisiert: `npm run smoke:gui`

Der Treiber läuft gegen eine **Zweitinstanz** mit eigenem Profil und eigenem Port; die reguläre Instanz (9222) wird nie angefasst und nie beendet. `--port` ist Pflicht. Vertrauensdialog und Restricted Mode eines frischen Profils erledigt `bereiteInstanzVor` aus der zentralen Brücke. Der Vault ist von Hand eingerichtet (kein `buildVault`), das Plugin wird per `npm run deploy` hineinkopiert.

```bash
echo "$STAGING_VAULTS_DIR"                                       # muss gesetzt sein (~/.zshenv)
D="$STAGING_VAULTS_DIR/json-editor/.obsidian/plugins/json-editor"; mkdir -p "$D"
OBSIDIAN_PLUGIN_DIR="$D" npm run deploy
UD=/tmp/obs-test-json-editor; mkdir -p "$UD"
lsof -nP -iTCP:9398 -sTCP:LISTEN && echo "Port belegt — anderen nehmen"
pgrep -f "user-data-dir=$UD" && echo "Profil belegt — $UD-w19 nehmen, nie beenden"
cp ~/Library/Application\ Support/obsidian/obsidian-*.asar "$UD"/   # aktuelle Version statt gebündelter
node -e 'const p=process.env.STAGING_VAULTS_DIR+"/json-editor";require("fs").writeFileSync(process.argv[1]+"/obsidian.json",JSON.stringify({vaults:{"json-editor":{path:p,ts:Date.now(),open:true}},language:"en"}))' "$UD"
/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9398 &   # je Messlauf ein frischer Prozess, PID merken
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label json-editor --intent "Smoke :9398" --exclusive focus --port 9398 --ttl 300
npm run smoke:gui -- --port 9398 --vault json-editor
python3 ~/.claude/hooks/obsidian-cdp-lock.py release            # danach nur die eigene PID beenden
```

Der erste Lauf nach der Profilanlage ist ein Aufwärmlauf und zählt nicht. Die Bilanz zählt in vier Zuständen (grün · rot · übersprungen · nichts gemessen); Nenner ist die Soll-Liste der gewählten Abschnitte plus ein Vorlauf-Punkt, ein Abbruch endet mit Exit 2.

Der Plugin-Ordner heißt nach der `manifest.json`-`id` (`json-editor`), nicht nach dem Repo.
`--keep` lässt die angelegten Prüfdateien stehen, `--section <key>` fährt nur einen
Abschnitt (`ansicht`, `layout`, `navigation`, `editieren`, `codeblock`, `repair`).

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
| A5 | Die Tree-/Source-Pillen tragen `aria-pressed` und wechseln mit dem Modus | Zustands-Knöpfe (UI-STANDARD §8): der Klick und das Attribut am Live-DOM des Hosts |
| **B — Layout & Theme** | | |
| B1 | Trennkomma dockt am Wert an statt frei zu schweben | echte Flex-Geometrie; historischer Defekt 1.10.2 |
| B2 | Eingeklappter Subtree beansprucht keine Breite (`display:none`) | „Höhe 0 heißt nicht Platz 0" — nur im echten Layout messbar |
| B3 | Theme-Variablen greifen: Key- und String-Farbe verschieden und gesetzt | `getComputedStyle` gegen echtes Theme-CSS |
| B4 | Über `hidden` versteckte Elemente sind wirklich unsichtbar | die `[hidden]`-Spezifitätsfalle (1.8.0) — CSS-Kaskade |
| B5 | Die A11y-Ansage-Region ist unsichtbar, aber nicht stumm (1×1 px, kein `display:none`) | der Unit-Test prüft die CSS-Quelle, nicht ob sie wirkt; „sichtbar“ und „stumm“ (`display:none` nimmt sie aus dem Accessibility-Tree) sind beide nur im echten Browser messbar |
| **C — Navigation** | | |
| C1 | collapse-all / expand-all wirken auf alle Container | Befehls-Registrierung im Host |
| C2 | Sprung auf einen Pfad **in einem eingeklappten Ast** macht die Zeile sichtbar | der einen Monat tote Brotkrumen-Klick (1.11.0) |
| C3 | Suche zählt Treffer und Enter wandert von Treffer zu Treffer | Fokus + Scroll im echten Fenster |
| **D — Editieren** | | |
| D1 | Echter Mausklick auf einen Wert öffnet das Inline-Feld | `isTrusted:false` läuft an Host-Pfaden vorbei |
| D2 | Geänderter Wert landet auf der Platte | echter `requestSave`-Weg statt Mock |
| D3 | Undo stellt den Dateiinhalt wieder her | Befehl + History über den echten Host |
| D4 | `.jsonc`-Edit erhält die Kommentare in der Datei | dualer Mutationspfad, echter Schreibweg |
| D5 | Reorder per Alt+Pfeil nimmt den anhängenden Kommentar mit, den durch eine Leerzeile abgetrennten nicht | die Kernfunktion hat eigene Unit-Tests; gemessen wird die ganze Kette Zeile → TreeView → `jsonc.ts` → Platte per Tastatur |
| D6 | Löschen eines Objekts mit Kindern: keine Rückfrage, die Meldung nennt die Zeile und trägt „Undo“, der Knopf stellt sie wieder her | Entscheidung Johannes 2026-10-15 (Welle 23); beide Hälften an der Datei auf der Platte, die Meldung ist Obsidians geteilter Toast |
| **E — Codeblock in Notizen** | | |
| E1 | ```` ```json ````-Block rendert im Lesemodus als Tree | Markdown-Post-Processor, echtes Preview-DOM |
| E2 | Kaputter Block fällt auf die Fehler-Karte zurück | dito |
| E3 | Der Copy-Knopf schreibt wirklich in die Zwischenablage | der Knopf hatte bis 1.11.2 **gar keinen** Guard |
| E4 | `![[Datei.json]]` zeigt im Lesemodus den eingeklappten Baum statt des Datei-Chips | der Chip ist Obsidians Standard für ein Embed ohne eigene Darstellung; gemessen am sichtbaren Lesemodus-Container, Gegenprobe ist die Abwesenheit des Posters (Registrierung entfernen: kein `.json-file-embed`) |
| E5 | Der Embed-Baum klappt auf Klick auf, und die Kopfzeile trägt den Dateinamen | echter Klick im Lesemodus-Container, wie E4 |
| E6 | Im Embed steht die Wurzel-Klammer links, nicht zentriert | Obsidians `.internal-embed.file-embed` setzt `text-align: center`, die Wurzelzeile erbte es; nur im echten Theme-CSS messbar (Abnahme am Screenshot, Welle 23) |
| **F — Reparatur per LLM** (Fake-Endpunkt im Treiber-Prozess, kein Netz, kein Modell) | | |
| F1 | Die Fehlerkarte eines kaputten Codeblocks zeigt den Reparatur-Knopf | Markdown-Post-Processor im echten Lesemodus-DOM |
| F2 | Der Klick öffnet das Modal mit Diff (Original links, Vorschlag rechts), Anwenden ist frei | echter Mausklick auf den Host-Knopf, Modal und Diff im Live-DOM |
| F3 | Die Anfrage trägt Modell, Profilwerte (`temperature`, `stream: false`) und den Parser-Fehler | der Fake-Endpunkt hält den Request fest, den das Plugin über den Obsidian-Transport wirklich gesendet hat; ein Unit-Test sähe nur den gebauten Prompt |
| F4 | Anwenden ersetzt nur den Blockinhalt, der Rest der Notiz bleibt byte-gleich | echter Schreibweg auf die Platte |
| F5 | Das Modal schließt nach Anwenden | Modal-Lebenszyklus im Host; ohne Klick gab es nie ein Modal, das sich schließen könnte, deshalb prüft der Punkt den Klick mit |
| F6 | Eine ungültige Antwort sperrt Anwenden und lässt die Notiz unberührt | Fehlerweg bis ins Modal und auf die Platte |
| **G — Schwärzung und Schlüsselbund** (Verbindung des Kits, derselbe Fake-Endpunkt) | | |
| G1 | Ein Bearer-Token geht geschwärzt raus, der Vorschlag trägt das Original zurück | die Schwärzung wird am Draht gemessen (Mitschnitt des Fake-Endpunkts), die Rückführung im Modal |
| G2 | Ein PEM-Schlüssel als JSON-String (`\n` maskiert) geht geschwärzt raus und kommt als gültiges JSON zurück | wie G1, mit einem mehrzeiligen Schlüssel in einem JSON-String |
| G3 | Ein PEM-Schlüssel mit echten Zeilenumbrüchen (das JSON ist dadurch kaputt) kommt als gültiges JSON zurück | wie G2, aber die Zeilenumbrüche machen die Datei zu kaputtem JSON (der Parser lehnt sie ab) |
| G4 | Kein `apiKey` in `data.json`, der Schlüssel liegt im Schlüsselbund | gelesen wird die echte `data.json` auf der Platte und die Auflösung durch den Host-Schlüsselbund |
| **CL — Claude als Endpunkt der Reparatur** (Stub im Anthropic-Modus, kein Netz) | | |
| CL1 | Der Manager liefert den Claude-Endpunkt nur auf Opt-in (`transports.anthropic`); das Plugin wählt ihn (Backend `anthropic`, Familie `claude`) | ohne den Opt-in sieht das Plugin den Endpunkt nie; die Kontrolle am Fake (`list()` ohne Transporte: 0) macht „gewählt“ erst aussagekräftig |
| CL2 | Reparatur-Lauf bis ins Diff-Modal: `POST /v1/messages` mit `x-api-key` und `anthropic-version`, `max_tokens` gleich dem Budget, ohne `temperature`/`top_p`; der Vorschlag steht im Modal | der Stub prüft Pfad, Kopfzeilen und Pflichtfelder wie die API (400/401 sonst) |
| CL3 | Antwortet die API 529, zeigt das Modal den Fehler, Anwenden bleibt gesperrt, die Notiz bleibt unberührt | Fehlerweg über den echten Transport |
| **H — Reparatur in der Datei-Ansicht** (Banner-Knopf, Fake-Endpunkt) | | |
| H1 | Das Fehler-Banner der Datei-Ansicht trägt den Reparatur-Knopf | zweiter Einstieg neben der Fehlerkarte (F1): Banner der Host-Ansicht im Live-DOM |
| H2 | Der Klick öffnet das Modal mit Diff, Anwenden ist frei | wie F2, aus der Datei-Ansicht |
| H3 | Anwenden schreibt den Vorschlag in die Datei, das Banner verschwindet | echter Schreibweg, das Banner folgt dem neuen Zustand der Ansicht |
| H4 | Rückgängig holt den kaputten Text zurück | Verlauf der Datei-Ansicht (wie D3) |
| H5 | Gemma 4 ohne Öffner: der Vorschlag ist das JSON, der Denktext steht nicht darin | Gemma 4 auf LM Studio schreibt das Denken ohne Öffner in `content` und beendet es mit `<channel\|>`; ohne die Kit-Behandlung (obsidian-kit ab 0.60.3) stünde der Denktext im Vorschlag |

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
| 2026-10-09 | 1.14.4 | 1.14.2 + Verbindungs-Tausch (Kit 0.51.2) | **31/31** (Zweitinstanz Port 9373, Staging-Vault `json-editor`, frischer Prozess). Baseline vorher 27/27 (Gate 856 Tests). Neu: Abschnitt G (G1 Bearer-Token geschwärzt und zurück, G2 PEM als escaped JSON-String, G3 PEM mit echten Zeilenumbrüchen, G4 kein `apiKey` in `data.json`); `plugin.repairService.invalidate()` → `plugin.llm.invalidate()` | **bestanden**: `redact: false` in `repair-service.ts` → G1–G3 rot (G1/G2: Draht trägt den Token, G3: kein Vorschlag), kein anderer Punkt fällt mit |
| 2026-10-09 (2) | 1.14.4 | 1.14.2 + Tausch, Kit 0.51.3 / code-kit 0.15.4 | **31/31** (Zweitinstanz Port 9373, frischer Prozess), Gate 866 Tests; F3 weiter `stream false` | Mutationsprobe vom ersten Lauf gilt unverändert (Schwärzung aus → G1–G3 rot) |
| 2026-10-25 | 1.14.5 | 1.18.0 + Pin-Hebung (obsidian-kit 0.69.1 / code-kit 0.36.0) + Claude-Opt-in | **44/44** grün · 0 rot · 0 übersprungen · 0 nichts gemessen (Zweitinstanz Port 9551, Staging-Vault `json-editor`, frischer Prozess, Gate 895 Tests). Baseline vorher 41/41 (Gate 889). Neu: CL1–CL3 (Claude über den Manager, Stub im Anthropic-Modus). Der Nenner ist die Bilanzzeile des Treibers, keine Zahl in dieser Datei. | **bestanden**: Opt-in aus `repair-service.ts` entfernt → genau CL1–CL3 rot (11/14 im Abschnitt `repair`); `--klick-gegenprobe` → CL2 und CL3 rot, CL1 bleibt grün (ohne Klick) |
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
