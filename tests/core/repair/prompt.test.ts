import { describe, expect, it } from "vitest";
import {
  buildExcerptMessages,
  buildRepairMessages,
  extractDocument,
  validateRepair,
} from "../../../src/core/repair/prompt";
import { unwrapAnswer } from "../../../src/vendor/kit/llm-answer";
import type { TextWindow } from "../../../src/vendor/kit/text-window";
import { pruefeLinear } from "../../vendor/kit/linear-probe";

describe("buildRepairMessages", () => {
  it("traegt Code und Parser-Fehler und verlangt nur das Dokument", () => {
    const [sys, user] = buildRepairMessages('{"a": 1,}', "Unexpected token }", "json");
    expect(sys?.role).toBe("system");
    expect(sys?.content).toMatch(/only/i);
    expect(sys?.content).not.toMatch(/comments/);
    expect(user?.content).toContain("Parser error: Unexpected token }");
    expect(user?.content).toContain('{"a": 1,}');
  });
  it("jsonc: Kommentare bleiben stehen", () => {
    expect(buildRepairMessages("{", "x", "jsonc")[0]?.content).toMatch(/keep them/);
  });
});

describe("extractDocument", () => {
  it("bleibt linear bei vielen nie geschlossenen <think>", () => {
    const r = pruefeLinear(extractDocument, (n) => `${"<think>".repeat(n)}{"a":1}`);
    expect(r.linear, r.message).toBe(true);
  });
  it("bleibt linear bei einem Zaun mit vielen Leerzeilen, der nie schliesst", () => {
    // Praefix, das FENCED anlaufen laesst, ohne dass es passt: Zaun, dann Leerzeilen, dann kein Schluss.
    const r = pruefeLinear(extractDocument, (n) => `\`\`\`${" \n".repeat(n)}x`);
    expect(r.linear, r.message).toBe(true);
  });
  it("entfernt Denkbloecke und einen umschliessenden Zaun", () => {
    expect(extractDocument('<think>hm</think>\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractDocument('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe("validateRepair", () => {
  it("nimmt gueltiges JSON an", () => {
    expect(validateRepair('```json\n{"a": 1}\n```', "json")).toEqual({
      ok: true,
      text: '{"a": 1}',
    });
  });
  it("lehnt ungueltiges JSON mit dem Parser-Fehler ab", () => {
    const v = validateRepair('{"a": 1,}', "json");
    expect(v.ok).toBe(false);
  });
  it("jsonc akzeptiert Kommentare, json nicht", () => {
    expect(validateRepair('// c\n{"a": 1}', "jsonc").ok).toBe(true);
    expect(validateRepair('// c\n{"a": 1}', "json").ok).toBe(false);
  });
  it("leere Antwort ist ein Fehler", () => {
    expect(validateRepair("  ", "json")).toEqual({ ok: false, error: "Empty answer" });
  });
});

describe("buildExcerptMessages", () => {
  const win: TextWindow = {
    from: 29,
    to: 31,
    total: 120,
    start: 400,
    end: 440,
    text: '  "a": 1,\n  "b" 2,\n  "c": 3',
    line: 30,
    col: 7,
  };
  const msg = "Expected ':' after property name in JSON at position 417 (line 31 column 7)";

  it("nennt den Ausschnitt als Ausschnitt, mit Zeilen und der Stelle darin", () => {
    const [sys, user] = buildExcerptMessages(win, msg, "json");
    expect(sys?.content).toMatch(/excerpt/i);
    expect(sys?.content).toMatch(/do not add or remove/i);
    expect(user?.content).toContain("lines 30 to 32 of 120");
    expect(user?.content).toContain("line 2, column 7 of the excerpt");
    expect(user?.content).toContain(`Excerpt:\n${win.text}`);
  });

  it("trägt den Fehler ohne die Zahlen des ganzen Dokuments", () => {
    const user = buildExcerptMessages(win, msg, "json")[1]?.content ?? "";
    expect(user).toContain("Parser error: Expected ':' after property name in JSON");
    expect(user).not.toContain("position 417");
    expect(user).not.toContain("line 31 column 7");
  });

  it("verwendet nicht das Format `Document:` der ganzen Datei", () => {
    expect(buildExcerptMessages(win, msg, "json")[1]?.content).not.toContain("Document:");
  });

  it("jsonc: Kommentare bleiben stehen", () => {
    expect(buildExcerptMessages(win, "CommaExpected", "jsonc")[0]?.content).toMatch(/keep them/);
  });
});

const extractExcerpt = (answer: string): string => unwrapAnswer(answer, { keepIndent: true });

describe("Ausschnitt entzäunen (unwrapAnswer mit keepIndent)", () => {
  it("lässt die Einrückung der ersten Zeile stehen (extractDocument schneidet sie ab)", () => {
    expect(extractExcerpt('  "a": 1,\n  "b": 2')).toBe('  "a": 1,\n  "b": 2');
    expect(extractDocument('  "a": 1,\n  "b": 2')).toBe('"a": 1,\n  "b": 2');
  });
  it("entfernt Leerzeilen davor und Leerraum dahinter", () => {
    expect(extractExcerpt('\n\n  "a": 1,\n  "b": 2\n\n')).toBe('  "a": 1,\n  "b": 2');
  });
  it("entfernt Denkblöcke und einen umschließenden Zaun", () => {
    expect(extractExcerpt('<think>hm</think>\n```json\n  "a": 1,\n  "b": 2\n```')).toBe(
      '  "a": 1,\n  "b": 2',
    );
  });
  it("bleibt linear bei vielen nie geschlossenen <think>", () => {
    const r = pruefeLinear(extractExcerpt, (n) => `${"<think>".repeat(n)}{"a":1}`);
    expect(r.linear, r.message).toBe(true);
  });
  it("bleibt linear bei Leerzeilen vor dem Inhalt und bei einem Zaun, der nie schließt", () => {
    const leer = pruefeLinear(extractExcerpt, (n) => `${" \n".repeat(n)}x`);
    expect(leer.linear, leer.message).toBe(true);
    const zaun = pruefeLinear(extractExcerpt, (n) => `\`\`\`${" \n".repeat(n)}x`);
    expect(zaun.linear, zaun.message).toBe(true);
  });
});
