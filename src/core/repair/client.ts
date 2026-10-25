import type { FenceLang } from "./fence";
import { validateRepair } from "./prompt";

/** Modus dieses Plugins in der Sampling-Profile-Tabelle: der Ablauf liefert ein schema-
 *  gebundenes Dokument, kein Gespraech — „structured". Nur EIN Modus, deshalb fest verdrahtet. */
export const MODE = "structured";

/** Antwortbudget: das reparierte Dokument ist etwa so lang wie das kaputte. Zeichen/2 ist bei
 *  JSON (viele Kurz-Token) konservativ; der Deckel schuetzt vor einem Riesenblock. */
export function repairMaxTokens(source: string): number {
  return Math.min(16384, Math.max(2048, Math.ceil(source.length / 2) + 512));
}

export type RepairError =
  | { kind: "no-endpoint"; detail: string }
  | { kind: "http"; status: number; detail: string }
  | { kind: "network" }
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "empty" }
  | { kind: "invalid"; detail: string; answer: string };

export type RepairResult = { ok: true; text: string } | { ok: false; error: RepairError };

/** Ausgang der Verbindung, soweit die Abbildung ihn braucht — strukturell gehalten, damit der
 *  Kern die obsidian-Schicht (`LlmResult`) nicht importiert. */
export type ConnectionOutcome =
  | { ok: true; content: string }
  | { ok: false; kind: string; detail: string; status?: number };

/** Antwort der Verbindung als Text oder Fehler, ohne den Text zu prüfen. */
export type Answer = { ok: true; content: string } | { ok: false; error: RepairError };

/** `LlmResult` der Verbindung → Text oder Fehler der Reparatur. Eine abgeschnittene Antwort mit Text
 *  kommt als Erfolg an (`finishReason: "length"`) und scheitert, wenn ueberhaupt, an der Pruefung
 *  mit dem Parser. Die Pruefung ist Sache des Aufrufers: ein ganzes Dokument prueft `toRepairResult`,
 *  einen Ausschnitt erst das Dokument, in das er eingesetzt ist. */
export function outcomeToAnswer(r: ConnectionOutcome): Answer {
  if (!r.ok) {
    switch (r.kind) {
      case "no-endpoint":
        return { ok: false, error: { kind: "no-endpoint", detail: r.detail } };
      case "aborted":
        return { ok: false, error: { kind: "aborted" } };
      case "timeout":
        return { ok: false, error: { kind: "timeout" } };
      case "http":
      case "overflow":
        return { ok: false, error: { kind: "http", status: r.status ?? 0, detail: r.detail } };
      case "truncated":
        return { ok: false, error: { kind: "empty" } };
      default:
        return { ok: false, error: { kind: "network" } };
    }
  }
  if (r.content.trim() === "") return { ok: false, error: { kind: "empty" } };
  return { ok: true, content: r.content };
}

/** `LlmResult` der Verbindung → Ergebnis der Reparatur fuer ein ganzes Dokument, geprueft mit dem Parser des Blocks. */
export function toRepairResult(r: ConnectionOutcome, lang: FenceLang): RepairResult {
  const a = outcomeToAnswer(r);
  if (!a.ok) return a;
  const v = validateRepair(a.content, lang);
  if (!v.ok) return { ok: false, error: { kind: "invalid", detail: v.error, answer: a.content } };
  return { ok: true, text: v.text };
}
