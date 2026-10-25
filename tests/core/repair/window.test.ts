import { describe, expect, it } from "vitest";
import { parse } from "../../../src/core/parse";
import { WINDOW_RADIUS, errorOffset } from "../../../src/core/repair/window";
import { offsetFromMessage } from "../../../src/vendor/kit/json-error-position";
import { lineWindow, spliceWindow } from "../../../src/vendor/kit/text-window";

/** n Zeilen `"kN": N,` in einem Objekt — gültiges JSON, jede Zeile eindeutig. */
const objectOf = (n: number, eol = "\n"): string =>
  `{${eol}${Array.from({ length: n }, (_, i) => `  "k${i}": ${i}${i < n - 1 ? "," : ""}`).join(eol)}${eol}}`;

/** Offset des ersten Zeichens der Zeile `line` (0-basiert). */
const startOfLine = (text: string, line: number): number =>
  text
    .split("\n")
    .slice(0, line)
    .reduce((sum, l) => sum + l.length + 1, 0);

describe("offsetFromMessage", () => {
  it("liest `position N` (V8)", () => {
    expect(
      offsetFromMessage(
        '{"a": 1 "b": 2}',
        "Expected ',' or '}' after property value in JSON at position 8 (line 1 column 9)",
      ),
    ).toBe(8);
  });

  it("begrenzt eine Position hinter dem Textende auf das Textende", () => {
    expect(offsetFromMessage("{", "Expected ',' or '}' in JSON at position 99")).toBe(1);
  });

  it("liest `line N column M` einer Meldung ohne `position`", () => {
    expect(offsetFromMessage("ab\ncd\nef", "Unexpected token at line 2 column 2")).toBe(4);
  });

  it("kennt keine Position bei `Unexpected token 'X', \"…\" is not valid JSON`", () => {
    expect(
      offsetFromMessage("[1,2,]", `Unexpected token ']', "[1,2,]" is not valid JSON`),
    ).toBeNull();
  });

  it("kennt keine Position bei `Unexpected end of JSON input`", () => {
    expect(offsetFromMessage("{", "Unexpected end of JSON input")).toBeNull();
  });
});

describe("errorOffset", () => {
  it("json: Stelle der Meldung mit `position N`", () => {
    const text = `${objectOf(30)}\n`.replace('"k10": 10', '"k10" 10');
    const offset = errorOffset(text, "json");
    expect(offset).not.toBeNull();
    // V8 meldet das erste Token, das nicht passt: den Wert hinter dem fehlenden Doppelpunkt, Zeile 11 (0-basiert).
    expect(text.slice(0, offset ?? 0).split("\n").length - 1).toBe(11);
  });

  it("json: eine Meldung ohne Position (Komma vor `]`) ist `null`, nicht geraten", () => {
    expect(errorOffset('{"a": [1, 2,]}', "json")).toBeNull();
  });

  it("json: ein gültiges Dokument hat keine Fehlerstelle", () => {
    expect(errorOffset(objectOf(5), "json")).toBeNull();
  });

  it("json: eine abgeschnittene Datei meldet die Stelle am Ende", () => {
    const text = objectOf(30).slice(0, -2);
    const offset = errorOffset(text, "json");
    expect(offset).not.toBeNull();
    expect(offset).toBeGreaterThan(text.length - 10);
  });

  it("jsonc: der Offset kommt aus dem Parser, auch wo das Strikte keinen nennt", () => {
    const text = '{\n  "a": [1, 2,,\n  3]\n}';
    expect(errorOffset(text, "jsonc")).toBe(text.indexOf(",,") + 1);
  });

  it("jsonc: Kommentare sind keine Fehler", () => {
    expect(errorOffset('{\n // c\n "a": 1\n}', "jsonc")).toBeNull();
  });

  it("derselbe Fehler gibt in beiden Dialekten dieselbe Zeile (wo json eine Position kennt)", () => {
    const text = objectOf(40).replace('"k20": 20', "'k20': 20");
    const j = errorOffset(text, "json") ?? -1;
    const c = errorOffset(text, "jsonc") ?? -1;
    expect(text.slice(0, j).split("\n").length).toBe(text.slice(0, c).split("\n").length);
  });
});

describe("lineWindow", () => {
  const text = objectOf(100); // Zeile 0 = `{`, Zeile 1..100 = Einträge, Zeile 101 = `}`

  it(`nimmt ±${WINDOW_RADIUS} Zeilen um die Fehlerzeile`, () => {
    const w = lineWindow(text, startOfLine(text, 50) + 3, WINDOW_RADIUS);
    expect(w.from).toBe(30);
    expect(w.to).toBe(70);
    expect(w.text.split("\n")).toHaveLength(41);
    expect(w.text.startsWith('  "k29": 29,')).toBe(true);
    expect(w.text.endsWith('  "k69": 69,')).toBe(true);
    expect(w.line).toBe(50);
  });

  it("kürzt am Anfang der Datei", () => {
    const w = lineWindow(text, startOfLine(text, 3), WINDOW_RADIUS);
    expect(w.from).toBe(0);
    expect(w.to).toBe(23);
    expect(w.text.startsWith("{\n")).toBe(true);
  });

  it("kürzt am Ende der Datei; der Zeilenumbruch am Schluss gehört nicht zum Fenster", () => {
    const withNl = `${text}\n`;
    const w = lineWindow(withNl, startOfLine(withNl, 100), WINDOW_RADIUS);
    expect(w.to).toBe(101);
    expect(w.text.endsWith("}")).toBe(true);
    expect(spliceWindow(withNl, w, w.text)).toBe(withNl);
  });

  it("Fehler in der letzten Zeile ohne Zeilenumbruch", () => {
    const w = lineWindow(text, text.length - 1, WINDOW_RADIUS);
    expect(w.to).toBe(101);
    expect(w.text.endsWith("}")).toBe(true);
    expect(spliceWindow(text, w, w.text)).toBe(text);
  });

  it("meldet Zeile und Spalte der Fehlerstelle im Fenster (1-basiert)", () => {
    const off = startOfLine(text, 50) + 4;
    const w = lineWindow(text, off, WINDOW_RADIUS);
    expect(w.line - w.from).toBe(20);
    expect(w.col).toBe(5);
  });

  it("zählt `total` ohne den leeren Rest hinter dem letzten Zeilenumbruch", () => {
    expect(lineWindow("a\nb\n", 0, 5).total).toBe(2);
    expect(lineWindow("a\nb", 0, 5).total).toBe(2);
  });

  it("gibt dem Modell Zeilen mit `\\n`, auch bei CRLF-Dateien", () => {
    const crlf = objectOf(100, "\r\n");
    const off = crlf.indexOf('"k50"');
    const w = lineWindow(crlf, off, 3);
    expect(w.text).not.toContain("\r");
    expect(w.text.split("\n")).toHaveLength(7);
  });

  it("deckt ein kleines Dokument ganz ab", () => {
    const w = lineWindow("{\n}", 0, WINDOW_RADIUS);
    expect([w.from, w.to, w.total]).toEqual([0, 1, 2]);
  });
});

describe("spliceWindow", () => {
  const text = objectOf(100);

  it("setzt die Antwort ein; alles außerhalb bleibt byte-gleich", () => {
    const off = startOfLine(text, 50);
    const w = lineWindow(text, off, 5);
    const out = spliceWindow(text, w, w.text.replace('"k50": 50', '"k50": 500'));
    expect(out).toBe(text.replace('"k50": 50', '"k50": 500'));
  });

  it("CRLF: die Antwort (LF) wird auf CRLF gebracht, kein einzelnes LF entsteht", () => {
    const crlf = objectOf(100, "\r\n");
    const w = lineWindow(crlf, crlf.indexOf('"k50"'), 5);
    const out = spliceWindow(crlf, w, w.text.replace('"k50": 50', '"k50": 501'));
    expect(out).toBe(crlf.replace('"k50": 50', '"k50": 501'));
    expect((out.match(/(?<!\r)\n/g) ?? []).length).toBe(0);
  });

  it("die Antwort darf mehr oder weniger Zeilen haben als das Fenster", () => {
    const w = lineWindow(text, startOfLine(text, 50), 2);
    const lines = w.text.split("\n");
    const more = spliceWindow(text, w, [...lines, '  "extra": 1,'].join("\n"));
    expect(more.split("\n")).toHaveLength(text.split("\n").length + 1);
    const fewer = spliceWindow(text, w, lines.slice(0, 2).join("\n"));
    expect(fewer.split("\n")).toHaveLength(text.split("\n").length - 3);
  });

  it("ein Fenster, das Klammer und Array durchschneidet, setzt sich wieder passend ein", () => {
    // `[` öffnet vor dem Fenster, `]` schließt dahinter: das Fenster endet mitten in der Liste.
    const doc = `{\n  "list": [\n${Array.from({ length: 60 }, (_, i) => `    ${i}${i < 59 ? "," : ""}`).join("\n")}\n  ]\n}`;
    const broken = doc.replace("    30,", "    30 31,");
    const off = errorOffset(broken, "json") ?? -1;
    const w = lineWindow(broken, off, WINDOW_RADIUS);
    expect(w.from).toBeGreaterThan(1);
    expect(w.to).toBeLessThan(w.total - 2);
    const fixed = spliceWindow(broken, w, w.text.replace("30 31,", "30,\n    31,"));
    expect(parse(fixed).ok).toBe(true);
  });

  it("die Zeile hinter dem Fenster behält ihr Zeilenende, auch wenn die Antwort keins trägt", () => {
    const w = lineWindow("a\nb\nc\nd", startOfLine("a\nb\nc\nd", 1), 0);
    expect(spliceWindow("a\nb\nc\nd", w, "B")).toBe("a\nB\nc\nd");
  });
});
