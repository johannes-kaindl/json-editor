// vendored from code-kit@0.37.5, src/ts/pure/json-error-position.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Where a JSON parser says the text is broken — and the arithmetic between an offset and a line/column pair.
 *
 *  Origin: json-editor `src/core/repair/window.ts` (`offsetFromMessage`, `offsetOfLineCol`) and `src/core/parse.ts` (`offsetToLineCol`,
 *  the same two regular expressions as `extractPosition` there); Welle 27, part 4 (the gate reviewer of the Bibliothek-Gate refused
 *  the exception: "n = 1" was wrong, the expressions stood in `parse.ts` already). Offsets are UTF-16 code units, the unit
 *  `String.prototype.slice` and the engine's own `position N` use; lines are separated by `\n` only (a `\r` is a column, as the
 *  engine counts it), line and column are 1-based.
 *
 *  **Why `offsetFromMessage` does not guess.** `JSON.parse` names the spot in two forms: `… at position N` (V8, also with
 *  `(line L column C)` after it) or `… at line L column C`. Newer engines send `Unexpected token ']', "[1,2,]" is not valid JSON` and
 *  `Unexpected end of JSON input` with NO spot. json-editor's `parse.ts` (`extractPosition`) guesses one for its error banner: the
 *  last occurrence of the token (`lastIndexOf`), which is right often enough for a banner and wrong whenever the token also stands
 *  inside a legal string. A caller that cuts a window around the spot and sends only that to a model must not use a guess — the
 *  wrong window repairs the wrong lines. So this answers `null` for a message without a spot, and the caller decides (send the whole
 *  text, ask the user). The two functions are different on purpose; do not merge them. */

/** The offset a parser message names, or `null` when it names none. `position N` wins over `line L column C` (the V8 form carries both
 *  and they agree). A position behind the end of the text is the end of the text; numbers with hundreds of digits are clamped, never
 *  `NaN`. Case-insensitive, any whitespace between the words. Never guesses: `Unexpected token 'X', "…" is not valid JSON` and
 *  `Unexpected end of JSON input` give `null`. */
export function offsetFromMessage(text: string, message: string): number | null {
  const pos = /position\s+(\d+)/i.exec(message);
  if (pos) return Math.min(Number.parseInt(pos[1] ?? "0", 10), text.length);
  const lc = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
  if (lc) return offsetOfLineCol(text, Number.parseInt(lc[1] ?? "1", 10), Number.parseInt(lc[2] ?? "1", 10));
  return null;
}

/** The offset of a spot given as line and column (both 1-based; lines separated by `\n`). A line behind the last line, or a column
 *  that runs past the text, gives the end of the text (the column runs on into the following lines, as the source did: the engine
 *  never names a column past its line). A line or column below 1, `NaN` or fractional is taken as 1 (or rounded down): the result
 *  is always an integer between 0 and `text.length`. */
export function offsetOfLineCol(text: string, line: number, col: number): number {
  const wantLine = Math.floor(line);   // below 1 or NaN: the loop does not run, the first line
  const wantCol = Number.isNaN(col) ? 1 : Math.max(1, Math.floor(col));
  let offset = 0;
  for (let l = 1; l < wantLine; l++) {
    const nl = text.indexOf("\n", offset);
    if (nl < 0) return text.length;
    offset = nl + 1;
  }
  return Math.min(offset + wantCol - 1, text.length);
}

/** Line and column (both 1-based) of an offset. An offset at or behind the end of the text counts to the end; a negative one, or `NaN`,
 *  is the start. Only `\n` starts a line. */
export function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}
