import { offsetFromMessage, offsetOfLineCol } from "../../vendor/kit/json-error-position";
/** Fehlerstelle für das Reparatur-Fenster — obsidian-frei. Das Zeilenfenster selbst (`lineWindow`, `spliceWindow`) und das
 *  Lesen der Meldung (`offsetFromMessage`) liegen im Kit (code-kit 0.37.0, hier vendort); was bleibt, ist die Frage an den
 *  Parser des Blocks: wo scheitert er zuerst, und nennt er die Stelle selbst? */
import { jsoncParse } from "../jsonc";
import { parse } from "../parse";
import type { FenceLang } from "./fence";

/** Zeilen vor und nach der Fehlerzeile, die ein Fenster der ersten Runde trägt. */
export const WINDOW_RADIUS = 20;

/** Erster Parser-Fehler eines Textes: die Meldung und, wenn sie eine nennt, die Stelle. */
export interface ParseFailure {
  message: string;
  offset: number | null;
}

/** Der erste Fehler mit DEMSELBEN Parser, der den Text abgelehnt hat; `null` bei gültigem Text. Die Stelle ist `null`
 *  bei einer strikten Meldung ohne Positionsangabe (`Unexpected token 'X', "…" is not valid JSON`): sie zu raten schickte
 *  das falsche Fenster. */
export function firstError(text: string, lang: FenceLang): ParseFailure | null {
  if (lang === "jsonc") {
    const r = jsoncParse(text);
    return r.ok ? null : { message: r.error, offset: offsetOfLineCol(text, r.line, r.col) };
  }
  const r = parse(text);
  return r.ok ? null : { message: r.error, offset: offsetFromMessage(text, r.error) };
}

/** Offset des ersten Parser-Fehlers; `null` bei gültigem Text und bei einer Meldung ohne Positionsangabe. */
export function errorOffset(text: string, lang: FenceLang): number | null {
  return firstError(text, lang)?.offset ?? null;
}
