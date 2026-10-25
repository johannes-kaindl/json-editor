import { describe, expect, it } from "vitest";
import {
  type ConnectionOutcome,
  outcomeToAnswer,
  repairMaxTokens,
  toRepairResult,
} from "../../../src/core/repair/client";

describe("repairMaxTokens", () => {
  it("hat Boden und Deckel", () => {
    expect(repairMaxTokens("x")).toBe(2048);
    expect(repairMaxTokens("x".repeat(100_000))).toBe(16384);
  });
});

const ok = (content: string): ConnectionOutcome => ({ ok: true, content });
const fail = (kind: string, over: Partial<{ detail: string; status: number }> = {}) =>
  ({ ok: false, kind, detail: "d", ...over }) as ConnectionOutcome;

describe("toRepairResult — Erfolg", () => {
  it("nimmt ein gueltiges Dokument an", () => {
    expect(toRepairResult(ok('{"a": 1}'), "json")).toEqual({ ok: true, text: '{"a": 1}' });
  });
  it("nimmt ein gueltiges Dokument im Markdown-Zaun an", () => {
    expect(toRepairResult(ok('```json\n{"a": 1}\n```'), "json")).toMatchObject({ ok: true });
  });
  it("lehnt ein ungueltiges Dokument mit dem Parser des Blocks ab", () => {
    expect(toRepairResult(ok('{"a": 1,}'), "json")).toMatchObject({
      ok: false,
      error: { kind: "invalid", answer: '{"a": 1,}' },
    });
  });
  it("jsonc: Kommentare bleiben gueltig", () => {
    expect(toRepairResult(ok('{"a": 1 /* c */}'), "jsonc")).toMatchObject({ ok: true });
  });
  it("leere Antwort ist ein eigener Fehler", () => {
    expect(toRepairResult(ok("  "), "json")).toEqual({ ok: false, error: { kind: "empty" } });
  });
});

describe("toRepairResult — Fehlerarten der Verbindung", () => {
  it("http traegt Status und Servertext", () => {
    expect(toRepairResult(fail("http", { status: 400, detail: "bad model" }), "json")).toEqual({
      ok: false,
      error: { kind: "http", status: 400, detail: "bad model" },
    });
  });
  it("overflow (Kontext zu klein) wird als http gemeldet, ohne Status mit 0", () => {
    expect(toRepairResult(fail("overflow", { detail: "too long" }), "json")).toEqual({
      ok: false,
      error: { kind: "http", status: 0, detail: "too long" },
    });
  });
  it.each(["aborted", "timeout", "network"] as const)("%s bleibt %s", (kind) => {
    expect(toRepairResult(fail(kind), "json")).toEqual({ ok: false, error: { kind } });
  });
  it("truncated ohne Text bleibt eine leere Antwort", () => {
    expect(toRepairResult(fail("truncated"), "json")).toEqual({
      ok: false,
      error: { kind: "empty" },
    });
  });
  it("no-endpoint traegt den Grund des Managers", () => {
    expect(toRepairResult(fail("no-endpoint", { detail: "secret-missing" }), "json")).toEqual({
      ok: false,
      error: { kind: "no-endpoint", detail: "secret-missing" },
    });
  });
  it("eine unbekannte Art faellt auf network zurueck", () => {
    expect(toRepairResult(fail("???"), "json")).toEqual({ ok: false, error: { kind: "network" } });
  });
});

describe("outcomeToAnswer — die Abbildung ohne Prüfung des Dokuments (Fensterweg)", () => {
  it("reicht den Text der Antwort unverändert durch, auch wenn er kein JSON ist", () => {
    expect(outcomeToAnswer(ok('  "a": 1,\n  "b": 2'))).toEqual({
      ok: true,
      content: '  "a": 1,\n  "b": 2',
    });
  });
  it("leere Antwort ist ein eigener Fehler", () => {
    expect(outcomeToAnswer(ok(" \n "))).toEqual({ ok: false, error: { kind: "empty" } });
  });
  it("bildet die Fehlerarten der Verbindung wie toRepairResult ab", () => {
    for (const kind of [
      "no-endpoint",
      "aborted",
      "timeout",
      "http",
      "overflow",
      "truncated",
      "x",
    ]) {
      const o = fail(kind, { status: 500 });
      expect(outcomeToAnswer(o)).toEqual(toRepairResult(o, "json"));
    }
  });
});
