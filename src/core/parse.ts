import { offsetFromMessage, offsetToLineCol } from "../vendor/kit/json-error-position";
import type { JsonValue, ParseResult } from "./types";

export { offsetToLineCol };

export function parse(text: string): ParseResult {
  if (text.trim() === "") {
    return { ok: false, error: "Empty input", line: 1, col: 1 };
  }
  try {
    const value = JSON.parse(text) as JsonValue;
    return { ok: true, value };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const { line, col } = extractPosition(text, message);
    return { ok: false, error: message, line, col };
  }
}

function extractPosition(text: string, message: string): { line: number; col: number } {
  // Die Stelle, die die Meldung selbst nennt (`position N` bei V8, sonst `line N column M`): das Kit liest sie, ohne zu raten.
  const offset = offsetFromMessage(text, message);
  if (offset !== null) return offsetToLineCol(text, offset);
  // Fallback for Node >=24 V8 messages that omit position info ("Unexpected
  // token 'X', ... is not valid JSON"). lastIndexOf is heuristic: it can
  // misidentify the position when the token character also appears earlier
  // in legal content (e.g. inside a string literal). Good enough for the
  // error-banner UX — known limitation, parser-rewrite not in scope.
  // Die Reparatur nutzt diesen Rat NICHT (sie schnitte damit das falsche Fenster): `offsetFromMessage` gibt dort `null`.
  const tokenMatch = /Unexpected token '([^']+)'/i.exec(message);
  if (tokenMatch) {
    const guess = text.lastIndexOf(tokenMatch[1]);
    if (guess >= 0) {
      return offsetToLineCol(text, guess);
    }
  }
  return { line: 1, col: 1 };
}
