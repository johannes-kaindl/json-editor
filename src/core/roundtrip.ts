/**
 * Does this number literal lose VALUE (not just formatting) when parsed into a
 * JS number and serialized back?
 *
 * - Integer literals (no `.`/`e`): lossy iff the double cannot hold them
 *   exactly — i.e. BigInt(literal) !== BigInt(Number(literal)). This catches
 *   64-bit IDs beyond 2^53 (9007199254740993 → …992).
 * - Any literal that overflows to ±Infinity is lossy.
 * - Decimal/exponent literals are treated as value-preserving: `1.0` → `1`,
 *   `1e3` → `1000`, `2.50` → `2.5` change only the format, not the value, and
 *   a tree edit already reformats the whole document harmlessly. (Trade-off:
 *   an over-precise decimal like 0.123456789012345678 is NOT flagged — rare in
 *   real configs, and worth it to avoid false positives on common files.)
 */
function literalLosesValue(literal: string): boolean {
  if (!/[0-9]/.test(literal)) return false; // no digit → not a real number literal (e.g. a lone "-")
  const n = Number(literal);
  if (!Number.isFinite(n)) return true; // overflow to ±Infinity
  if (/[.eE]/.test(literal)) return false; // decimal/exponent: format-only
  try {
    return BigInt(literal) !== BigInt(n);
  } catch {
    return false;
  }
}

/**
 * Detect whether parsing `text` as JSON and re-serializing it would silently
 * change a number's VALUE — integers beyond 2^53 (typical 64-bit IDs) lose
 * precision, and overflowing literals collapse to Infinity.
 *
 * Works on the ORIGINAL text and compares number TOKENS only: it scans the
 * document, skips string contents (so numeric-looking text inside strings or
 * keys never triggers) and skips `//` / block comments (so a hyphen or a big
 * number inside a .jsonc comment never triggers), and tests each bare number
 * literal with literalLosesValue. Whitespace/indent and value-preserving format
 * normalization are inherently ignored.
 *
 * Pure — no Obsidian imports. Returns true on the FIRST lossy literal found.
 */
export function hasNumberRoundtripLoss(text: string): boolean {
  const n = text.length;
  let i = 0;
  let inString = false;

  while (i < n) {
    const c = text[i];

    if (inString) {
      if (c === "\\") {
        i += 2; // skip the escaped character
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }

    if (c === '"') {
      inString = true;
      i++;
      continue;
    }

    // Skip comments (.jsonc). Comment bodies contain prose — a hyphenated word
    // like "App-Konfiguration" or a big number in a note must never be scanned
    // as a value literal. In strict .json these sequences can't appear outside
    // strings, so this is a no-op there.
    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2; // skip the closing */
      continue;
    }

    // Outside a string, JSON keys are always quoted, so any bare number is a
    // value. A number literal starts with '-' or a digit.
    if (c === "-" || (c >= "0" && c <= "9")) {
      const start = i;
      if (text[i] === "-") i++;
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
      if (text[i] === ".") {
        i++;
        while (i < n && text[i] >= "0" && text[i] <= "9") i++;
      }
      if (text[i] === "e" || text[i] === "E") {
        i++;
        if (text[i] === "+" || text[i] === "-") i++;
        while (i < n && text[i] >= "0" && text[i] <= "9") i++;
      }
      const literal = text.slice(start, i);
      if (literalLosesValue(literal)) return true;
      continue;
    }

    i++;
  }

  return false;
}
