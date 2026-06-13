/**
 * Detect whether parsing `text` as JSON and re-serializing it would silently
 * alter a number literal — e.g. integers beyond 2^53 losing precision
 * (9007199254740993 → …992), normalized formats (1.0 → 1, 1e3 → 1000).
 *
 * Works on the ORIGINAL text and compares number TOKENS only: it scans the
 * document, skips string contents (so numeric-looking text inside strings or
 * keys never triggers), and for each bare number literal checks whether
 * JSON.stringify(JSON.parse(lit)) reproduces it verbatim. Whitespace/indent
 * differences are inherently ignored because only number tokens are compared.
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
      try {
        if (JSON.stringify(JSON.parse(literal)) !== literal) return true;
      } catch {
        // Not a standalone-parseable number (e.g. a lone "-"); ignore — the
        // parse-error banner already covers malformed JSON.
      }
      continue;
    }

    i++;
  }

  return false;
}
