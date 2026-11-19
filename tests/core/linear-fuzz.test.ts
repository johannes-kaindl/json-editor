/**
 * Linearität der Funktionen, die Fremdtext zerlegen (ReDoS-Konvention, CORE-TEST-26 (b)): der erschöpfende Fuzz `pruefeLinearFuzz` aus dem Kit-Testmodul,
 * dazu feste Eingaben. Gemessen wird ein Quotient t(50 000)/t(10 000), keine Millisekunden.
 *
 * Geprüft sind die Wege, auf denen Text von außen ankommt: ein JSON-Schema des Nutzers samt `pattern`-Regexen (`compileSchema`), die Antwort des Modells
 * bei der Reparatur (`validateRepair`, `extractDocument`, `spliceFence`), die Notiz mit dem JSON-Block (`findFenceAt`), das Dokument selbst (`parse`,
 * `jsoncParse`, `detectIndent`) und die Pfadeingabe (`parsePathStr`).
 *
 * Nicht Gegenstand: `JSON.parse` (V8), `jsonc-parser` und `@cfworker/json-schema` (Fremdbibliotheken), `scanFenceAt` (Kit). Die Gegenprobe
 * (eine absichtlich quadratische Fassung wird rot) steht am Ende dieser Datei.
 */
import { describe, expect, it } from "vitest";
import { detectIndent, jsoncParse } from "../../src/core/jsonc";
import { parse } from "../../src/core/parse";
import { parsePathStr } from "../../src/core/path";
import { findFenceAt, spliceFence } from "../../src/core/repair/fence";
import { extractDocument, validateRepair } from "../../src/core/repair/prompt";
import { compileSchema } from "../../src/core/schema";
import { findMatches } from "../../src/core/search";
import { pruefeLinear, pruefeLinearFuzz } from "../vendor/kit/linear-probe";

const FUZZ_MS = 180_000;

/** Befund als lesbarer Text, damit eine rote Zeile ohne Nachlesen verständlich ist (CORE-TEST-14). */
const befund = (r: { verdaechtig: ReadonlyArray<{ message: string }> }): string =>
  r.verdaechtig.map((v) => v.message).join("\n");
const fuzz = (fn: (s: string) => unknown, alphabet: readonly string[], maxLaenge = 3): void => {
  const f = pruefeLinearFuzz(fn, { alphabet, maxLaenge });
  expect(f.linear, befund(f)).toBe(true);
  // Eine Bilanz ohne Messung ist kein Erfolg (CORE-TEST-19).
  expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
};

describe("Schema des Nutzers", () => {
  it(
    "compileSchema: Fuzz über Gruppen und Quantoren im `pattern` (die Wache gegen ReDoS darf nicht selbst eine sein)",
    () => {
      // Das Muster steht in einem gültigen Schema, damit die Prüfung der Muster erreicht wird (Schritt 1 der Konvention).
      fuzz(
        (s) => compileSchema(`{"type":"string","pattern":"${s}"}`),
        ["(", ")", "+", "*", "{1,}", "a", " "],
      );
    },
    FUZZ_MS,
  );

  it("compileSchema: lange Folgen offener Gruppen und Quantoren bleiben linear (feste Formen)", () => {
    const formen: Array<(n: number) => string> = [
      (n) => "(".repeat(n),
      (n) => "(+".repeat(n),
      (n) => `${"(a".repeat(n)}+`,
      (n) => `${"(".repeat(n)}a+${")".repeat(n)}`,
      (n) => "(a)".repeat(n),
    ];
    for (const [i, form] of formen.entries()) {
      const r = pruefeLinear(
        (s: string) => compileSchema(`{"type":"string","pattern":"${s}"}`),
        form,
      );
      expect(r.linear, `Form ${i}: ${r.message}`).toBe(true);
    }
  });
});

describe("Antwort des Modells bei der Reparatur", () => {
  it(
    "extractDocument und validateRepair: Fuzz über Denkblöcke, Zäune, Klammern",
    () => {
      const alphabet = ["<think>", "</think>", "```json\n", "```\n", "\n", " ", "{", "}", '"'];
      fuzz(extractDocument, alphabet, 2);
      fuzz((s) => validateRepair(s, "json"), alphabet, 2);
      fuzz((s) => validateRepair(s, "jsonc"), alphabet, 2);
    },
    FUZZ_MS,
  );

  it(
    "spliceFence: Fuzz über Leerraum in der Ersetzung (Text vom Modell)",
    () => {
      const notiz = "```json\nx\n```";
      // `x` am Anfang und Ende: sonst schneidet das Abschneiden am Ende den Lauf ab, bevor die Zerlegung ihn sieht.
      fuzz((s) => spliceFence(notiz, 0, 2, "x", `x${s}x`), [" ", "\t", "\n", "x"]);
    },
    FUZZ_MS,
  );
});

describe("Notiz und Dokument", () => {
  it(
    "findFenceAt: Fuzz über Zäune, Einzug, Zeilenumbruch",
    () => {
      fuzz((s) => findFenceAt(s, 1), ["```json\n", "```jsonc\n", "```\n", "~~~\n", "\n", " ", "x"]);
    },
    FUZZ_MS,
  );

  it(
    "parse, jsoncParse und detectIndent: Fuzz über JSON-Zeichen, Leerraum, Kommentare",
    () => {
      const alphabet = ["{", "}", "[", "]", '"', ":", ",", " ", "\n", "\t", "/*", "*/", "//"];
      fuzz(parse, alphabet, 2);
      fuzz(jsoncParse, alphabet, 2);
      fuzz(detectIndent, [" ", "\t", "\n", "x"]);
    },
    FUZZ_MS,
  );

  it(
    "parsePathStr: Fuzz über Klammern, Anführungszeichen, Escape, Punkt",
    () => {
      fuzz(parsePathStr, ["[", "]", '"', "\\", ".", "a", "0"]);
    },
    FUZZ_MS,
  );

  it("findMatches: breite Werte bleiben linear (viele Schlüssel, lange Zeichenketten)", () => {
    const breit = pruefeLinear(
      (o: Record<string, string>) => findMatches(o, "k"),
      (n) =>
        Object.fromEntries(Array.from({ length: Math.ceil(n / 4) }, (_v, i) => [`k${i}`, "v"])),
    );
    expect(breit.linear, breit.message).toBe(true);
    const lang = pruefeLinear(
      (s: string) => findMatches({ a: s }, "zz"),
      (n) => "a".repeat(n),
    );
    expect(lang.linear, lang.message).toBe(true);
  });
});

describe("Verhalten unverändert: compileSchema meldet dieselben Muster als unsicher wie die frühere Regex", () => {
  // Das Orakel ist die frühere Fassung (eine einzige Regex, auf kurzen Zeichenfolgen harmlos). Alle Zeichenfolgen bis Länge 5 aus den Zeichen, die den Unterschied machen.
  // Außerhalb dieser Datei geprüft: 1 111 111 Zeichenfolgen bis Länge 6 aus zehn Zeichen, 3 521 unsichere, keine Abweichung.
  const QUANT = "(?:[+*]|\\{\\d*,?\\d*\\})";
  const ALT = new RegExp(`\\([^)]*${QUANT}[^)]*\\)\\s*${QUANT}`);

  it("alle kurzen Muster aus Gruppen, Quantoren, Klammer-Quantor und Leerraum", () => {
    const alphabet = ["(", ")", "+", "*", "{1,}", "a", " "];
    let stufe: string[] = [""];
    const alle: string[] = [""];
    for (let i = 0; i < 5; i++) {
      stufe = stufe.flatMap((v) => alphabet.map((z) => v + z));
      alle.push(...stufe);
    }
    let unsicher = 0;
    for (const muster of alle) {
      const r = compileSchema(JSON.stringify({ type: "string", pattern: muster }));
      const meldet = !r.ok && r.errorCode === "schemaUnsafePattern";
      expect(meldet, JSON.stringify(muster)).toBe(ALT.test(muster));
      if (meldet) unsicher++;
    }
    // Die Probe kann beide Ausgänge erzeugen (CORE-TEST-08): ohne unsichere Muster in der Menge sagte „gleich“ nichts.
    expect(unsicher).toBeGreaterThan(50);
    expect(unsicher).toBeLessThan(alle.length);
  });

  it("patternProperties wird ebenso geprüft", () => {
    const r = compileSchema(JSON.stringify({ type: "object", patternProperties: { "(a+)+": {} } }));
    expect(!r.ok && r.errorCode).toBe("schemaUnsafePattern");
  });
});

describe("Gegenprobe: der Fuzz kann rot werden (CORE-TEST-01)", () => {
  /** Absichtlich quadratisch: dieselbe Form wie `replacement.replace(/\s+$/, "")` mit einem Lauf mitten im Text. */
  const quadratisch = (s: string): string => s.replace(/\s+$/, "");

  it(
    "pruefeLinearFuzz meldet die quadratische Form als Verdacht",
    () => {
      const f = pruefeLinearFuzz((s) => quadratisch(`x${s}x`), {
        alphabet: [" ", "x"],
        maxLaenge: 1,
        verschachtelt: false,
      });
      expect(f.linear).toBe(false);
      expect(f.verdaechtig.map((v) => v.einheit)).toContain(" ");
    },
    FUZZ_MS,
  );
});
