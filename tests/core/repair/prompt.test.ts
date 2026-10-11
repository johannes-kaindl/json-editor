import { describe, expect, it } from "vitest";
import {
  buildRepairMessages,
  extractDocument,
  validateRepair,
} from "../../../src/core/repair/prompt";

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
    const zeit = (n: number) => {
      const t = performance.now();
      extractDocument(`${"<think>".repeat(n)}{"a":1}`);
      return performance.now() - t;
    };
    zeit(1000);
    const klein = zeit(10_000);
    const gross = zeit(50_000);
    // quadratisch waeren 25x; linear etwa 5x. Grosszuegige Grenze gegen Rauschen.
    expect(gross).toBeLessThan(Math.max(klein, 5) * 15);
    expect(gross).toBeLessThan(500);
  });
  it("bleibt linear bei einem Zaun mit vielen Leerzeilen, der nie schliesst", () => {
    // Praefix, das FENCED anlaufen laesst, ohne dass es passt: Zaun, dann Leerzeilen, dann kein Schluss.
    const zeit = (n: number) => {
      const t = performance.now();
      extractDocument(`\`\`\`${" \n".repeat(n)}x`);
      return performance.now() - t;
    };
    zeit(1000);
    const klein = zeit(10_000);
    const gross = zeit(50_000);
    expect(gross).toBeLessThan(Math.max(klein, 5) * 15);
    expect(gross).toBeLessThan(500);
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
