import type { JsonValue, ParseResult } from "./types";

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
  // Node's JSON.parse error messages include "position N" (V8) or
  // "line N column M" depending on engine/version. Try both.
  const posMatch = /position\s+(\d+)/i.exec(message);
  if (posMatch) {
    const offset = parseInt(posMatch[1], 10);
    return offsetToLineCol(text, offset);
  }
  const lineColMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
  if (lineColMatch) {
    return { line: parseInt(lineColMatch[1], 10), col: parseInt(lineColMatch[2], 10) };
  }
  // Fallback: extract the unexpected token and find its last occurrence in text.
  const tokenMatch = /Unexpected token '([^']+)'/i.exec(message);
  if (tokenMatch) {
    const offset = text.lastIndexOf(tokenMatch[1]);
    if (offset >= 0) {
      return offsetToLineCol(text, offset);
    }
  }
  return { line: 1, col: 1 };
}

function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}
