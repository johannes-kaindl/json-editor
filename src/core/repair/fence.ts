/** Zaun-Suche und Ersetzen im Notiztext — obsidian-frei. Der Reparatur-Ablauf ersetzt nur den
 *  INHALT eines Codeblocks, nie die Notiz: dafuer braucht er die Zeilen des Blocks (wie
 *  `ctx.getSectionInfo` sie liefert: `lineStart`/`lineEnd` sind die Zaun-Zeilen selbst) und
 *  einen Beleg, dass der Text dort noch der ist, den das Modell gesehen hat. */

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

const OPEN = /^(\s*)(`{3,}|~{3,})\s*(json|jsonc)\s*$/i;

/** Der ```json-/```jsonc-Block, in dem `line` liegt (Zaun-Zeilen eingeschlossen), sonst null. */
export function findFenceAt(text: string, line: number): Fence | null {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const open = OPEN.exec(lines[i] ?? "");
    if (!open) {
      i++;
      continue;
    }
    const marker = open[2] ?? "```";
    const closeRe = new RegExp(`^\\s*${marker[0] === "~" ? "~" : "`"}{${marker.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j] ?? "")) j++;
    // Ein nie geschlossener Zaun hat keine verlaesslichen Grenzen — dort wird nichts repariert.
    if (j >= lines.length) return null;
    const end = j;
    if (line >= i && line <= end) {
      return {
        lang: (open[3] ?? "json").toLowerCase() === "jsonc" ? "jsonc" : "json",
        start: i,
        end,
        content: lines.slice(i + 1, j).join("\n"),
      };
    }
    i = j + 1;
  }
  return null;
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
