# JSON Editor für Obsidian

**`.json`- und `.jsonc`-Dateien direkt in Obsidian ansehen und bearbeiten — mit Umschalter zwischen Baum und Quelltext, und Kommentaren, die das Bearbeiten überleben.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/json-editor?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/json-editor/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.5.7%2B-purple)](https://obsidian.md)

Rendert außerdem `` ```json ``- und `` ```jsonc ``-Codeblöcke in Markdown-Notizen als aufklappbare, theme-treue Bäume. Jede strukturelle Änderung an einer `.jsonc`-Datei wird als gezielte Textänderung angewendet — Kommentare und Formatierung bleiben genau da, wo du sie hingeschrieben hast.

**Zielplattform:** Obsidian 1.5.7+ auf Desktop und Mobile. Keine externen Dienste, keine entfernten Ressourcen, keine Telemetrie.

> **Status: 1.10.2 veröffentlicht.** Der Baum-Modus ist ein vollwertiger Struktur-Editor — Schlüssel anlegen/löschen/umbenennen, Elemente anlegen/löschen, Zeilen umsortieren (Drag-and-Drop oder `Alt`+`↑`/`↓`) und den JSON-Typ eines Wertes wechseln. Rückgängig/Wiederholen (`Cmd/Strg+Z` / `Cmd/Strg+Umschalt+Z`) arbeitet über beide Modi hinweg auf einem gemeinsamen Stapel. Auf Mobilgeräten machen ein Aktionsmenü per Langdruck, touch-gerechte Bedienelemente und Rückgängig-Schaltflächen in der Werkzeugleiste das Bearbeiten im Baum vollständig per Finger nutzbar. Optionale JSON-Schema-Validierung und ein Großdatei-Schutz runden den Editor ab. Die vollständige Historie steht in [`CHANGELOG.md`](CHANGELOG.md).

> **Hinweis:** Diese Übersetzung folgt der englischen [`README.md`](README.md). Bei Abweichungen gilt die englische Fassung.

---

## Worum es geht

JSON in Obsidian — ohne auf die Bedienung zu verzichten, die man von einem echten Editor erwartet. Eine `.json`-Datei öffnet sich in einer eigenen Ansicht mit zwei Modi:

- **Baum-Modus** — Werte auf- und zuklappen, direkt bearbeiten, per Hinzufügen/Umbenennen/Löschen/Umsortieren/Typwechsel umbauen; eine Brotkrumen-Leiste folgt dabei der Cursor-Position.
- **Quelltext-Modus** — CodeMirror 6 mit JSON-Syntaxhervorhebung, einem Banner für Parse-Fehler und `Cmd/Strg+F`-Suche.
- **Schema-bewusst (optional)** — die zuschaltbare JSON-Schema-Validierung markiert ungültige Zeilen in Echtzeit gegen eine begleitende `*.schema.json`-Datei.

Zusätzlich rendert das Plugin `` ```json ``-Blöcke in gewöhnlichen Markdown-Notizen als schreibgeschützte, aufklappbare Bäume — damit Konfigurations-Schnipsel und API-Beispiele aufhören, unlesbare Textwände zu sein.

Alles bleibt in deinem Vault. Das Plugin nutzt Obsidians eigene CSS-Variablen und folgt damit dem Theme, das du gerade verwendest — hell, dunkel, minimal, was auch immer.

---

## Funktionen

- **Ansicht für `.json`- und `.jsonc`-Dateien** mit Baum↔Quelltext-Umschalter in einer gemeinsamen Werkzeugleiste.
- **Kommentar-Erhalt bei `.jsonc`** — eine JSONC-Datei (mit Kommentaren und abschließenden Kommas) lässt sich im Baum bearbeiten; jede Änderung wird als gezielte Textänderung auf den Quelltext angewendet, Kommentare und Formatierung bleiben erhalten. Öffnen und Speichern ohne Änderung ist byte-identisch. `.json` bleibt streng (ein Kommentar ist dort ein Fehler). *Einschränkung beim Umsortieren:* eine allein stehende Kommentarzeile behält ihre Position — kein Kommentar geht verloren, er kann danach aber neben einem anderen Element stehen.
- **Werte direkt bearbeiten** im Baum-Modus — Wert anklicken, `Enter` übernimmt, `Esc` verwirft.
- **Struktur bearbeiten** — Schlüssel zu Objekten hinzufügen (`+ Add key` am Ende jedes Containers), Elemente an Arrays anhängen, Objekt-Schlüssel umbenennen (✎), beliebige Zeile löschen (✕ oder `Backspace`/`Entf` auf der fokussierten Zeile).
- **Umsortieren per Drag-and-Drop** — beim Überfahren einer Zeile erscheint ein `⋮⋮`-Griff; damit innerhalb des Containers nach oben/unten ziehen. Nur innerhalb desselben Elternknotens; rückgängig machbar.
- **Typwechsel** — jede Zeile hat eine `T`-Schaltfläche zum Wechseln des JSON-Typs (String / Zahl / Boolean / null / Objekt / Array). Destruktiv, aber rückgängig machbar.
- **Rückgängig / Wiederholen** — `Cmd/Strg+Z` und `Cmd/Strg+Umschalt+Z`. Die Historie ist **über Baum- und Quelltext-Modus vereinheitlicht** (ein gemeinsamer, 100 Schritte tiefer Text-Stapel seit 1.2.0); ein Moduswechsel löscht sie nicht mehr. Während des Tippens in einem Eingabefeld greift das native Rückgängig. Die Befehle für Rückgängig/Wiederholen und Suche kommen **ohne voreingestellte Tastenkürzel** — eine ansichts-lokale Tastenbelegung behandelt `Cmd/Strg+Z` / `Umschalt+Z` / `F`, solange die JSON-Ansicht den Fokus hat.
- **Suchen & Filtern** — `Cmd/Strg+F` öffnet eine Live-Suche, die den Baum strikt auf passende Schlüssel und Werte filtert (Teilzeichenkette, Groß-/Kleinschreibung egal); im Quelltext-Modus öffnet sich stattdessen CodeMirrors Suchleiste. `Esc` leert die Suche bzw. gibt den Fokus frei.
- **JSON-Schema-Validierung (zuschaltbar)** — in den Einstellungen aktivierbar; lädt automatisch eine begleitende `data.schema.json` neben `data.json`. Ein Banner zeigt die Fehleranzahl, betroffene Zeilen bekommen einen roten Rahmen samt Erklärung beim Überfahren. Standardmäßig aus — das automatische Laden von Schema-Dateien aus einem geteilten Vault ist eine Vertrauensentscheidung.
- **Großdatei-Schutz** — Dateien jenseits eines Render-Budgets (~1 MB bzw. ~15.000 Knoten) öffnen im Quelltext-Modus mit einem Banner *Load tree anyway*, damit eine mehrere Megabyte große Datei die Oberfläche nie beim Öffnen einfriert.
- **Schutz vor verlustbehafteten Zahlen** — Dateien mit Ganzzahlen, die JSON nicht exakt darstellen kann (> 2^53), öffnen den Baum schreibgeschützt mit einem Banner; der Quelltext-Modus bleibt bearbeitbar, sodass eine Änderung keine 64-Bit-IDs stillschweigend beschädigen kann.
- **Tastaturnavigation** — `Tab` fokussiert den Baum; `↓`/`↑` laufen durch die sichtbaren Zeilen; `→`/`←` klappen auf/zu bzw. springen zu Kind/Elternknoten; `Pos1`/`Ende` springen zur ersten/letzten sichtbaren Zeile; `Enter`/`F2` öffnen die Direktbearbeitung. WAI-ARIA-Baumrollen (`role="tree"`, `role="treeitem"`, `aria-expanded`) für Screenreader.
- **Brotkrumen-Leiste** mit dem aktuellen Pfad; ein Klick auf ein Segment scrollt im Baum dorthin zurück.
- **Kopier-Schaltflächen** beim Überfahren — Klick kopiert den Wert, `Alt`+Klick den JSON-Pfad.
- **Theme-treue Gestaltung** über Obsidians CSS-Variablen — keine fest verdrahteten Farben.
- **Eingebettete Codeblöcke** — `` ```json ``- und `` ```jsonc ``-Blöcke in jeder Markdown-Notiz werden als betitelte Karte mit aufklappbarem Baum gerendert. Blöcke über 20 Zeilen klappen automatisch zu. Ungültiges JSON erscheint als gestaltete Fehlerkarte mit Zeilen-/Spaltenangabe statt als Absturz.
- **Keine Telemetrie, keine entfernten Ressourcen.** Alle Bestandteile werden mit dem Plugin ausgeliefert.

---

## Voraussetzungen

| | |
|---|---|
| **Obsidian** | 1.5.7 oder neuer (`minAppVersion`) — die ansichts-lokale Tastenbelegung, die das Plugin nutzt, kam in 1.5.7 dazu. |
| **Plattform** | Desktop und Mobile. Nicht desktop-only; der Baum hat ein eigenes Touch-Bedienmodell (Langdruck-Menü statt Hover-Schaltflächen, `Alt`+Pfeiltasten zum Umsortieren). |
| **Abhängigkeiten** | Keine zu installieren. Die beiden Laufzeit-Bibliotheken (`@cfworker/json-schema`, `jsonc-parser`) sind in `main.js` eingebunden. |
| **Netzwerk** | Keines. Keine Telemetrie, keine entfernten Ressourcen, kein Nachladen von Schemata über das Netz — alles wird innerhalb des Vaults aufgelöst. |
| **Bauen aus dem Quelltext** | Node.js 20+ und npm (siehe [Entwicklung](#entwicklung)). |

---

## Installation

### Von Hand (aktuell)

1. `main.js`, `manifest.json` und `styles.css` aus dem [neuesten Release](https://github.com/johannes-kaindl/json-editor/releases/latest) herunterladen.
2. Die drei Dateien nach `.obsidian/plugins/json-editor/` in deinem Vault legen.
3. In Obsidian: **Einstellungen → Community-Plugins → Installiert → „JSON Editor" aktivieren**.

### Aus dem Quelltext

```bash
git clone https://git.jkaindl.de/jkaindl/json-editor.git
cd json-editor
npm install
npm run build
# main.js, manifest.json, styles.css nach <vault>/.obsidian/plugins/json-editor/ kopieren
```

### Community-Plugin-Verzeichnis

Die Einreichung im offiziellen Obsidian-Community-Plugin-Verzeichnis läuft noch — siehe [Projektstatus](#projektstatus). Nach der Aufnahme: **Einstellungen → Community-Plugins → Durchsuchen → „JSON Editor"**.

---

## Verwendung

- **Eine `.json`-Datei öffnen** — die Ansicht des Plugins ist als Standard für diese Dateiendung registriert.
- **Modus wechseln** über die **Tree / Source**-Schalter rechts in der Werkzeugleiste oder mit <kbd>Cmd/Strg</kbd>+<kbd>E</kbd>, solange eine JSON-Datei den Fokus hat (das schaltet ausschließlich innerhalb von JSON-Ansichten um — Obsidians „Leseansicht umschalten" bleibt überall sonst unberührt).
- **Werte bearbeiten** im Baum-Modus per Klick. Strings bekommen ein Eingabefeld, Zahlen eine numerische Prüfung, Booleans einen Umschalter. <kbd>Enter</kbd> übernimmt, <kbd>Esc</kbd> verwirft.
- **Struktur bearbeiten** — `+ Add key` / `+ Add item` am Ende jedes Containers; beim Überfahren einer Zeile erscheinen ✎ (umbenennen), ✕ (löschen), `⋮⋮` (ziehen zum Umsortieren) und `T` (JSON-Typ wechseln). <kbd>Backspace</kbd>/<kbd>Entf</kbd> entfernt die fokussierte Zeile.
- **Freien Text bearbeiten** im Quelltext-Modus — volles CodeMirror mit `Cmd/Strg+F`. Beim Zurückwechseln wird der Baum aus dem aktuellen Text neu aufgebaut.
- **Kopieren** über die Schaltfläche beim Überfahren — Klick = Wert, <kbd>Alt</kbd>+Klick = JSON-Pfad (z. B. `$.users[2].address.city`).
- **In Markdown-Notizen** wird ein JSON-Codeblock als aufklappbarer Baum gerendert:
  ````markdown
  ```json
  { "feature": "tree-rendered", "collapsible": true }
  ```
  ````
- **Umsortieren** mit <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd> (Tastatur) oder durch Ziehen am `⋮⋮`-Griff (Maus).

### Auf Mobilgeräten

Überfahren und Drag-and-Drop gibt es auf Touch-Geräten nicht, deshalb sind die Zeilenaktionen in einem Menü zusammengefasst:

- **Langdruck auf eine Zeile** öffnet ihr Aktionsmenü: *Wert kopieren · Pfad kopieren · Schlüssel umbenennen · Typ ändern · Nach oben/unten verschieben · Löschen*.
- **Einfacher Tipp** auf einen Wert bearbeitet ihn; ein Tipp auf den Pfeil klappt auf und zu.
- **Rückgängig/Wiederholen** erscheinen als Schaltflächen in der Werkzeugleiste (auf Touch gibt es kein <kbd>Cmd/Strg+Z</kbd>).

---

## Konfiguration

| Einstellung | Standard | Wirkung |
|---|---|---|
| Default mode | `tree` | Modus, in dem `.json`-Dateien öffnen. |
| Indent | `Two spaces` | Einrückung beim Serialisieren (`Two spaces` / `Four spaces` / `Tab`). |
| Tree marker style | `modern` | Darstellung der Baum-Verbindungslinien (`modern` / `classic`). |
| Auto-collapse depth | `2` | Baumknoten tiefer als dieser Wert starten zugeklappt. |
| Validate against JSON schema | `aus` | Lädt bei Aktivierung automatisch eine begleitende `*.schema.json` neben der geöffneten Datei und markiert Validierungsfehler live. Standardmäßig aus (das automatische Laden von Vault-Dateien ist eine Vertrauensentscheidung). |
| Companion schema suffix | `.schema.json` | Endung, über die das Schwester-Schema gefunden wird (`data.json` → `data.schema.json`). |

Die Einstellungen liegen unter **Einstellungen → Community-Plugins → JSON Editor**.

---

## Funktionsweise

**Zwei Schichten.** Die Render- und Bearbeitungslogik ist reines TypeScript ohne Obsidian-Importe (`src/core/`); ein dünner Adapter (`src/obsidian/`) bindet sie an die Obsidian-API. Diese Grenze ist der Grund, warum der Kern isoliert testbar ist — und warum derselbe Baum-Renderer sowohl die Dateiansicht als auch die Codeblöcke in deinen Notizen bedient.

**Beim Öffnen einer Datei** wird der Text zu einem gewöhnlichen JavaScript-Wert geparst und als DOM-Baum gerendert — kein virtuelles DOM, kein Framework. Davor laufen zwei Schutzmechanismen: ein Render-Budget (sehr große Dateien öffnen im Quelltext-Modus mit einem *Load tree anyway*-Banner) und eine Prüfung auf verlustbehaftete Zahlen (eine Datei mit Ganzzahlen jenseits von 2^53 öffnet schreibgeschützt, damit eine Änderung keine 64-Bit-IDs stillschweigend beschädigen kann).

**Beim Bearbeiten** ist jede strukturelle Operation — Wert ändern, hinzufügen, löschen, umbenennen, Typ wechseln, umsortieren — eine pure, unveränderliche Funktion auf dem geparsten Wert. Welchen Weg das Ergebnis zurück auf die Platte nimmt, hängt vom Dateityp ab:

- **`.json`** — der geänderte Wert wird mit deiner Einrückungs-Einstellung neu serialisiert. Sauber und vollständig, schreibt aber das ganze Dokument neu (siehe die Einschränkung zur Schlüsselreihenfolge weiter unten).
- **`.jsonc`** — neu zu serialisieren würde deine Kommentare wegwerfen, also wird nichts neu serialisiert. Die Änderung wird über [`jsonc-parser`](https://github.com/microsoft/node-jsonc-parser) in eine **gezielte Textänderung am Quelltext** übersetzt und lässt jedes Byte in Ruhe, das du nicht angefasst hast. Kommentare und Formatierung überleben; Öffnen und Speichern ohne Änderung ist byte-identisch.

**Rückgängig.** Beide Modi legen den *Text* vor der Änderung auf einen gemeinsamen, 100 Schritte tiefen Stapel. Rückgängig funktioniert dadurch über einen Moduswechsel hinweg — im Baum bearbeiten, in den Quelltext wechseln, und `Cmd/Strg+Z` geht weiterhin durch das zurück, was du getan hast.

**Die Schema-Validierung** (standardmäßig aus) sucht eine `data.schema.json` neben `data.json` und prüft mit dem eval-freien `@cfworker/json-schema` — einem baum-durchlaufenden Validierer ohne `new Function` und ohne `eval`. Sie ist zuschaltbar, weil das automatische Laden einer Schema-Datei aus einem geteilten Vault eine Vertrauensentscheidung ist und ein bösartiger regulärer Ausdruck darin die Oberfläche lahmlegen kann; Muster- und Größenprüfungen decken den Rest ab.

---

## Bekannte Konflikte / Kompatibilität

Das Plugin registriert sich als Editor für die Dateiendung `.json`. Obsidian erlaubt pro Endung nur **ein** Plugin, deshalb kommt es zum Konflikt, wenn parallel ein weiteres Plugin `.json` beansprucht. Bekannte Beispiele: **JSON Viewer** (reiner Betrachter), **JSON Collapsible** und **Data Files Editor**.

**Was im Konfliktfall passiert (seit 1.5.0):** Das Plugin, das als zweites lädt, kann die Endung nicht beanspruchen. Statt abzustürzen fängt JSON Editor den Fehler ab und zeigt einen Hinweis — *„another plugin already handles .json — file view disabled, code-block rendering still active."* Die eigene `.json`-**Dateiansicht ist dann deaktiviert**, alles andere arbeitet weiter: Einstellungen, die Befehle für Umschalten/Rückgängig/Wiederholen/Suchen und das **Rendern von** `` ```json ``**-Codeblöcken in Markdown-Notizen**.

**Um JSON Editor als `.json`-Editor zu nutzen:** das andere `.json`-Plugin deaktivieren und Obsidian neu laden. Die Ladereihenfolge ist nicht steuerbar, deshalb sind zwei gleichzeitig aktive `.json`-Editoren bewusst nicht unterstützt.

**Grenze der Baum-Bearbeitung — Reihenfolge von Objekt-Schlüsseln:** Eine Änderung im Baum serialisiert das ganze Dokument neu, und JavaScript sortiert ganzzahlartige Objekt-Schlüssel um (z. B. `"10"` vor `"2"`). Ein Objekt, dessen Schlüssel numerische Zeichenketten sind, kann beim Speichern also umsortiert werden. Dateien mit **großen Ganzzahlen** (> 2^53) sind bereits geschützt — sie öffnen schreibgeschützt. Wenn bei numerischen *Schlüsseln* die Reihenfolge zählt, nutze den Quelltext-Modus.

---

## Entwicklung

```bash
npm install                                # bei Bedarf --legacy-peer-deps; .npmrc regelt das
npm test                                   # 640 Vitest-Tests, ~3s
npm run dev                                # esbuild im Watch-Modus
npm run build                              # Produktions-Build (tsc-Prüfung + esbuild)
npm run lint                               # Biome (Format + allgemeines Lint)
npm run lint:obsidian                      # Richtlinien-Gate via eslint-plugin-obsidianmd
npx vitest run tests/core/parse.test.ts    # einzelne Testdatei
npx vitest                                 # Watch-Modus
```

Die Codebasis folgt striktem TDD — jede Änderung in `src/core/` und `src/obsidian/` wird zuerst durch einen fehlschlagenden Test abgesichert. Der Arbeitsablauf steht in [`CONTRIBUTING.md`](CONTRIBUTING.md).

Der Aufbau des Projekts (Verzeichnisbaum, die drei tsconfigs) ist in der englischen [`README.md`](README.md#project-layout) beschrieben und dort gepflegt.

---

## Dokumentation

- [`CHANGELOG.md`](CHANGELOG.md) — Release-Notizen (Keep-A-Changelog-Format).
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Fehlerberichte, Pull Requests, Commit-Konventionen, TDD-Ablauf.
- [`SECURITY.md`](SECURITY.md) — wie man ein Sicherheitsproblem meldet.
- [`docs/superpowers/specs/`](docs/superpowers/specs) — Design-Spezifikationen (eine je Release).
- [`docs/superpowers/plans/`](docs/superpowers/plans) — Umsetzungspläne zum Abhaken (eine je Release).

---

## Hosting

Das Projekt liegt gespiegelt auf zwei Forges:

| Remote | URL | Rolle |
|---|---|---|
| Forgejo | <https://git.jkaindl.de/jkaindl/json-editor> | **Primär** — Entwicklung, Issues, Pull Requests |
| GitHub | <https://github.com/johannes-kaindl/json-editor> | Release-Spiegel für die Einreichung im Obsidian-Community-Verzeichnis |

Issues und Pull Requests bitte bevorzugt auf **Forgejo**. GitHub existiert, weil das Obsidian-Community-Plugin-Verzeichnis ausschließlich auf GitHub-Releases verweist.

---

## Mitwirken

Fehlerberichte und Pull Requests sind auf Forgejo willkommen. Bei größeren Änderungen bitte zuerst ein Issue eröffnen, um das Vorgehen abzustimmen. Der vollständige Ablauf — Commit-Konventionen, Branch-Benennung, TDD-Anforderungen und Review-Hinweise — steht in [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Projektstatus

Aktiv gepflegt von einem einzelnen Maintainer ([@jkaindl](https://git.jkaindl.de/jkaindl) / [@johannes-kaindl](https://github.com/johannes-kaindl)). Für den Eigenbedarf gebaut, veröffentlicht, weil es anderen nützen könnte.

**Ausgeliefert** (siehe [`CHANGELOG.md`](CHANGELOG.md)): strukturelles Bearbeiten im Baum samt Rückgängig/Wiederholen (1.0.0), Umsortieren per Drag-and-Drop und Typwechsel (1.1.0), modusübergreifendes Rückgängig (1.2.0), JSON-Schema-Validierung (1.3.0, zuschaltbar seit 1.5.0), Härtung von Datenintegrität und Absturzverhalten (1.5.0), Richtlinien-Angleichung, Großdatei-Schutz und Quelltext-Suche (1.6.0), Vorbereitung der Einreichung samt Umbenennung auf `json-editor` (1.7.0), Bedienmodell für Mobilgeräte (1.8.0), Korrektheit in abgedockten Fenstern (1.8.1–1.8.2), eval-freie Schema-Validierung mit rund 52 % kleinerem Bundle (1.9.0), `.jsonc`-Unterstützung mit kommentar-erhaltendem Bearbeiten (1.10.0–1.10.1), Feinschliff am Baum-Rendering (1.10.2).

**Fahrplan (grob, 2.x-Ideen):**
1. **Navigation zwischen Suchtreffern** — vor/zurück springen und Treffer hervorheben, über den heutigen strikten Filter hinaus.
2. **Schema-gestützte Autovervollständigung** — Vorschläge für Schlüssel und Enum-Werte, wenn ein Schema geladen ist.

---

## Lizenz

- **Open Source (Standard):** GNU Affero General Public License v3.0 oder später (AGPL-3.0-or-later) — siehe [LICENSE](LICENSE). Das gilt standardmäßig für alle.
- **Kommerzielle Lizenz (auf Anfrage):** Wenn das Copyleft der AGPL nicht zu deinem Anwendungsfall passt — etwa bei einem **proprietären Produkt oder einem Apple-App-Store-Build** (die App-Store-Bedingungen sind mit der AGPL unvereinbar) — gibt es eine separate kommerzielle Lizenz. Siehe [`LICENSING.md`](LICENSING.md).
- **Mitwirken:** Externe Beiträge werden unter dem [Contributor License Agreement](CLA.md) angenommen, das das Dual-Lizenz-Modell möglich hält.
- **Dokumentation/Texte:** Creative Commons Namensnennung – Weitergabe unter gleichen Bedingungen 4.0 (CC BY-SA 4.0) — siehe [`LICENSE-DOCS`](LICENSE-DOCS).

**Lizenzen der Abhängigkeiten (in `main.js` eingebunden):** Dieses Plugin bindet [@cfworker/json-schema](https://github.com/cfworker/cfworker) (MIT) für die JSON-Schema-Validierung und [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) (MIT) für das kommentar-erhaltende `.jsonc`-Bearbeiten statisch ein, dazu die JSON-Grammatik des Quelltext-Modus [@codemirror/lang-json](https://github.com/codemirror/lang-json) (MIT) und [@lezer/json](https://github.com/lezer-parser/json) (MIT). Alle sind AGPL-3.0-kompatibel. Vollständige Lizenztexte und Copyright-Vermerke stehen in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Die übrigen `@codemirror/*`- und `@lezer/{common,highlight,lr}`-Pakete sowie die Obsidian-Plugin-API sind **nicht eingebunden** — sie stellt Obsidian zur Laufzeit bereit (in `esbuild.config.mjs` als `external` markiert).

---

Copyright © 2026 Johannes Kaindl. Code: AGPL-3.0-or-later · Dokumentation: CC BY-SA 4.0.
