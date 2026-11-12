// vendored from obsidian-kit@0.82.2, src/pure/block-writer.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Herkunft: 3d-codeblocks `src/obsidian/block-writer.ts` (Kit-Kandidat seit 2026-07-25 laut
// Dach-REGISTRY, gehoben 2026-11-02 ins Kit nach Bibliothek-ab-Eins fuer svg-studio). Inhalt
// unveraendert uebernommen: kein obsidian-Import, die Obsidian-Seite steht in
// `../obsidian/write-ports.ts`. Der Guard (Fingerabdruck von Rumpf und Fence statt Vertrauen
// auf `getSectionInfo`) ist die Domaenen-Annahme dieses Moduls: Codeblock-Zeilen einer Notiz.
// Einzige Abweichung: Indexzugriffe tragen `?? ""`, weil das Kit `noUncheckedIndexedAccess` setzt;
// die Stellen sind durch die davor laufende Zeilenpruefung bereits im Bereich, das Verhalten bleibt.
//
// Schreibt den Rumpf eines Codeblocks zurueck in die Notiz — zweigleisig.
//
// 1. Notiz in einem sichtbaren Editor offen → `replaceRange`, damit Strg+Z wirkt.
// 2. Sonst → `vault.process` (atomar, funktioniert auch im Lesemodus).
//
// Beide Wege pruefen VOR dem Schreiben, ob an der gemerkten Stelle noch der Block
// steht, den wir gerendert haben. `getSectionInfo` kann veraltet sein, wenn
// zwischenzeitlich getippt wurde — ohne diese Pruefung wuerden fremde Zeilen
// ueberschrieben. Das ist der gefaehrlichste Fehler dieses Features und wird
// durch Vergleich statt durch Vertrauen ausgeschlossen.

/** Zeilen des Blocks: `lineStart` ist die ```-Zeile, `lineEnd` die schliessende. */
export interface BlockLocation {
  path: string;
  lineStart: number;
  lineEnd: number;
  // Sprache der eroeffnenden Fence (z. B. "3d"). Zusatzpruefung neben dem Rumpf:
  // bei einem leeren Rumpf ist der Fingerabdruck sonst fuer JEDEN Block an dieser
  // Zeile identisch (die leere Zeichenkette) -- eine veraltete Position, die
  // zufaellig auf einen fremden ```python- oder ```mermaid-Block zeigt, wuerde den
  // Guard sonst passieren.
  fence: string;
}

export interface EditorHandle {
  getValue(): string;
  replaceRange(
    text: string,
    from: { line: number; ch: number },
    to: { line: number; ch: number },
  ): void;
}

export interface VaultPort {
  read(path: string): Promise<string>;
  process(path: string, fn: (text: string) => string): Promise<void>;
}

export interface WritePorts {
  /** Editor der Datei, wenn sie in einem sichtbaren Blatt offen ist — sonst `null`. */
  editorFor(path: string): EditorHandle | null;
  vault: VaultPort;
}

export class BlockChangedError extends Error {
  constructor() {
    super("Note changed — view not saved");
    this.name = "BlockChangedError";
  }
}

/** Zeilen zwischen den Fences, oder `null`, wenn die Stelle nicht mehr passt. */
function bodyAt(content: string, loc: BlockLocation): string | null {
  const lines = content.split("\n");
  // Negative oder nicht-ganzzahlige Indizes wuerden Array.slice stillschweigend
  // vom Ende her interpretieren (bzw. bei anderen Werten abstuerzen) statt die
  // Stelle abzulehnen — das genaue Gegenteil dessen, was diese Funktion soll.
  if (
    !Number.isInteger(loc.lineStart) ||
    !Number.isInteger(loc.lineEnd) ||
    loc.lineStart < 0 ||
    loc.lineEnd >= lines.length ||
    loc.lineStart >= loc.lineEnd
  )
    return null;
  return lines.slice(loc.lineStart + 1, loc.lineEnd).join("\n");
}

// Obsidian liefert den gerenderten Blockquelltext immer mit \n, aber eine unter
// Windows gespeicherte Notiz kann auf der Platte \r\n enthalten. Ohne Normalisierung
// wuerde der Abgleich bei jedem Schreibversuch auf solchen Notizen fehlschlagen —
// fail-safe, aber dauerhaft nutzlos. \r\n → \n aendert die Zeilenzahl nicht, die
// Positionen in `loc` bleiben also gueltig. Normalisiert wird nur fuer den Vergleich;
// geschrieben wird immer der unveraenderte Text.
//
// Ein nach dem \r\n-Abgleich verbleibendes einzelnes \r ist der Rest eines \r\n,
// dessen \n bereits anderswo als Trenner verbraucht wurde — typisch fuer ein aus
// einer CRLF-Notiz extrahiertes Fragment mit einzeiligem Rumpf (`expectedBody` kommt
// von Obsidian genauso zustande wie `bodyAt` unten: split("\n") + slice + join, nur
// die letzte Zeile verliert dabei ihr \n, das \r bleibt haengen). Es einfach zu
// entfernen (statt zu \n zu machen) haelt den Vergleich symmetrisch zu `bodyAt`, das
// fuer denselben Rumpf nie ein trailing \n anhaengt — ein \r→\n wuerde die eine Seite
// um ein Zeichen laenger machen und den Abgleich dauerhaft verfehlen.
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "");
}

// Backtick- UND Tilde-Fences sind gueltiges CommonMark und werden von Obsidian
// gerendert (~~~3d faehrt genauso wie ```3d) -- nur Backticks zu akzeptieren wuerde
// einen gerenderten Block treffen, der sich nie speichern liesse.
const FENCE_LINE = /^\s*(?:`{3,}|~{3,})(.*)$/;

/** Sprache der eroeffnenden Fence in `line`, oder `null`, wenn dort keine Fence steht.
    Nur das erste Token des Info-Strings zaehlt (` ```3d extra ` ist immer noch „3d“) --
    sonst wuerde ein Block mit zusaetzlichen Info-String-Woertern nie mehr gespeichert. */
function fenceLanguage(line: string | undefined): string | null {
  if (line === undefined) return null;
  const match = FENCE_LINE.exec(line);
  if (!match) return null;
  return (match[1] ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Steht an `loc.lineStart` wirklich eine Fence in der erwarteten Sprache? */
function fenceMatches(content: string, loc: BlockLocation): boolean {
  if (!Number.isInteger(loc.lineStart) || loc.lineStart < 0) return false;
  const lang = fenceLanguage(content.split("\n")[loc.lineStart]);
  return lang !== null && lang.toLowerCase() === loc.fence.trim().toLowerCase();
}

function bodyMatches(content: string, loc: BlockLocation, expectedBody: string): boolean {
  const normalized = normalizeLineEndings(content);
  if (!fenceMatches(normalized, loc)) return false;
  return bodyAt(normalized, loc) === normalizeLineEndings(expectedBody);
}

// Schreibt `nextBody` (immer \n) nicht einfach so in eine CRLF-Notiz — sonst blieben
// die Zeilen des Blocks \n-terminiert, waehrend der Rest der Notiz \r\n behaelt. Das
// widerspricht dem Prinzip, das `block-edit.ts` fuer die view-Zeile schon durchzieht:
// Zeilenumbrueche bleiben innerhalb einer Notiz einheitlich.
//
// "crlf" | "lf" | null — null heisst: an dieser Stelle kein Signal (leerer Text).
type LineEndingStyle = "crlf" | "lf";

function lineEndingSignal(text: string): LineEndingStyle | null {
  if (text.includes("\r\n")) return "crlf";
  // Der Rumpf wird per `split("\n")` + `slice` + `join("\n")` aus dem Rohtext
  // gewonnen. Dabei verliert nur die letzte Zeile ihr `\n` (war der Trenner),
  // das zugehoerige `\r` bleibt aber als Suffix erhalten — genau daran erkennt
  // man CRLF bei einem einzeiligen Rumpf.
  if (text.endsWith("\r")) return "crlf";
  if (text.includes("\n")) return "lf";
  return null;
}

/** Stil an der Stelle selbst, sonst Stil der ganzen Notiz, sonst LF. */
function resolveLineEndingStyle(content: string, loc: BlockLocation): LineEndingStyle {
  const rawBody = bodyAt(content, loc);
  return (rawBody !== null ? lineEndingSignal(rawBody) : null) ?? lineEndingSignal(content) ?? "lf";
}

// Erst auf \n normalisieren, DANN den Zielstil anwenden — sonst wuerde ein bereits
// CRLF-artiger `nextBody` zu \r\r\n. Bei CRLF bekommt JEDE Zeile (auch die letzte)
// ein eigenes trailing \r, weil `replaceBody` die Zeilen anschliessend nur mit
// einem schlichten "\n" zusammenfuegt (siehe unten) — das \r muss also Teil der
// Zeile selbst sein, nicht des Trenners.
function applyLineEndingStyle(text: string, style: LineEndingStyle): string {
  const lf = normalizeLineEndings(text);
  if (style === "lf") return lf;
  return lf
    .split("\n")
    .map((line) => `${line}\r`)
    .join("\n");
}

function replaceBody(content: string, loc: BlockLocation, nextBody: string): string {
  const lines = content.split("\n");
  return [
    ...lines.slice(0, loc.lineStart + 1),
    ...nextBody.split("\n"),
    ...lines.slice(loc.lineEnd),
  ].join("\n");
}

export async function writeBlockBody(
  ports: WritePorts,
  loc: BlockLocation,
  expectedBody: string,
  nextBody: string,
): Promise<void> {
  const editor = ports.editorFor(loc.path);

  if (editor) {
    const content = editor.getValue();
    if (!bodyMatches(content, loc, expectedBody)) throw new BlockChangedError();

    const styledNextBody = applyLineEndingStyle(nextBody, resolveLineEndingStyle(content, loc));

    if (loc.lineEnd === loc.lineStart + 1) {
      // Leerer Rumpf: Die Fences liegen direkt aneinander, es gibt keine Zeile
      // zwischen ihnen zu ersetzen. `lastBodyLine` waere dann `loc.lineStart`,
      // also VOR `loc.lineStart + 1` — ein invertierter Bereich (from nach to).
      // Statt zu ersetzen, an der Stelle einfuegen; das \n ist Teil des Einfuegens,
      // nicht optional (sonst verschmilzt der Rumpf mit der schliessenden Fence).
      editor.replaceRange(
        `${styledNextBody}\n`,
        { line: loc.lineStart + 1, ch: 0 },
        { line: loc.lineStart + 1, ch: 0 },
      );
      return;
    }

    const lines = content.split("\n");
    const lastBodyLine = loc.lineEnd - 1;
    editor.replaceRange(
      styledNextBody,
      { line: loc.lineStart + 1, ch: 0 },
      { line: lastBodyLine, ch: (lines[lastBodyLine] ?? "").length },
    );
    return;
  }

  const content = await ports.vault.read(loc.path);
  if (!bodyMatches(content, loc, expectedBody)) throw new BlockChangedError();

  await ports.vault.process(loc.path, (current) => {
    // Zwischen `read` und `process` kann sich die Datei geaendert haben — erneut pruefen.
    if (!bodyMatches(current, loc, expectedBody)) throw new BlockChangedError();
    const styledNextBody = applyLineEndingStyle(nextBody, resolveLineEndingStyle(current, loc));
    return replaceBody(current, loc, styledNextBody);
  });
}

const BOM = "\uFEFF";

// Nur der VERGLEICH ist gegenueber einem fuehrenden BOM nachsichtig (Zeile 0 der Notiz
// und `expected`); geschrieben wird das BOM unveraendert zurueck.
function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

function linesAt(content: string, from: number, to: number): string | null {
  const lines = stripBom(normalizeLineEndings(content)).split("\n");
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= lines.length)
    return null;
  return lines.slice(from, to + 1).join("\n");
}

/** Ganze Zeilen `from..to` (0-basiert, inklusive) ersetzen — fürs Umwandeln Block ↔ Datei,
    wo sich die Sprache des Zauns ändert und `writeBlockBody` deshalb nicht reicht. Dieselbe
    Vorsicht wie dort: stimmt der Bereich nicht mehr, wird nichts geschrieben. Eine leere
    Ersetzung ergibt EINE leere Zeile (kein Zeilenverlust). Zeilen ausserhalb des Bereichs
    bleiben byte-identisch; die Ersatzzeilen tragen den dominanten Stil der Notiz
    (`lineEndingSignal`: irgendwo \r\n → CRLF, sonst LF). */
export async function replaceLines(
  ports: WritePorts,
  path: string,
  from: number,
  to: number,
  expected: string,
  replacement: string,
): Promise<void> {
  const want = stripBom(normalizeLineEndings(expected));
  const editor = ports.editorFor(path);

  if (editor) {
    const content = editor.getValue();
    if (linesAt(content, from, to) !== want) throw new BlockChangedError();
    const style = lineEndingSignal(content) ?? "lf";
    const lines = content.split("\n");
    // Offsets stammen aus dem ROHEN Puffer (ein einzelnes \r mitten in der Zeile zaehlt
    // dort als Zeichen); nur das Zeilenend-\r der letzten Zeile bleibt stehen. Ein BOM
    // in Zeile 0 wird nicht ueberschrieben.
    const startCh = from === 0 && (lines[0] ?? "").startsWith(BOM) ? 1 : 0;
    editor.replaceRange(
      applyLineEndingStyle(replacement, style).replace(/\r$/, ""),
      { line: from, ch: startCh },
      { line: to, ch: (lines[to] ?? "").replace(/\r$/, "").length },
    );
    return;
  }

  // Prüfung und Schreiben in EINEM `process`-Aufruf: kein Fenster dazwischen.
  await ports.vault.process(path, (current) => {
    if (linesAt(current, from, to) !== want) throw new BlockChangedError();
    const style = lineEndingSignal(current) ?? "lf";
    const lines = current.split("\n");
    const next = applyLineEndingStyle(replacement, style).split("\n");
    // Letzte Zeile der Notiz ohne Zeilenende: kein \r anhaengen, ausser sie hatte eines.
    if (to === lines.length - 1 && !(lines[to] ?? "").endsWith("\r")) {
      next[next.length - 1] = (next[next.length - 1] ?? "").replace(/\r$/, "");
    }
    if (from === 0 && (lines[0] ?? "").startsWith(BOM)) next[0] = BOM + (next[0] ?? "");
    return [...lines.slice(0, from), ...next, ...lines.slice(to + 1)].join("\n");
  });
}
