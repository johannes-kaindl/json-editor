/** Zaun-Suche und Ersetzen im Notiztext — obsidian-frei. Der Reparatur-Ablauf ersetzt nur den
 *  INHALT eines Codeblocks, nie die Notiz: dafuer braucht er die Zeilen des Blocks (wie
 *  `ctx.getSectionInfo` sie liefert: `lineStart`/`lineEnd` sind die Zaun-Zeilen selbst) und
 *  einen Beleg, dass der Text dort noch der ist, den das Modell gesehen hat. */

import { findFenceAt as scanFenceAt } from "../../vendor/kit/fences";

export type FenceLang = "json" | "jsonc";

export interface Fence {
  lang: FenceLang;
  /** Zeile des oeffnenden Zauns (0-basiert). */
  start: number;
  /** Zeile des schliessenden Zauns. */
  end: number;
  /** Inhalt zwischen den Zaeunen, Zeilen mit "\n" verbunden. */
  content: string;
}

/** Der ```json-/```jsonc-Block, in dem `line` liegt (Zaun-Zeilen eingeschlossen), sonst null.
 *
 *  Die Suche ist der Zaun-Scanner des Kits (code-kit `fences`, CommonMark: Einzug bis drei Spalten). Drei Abweichungen gegen die frühere eigene Fassung, gemessen
 *  am 2026-11-15 (code-kit-Test `fences-scanner`), hier entschieden und in `tests/core/repair/fence.test.ts` festgehalten:
 *  1. Der Rumpf einer CRLF-Notiz kommt LF-verbunden (früher mit `\r` je Zeile); der Palettenbefehl liest den Editor, und der gibt nur `\n`.
 *  2. Ein ```json-Zaun INNERHALB eines anderen Zauns (etwa in einem ```md-Beispiel) ist Inhalt des äußeren, kein Block mehr.
 *  3. Die Sprache ist das erste Wort der Info-Zeile: ```json title="x" gilt als json (Obsidian reicht dem Code-Block-Prozessor ebenfalls das erste Wort). */
export function findFenceAt(text: string, line: number): Fence | null {
  const f = scanFenceAt(text, line, { maxIndent: 3 });
  // Ein nie geschlossener Zaun hat keine verlaesslichen Grenzen — dort wird nichts repariert.
  if (f === null || !f.closed || (f.lang !== "json" && f.lang !== "jsonc")) return null;
  return { lang: f.lang, start: f.openLine, end: f.closeLine, content: f.body };
}

/** Ersetzt den Inhalt des Blocks zwischen den Zaun-Zeilen `start`/`end`. `null`, wenn der Text
 *  dort nicht mehr `expected` ist (die Notiz hat sich seit der Anfrage geaendert) — dann wird
 *  NICHTS geschrieben. */
export function spliceFence(
  text: string,
  start: number,
  end: number,
  expected: string,
  replacement: string,
): string | null {
  const lines = text.split("\n");
  if (start < 0 || end <= start || end >= lines.length) return null;
  const current = lines.slice(start + 1, end).join("\n");
  if (current.trimEnd() !== expected.trimEnd()) return null;
  const insert = replacement.replace(/\s+$/, "").split("\n");
  lines.splice(start + 1, end - start - 1, ...insert);
  return lines.join("\n");
}
