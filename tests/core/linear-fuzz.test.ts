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
import { assessRegexRisk } from "../../src/vendor/kit/user-regex";
import { type LinearProbeSkipKontext, lastGeschuetzt } from "../vendor/kit/linear-probe";

const FUZZ_MS = 180_000;

/** Befund als lesbarer Text, damit eine rote Zeile ohne Nachlesen verständlich ist (CORE-TEST-14). */
const befund = (r: { verdaechtig: ReadonlyArray<{ message: string }> }): string =>
  r.verdaechtig.map((v) => v.message).join("\n");
const fuzz = (
  ctx: LinearProbeSkipKontext,
  fn: (s: string) => unknown,
  alphabet: readonly string[],
  maxLaenge = 3,
): void => {
  const f = lastGeschuetzt(ctx).pruefeLinearFuzz(fn, { alphabet, maxLaenge });
  expect(f.linear, befund(f)).toBe(true);
  // Eine Bilanz ohne Messung ist kein Erfolg (CORE-TEST-19).
  expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
};

describe("Schema des Nutzers", () => {
  it(
    "compileSchema: Fuzz über Gruppen und Quantoren im `pattern` (die Wache gegen ReDoS darf nicht selbst eine sein)",
    (ctx) => {
      // Das Muster steht in einem gültigen Schema, damit die Prüfung der Muster erreicht wird (Schritt 1 der Konvention).
      fuzz(ctx, (s) => compileSchema(`{"type":"string","pattern":"${s}"}`), [
        "(",
        ")",
        "+",
        "*",
        "{1,}",
        "a",
        " ",
      ]);
    },
    FUZZ_MS,
  );

  it("compileSchema: lange Folgen offener Gruppen und Quantoren bleiben linear (feste Formen)", (ctx) => {
    const formen: Array<(n: number) => string> = [
      (n) => "(".repeat(n),
      (n) => "(+".repeat(n),
      (n) => `${"(a".repeat(n)}+`,
      (n) => `${"(".repeat(n)}a+${")".repeat(n)}`,
      (n) => "(a)".repeat(n),
    ];
    for (const [i, form] of formen.entries()) {
      const r = lastGeschuetzt(ctx).pruefeLinear(
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
    (ctx) => {
      const alphabet = ["<think>", "</think>", "```json\n", "```\n", "\n", " ", "{", "}", '"'];
      fuzz(ctx, extractDocument, alphabet, 2);
      fuzz(ctx, (s) => validateRepair(s, "json"), alphabet, 2);
      fuzz(ctx, (s) => validateRepair(s, "jsonc"), alphabet, 2);
    },
    FUZZ_MS,
  );

  it(
    "spliceFence: Fuzz über Leerraum in der Ersetzung (Text vom Modell)",
    (ctx) => {
      const notiz = "```json\nx\n```";
      // `x` am Anfang und Ende: sonst schneidet das Abschneiden am Ende den Lauf ab, bevor die Zerlegung ihn sieht.
      fuzz(ctx, (s) => spliceFence(notiz, 0, 2, "x", `x${s}x`), [" ", "\t", "\n", "x"]);
    },
    FUZZ_MS,
  );
});

describe("Notiz und Dokument", () => {
  it(
    "findFenceAt: Fuzz über Zäune, Einzug, Zeilenumbruch",
    (ctx) => {
      fuzz(ctx, (s) => findFenceAt(s, 1), [
        "```json\n",
        "```jsonc\n",
        "```\n",
        "~~~\n",
        "\n",
        " ",
        "x",
      ]);
    },
    FUZZ_MS,
  );

  it(
    "parse, jsoncParse und detectIndent: Fuzz über JSON-Zeichen, Leerraum, Kommentare",
    (ctx) => {
      const alphabet = ["{", "}", "[", "]", '"', ":", ",", " ", "\n", "\t", "/*", "*/", "//"];
      fuzz(ctx, parse, alphabet, 2);
      fuzz(ctx, jsoncParse, alphabet, 2);
      fuzz(ctx, detectIndent, [" ", "\t", "\n", "x"]);
    },
    FUZZ_MS,
  );

  it(
    "parsePathStr: Fuzz über Klammern, Anführungszeichen, Escape, Punkt",
    (ctx) => {
      fuzz(ctx, parsePathStr, ["[", "]", '"', "\\", ".", "a", "0"]);
    },
    FUZZ_MS,
  );

  it("findMatches: breite Werte bleiben linear (viele Schlüssel, lange Zeichenketten)", (ctx) => {
    const breit = lastGeschuetzt(ctx).pruefeLinear(
      (o: Record<string, string>) => findMatches(o, "k"),
      (n) =>
        Object.fromEntries(Array.from({ length: Math.ceil(n / 4) }, (_v, i) => [`k${i}`, "v"])),
    );
    expect(breit.linear, breit.message).toBe(true);
    const lang = lastGeschuetzt(ctx).pruefeLinear(
      (s: string) => findMatches({ a: s }, "zz"),
      (n) => "a".repeat(n),
    );
    expect(lang.linear, lang.message).toBe(true);
  });
});

describe("Verhalten: compileSchema weist weiter ab, was die frühere Regex als unsicher meldete (Wache jetzt code-kit `assessRegexRisk`)", () => {
  // Das Orakel ist die frühere Fassung (eine einzige Regex). Alle Zeichenfolgen bis Länge 5 aus den Zeichen, die den Unterschied machen.
  // Gemessen 2026-11-19 an allen 29 000 Mustern: früher unsicher 216; davon bleiben 198 unsicher, 9 sind keine gültige Regex (ungeschlossene Klammer, das Schema fällt
  // dann an der Meta-Prüfung durch) und 9 haben Leerraum zwischen `)` und Quantor (`(a+) +`: der Quantor gilt dem Leerzeichen, die Gruppe ist nicht verschachtelt,
  // die frühere Regex übersprang den Leerraum zu Unrecht). Neu abgewiesen werden 684 Muster, ausnahmslos die Regel `adjacent-quantifiers` (dasselbe Atom zweimal
  // hintereinander mit offenem Quantor, `a*a*`: quadratisch), nie eine andere.
  const QUANT = "(?:[+*]|\\{\\d*,?\\d*\\})";
  const ALT = new RegExp(`\\([^)]*${QUANT}[^)]*\\)\\s*${QUANT}`);
  const gueltig = (m: string): boolean => {
    try {
      new RegExp(m);
      return true;
    } catch {
      return false;
    }
  };
  const meldetUnsicher = (muster: string): boolean => {
    const r = compileSchema(JSON.stringify({ type: "string", pattern: muster }));
    return !r.ok && r.errorCode === "schemaUnsafePattern";
  };

  it("jedes früher unsichere Muster bleibt unsicher, außer den zwei benannten Fällen", () => {
    const alphabet = ["(", ")", "+", "*", "{1,}", "a", " "];
    let stufe: string[] = [""];
    const alle: string[] = [""];
    for (let i = 0; i < 5; i++) {
      stufe = stufe.flatMap((v) => alphabet.map((z) => v + z));
      alle.push(...stufe);
    }
    let frueherUnsicher = 0;
    let neuAbgewiesen = 0;
    for (const muster of alle) {
      const meldet = meldetUnsicher(muster);
      if (ALT.test(muster)) {
        frueherUnsicher++;
        if (meldet) continue;
        const ausnahme = !gueltig(muster) || /\) +[+*{]/.test(muster);
        expect(
          ausnahme,
          `früher unsicher, jetzt durchgelassen ohne benannten Grund: ${JSON.stringify(muster)}`,
        ).toBe(true);
      } else if (meldet) {
        neuAbgewiesen++;
        expect(assessRegexRisk(muster), JSON.stringify(muster)).toEqual({
          ok: false,
          rule: "adjacent-quantifiers",
        });
      }
    }
    // Die Probe kann beide Ausgänge erzeugen (CORE-TEST-08): ohne unsichere Muster in der Menge sagte „bleibt“ nichts.
    expect(frueherUnsicher).toBeGreaterThan(50);
    expect(neuAbgewiesen).toBeGreaterThan(50);
  });

  it("die Ausnahme mit Leerraum ist echt: `(a+) +` ist keine verschachtelte Wiederholung und wird durchgelassen", () => {
    expect(ALT.test("(a+) +")).toBe(true);
    expect(meldetUnsicher("(a+) +")).toBe(false);
    expect(meldetUnsicher("(a+)+")).toBe(true);
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
    (ctx) => {
      const f = lastGeschuetzt(ctx).pruefeLinearFuzz((s) => quadratisch(`x${s}x`), {
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
