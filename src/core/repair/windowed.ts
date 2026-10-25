/** Der Reparaturlauf mit Fenstern — obsidian-frei. Eine große Datei geht nicht ganz an das Modell: es bekommt die
 *  Zeilen um den ersten Parser-Fehler und gibt nur diese zurück; das Plugin setzt sie ein und prüft das GANZE Dokument
 *  mit dem Parser des Blocks. Ein Fenster kann die Ursache verfehlen (der Parser meldet die erste Stelle, an der es nicht
 *  weitergeht, nicht die Ursache: eine fehlende Klammer steht erst am Ende, ein fehlendes Anführungszeichen oft viel
 *  später), deshalb gibt es eine Leiter: höchstens `MAX_WINDOW_ROUNDS` Fenster, dann das ganze Dokument wie bisher. */
import { unwrapAnswer } from "../../vendor/kit/llm-answer";
import { lineWindow, spliceWindow } from "../../vendor/kit/text-window";
import {
  type ConnectionOutcome,
  type RepairResult,
  outcomeToAnswer,
  toRepairResult,
} from "./client";
import type { FenceLang } from "./fence";
import { type ChatMessage, buildExcerptMessages, buildRepairMessages } from "./prompt";
import { WINDOW_RADIUS, firstError } from "./window";

/** Ab so vielen Zeilen lohnt ein Fenster; darunter bleibt es beim ganzen Dokument. */
export const WINDOW_MIN_LINES = 200;

/** Höchstens so viele Fenster-Aufrufe je Lauf. Dazu kommt, wenn sie nicht reichen, ein Aufruf mit dem ganzen
 *  Dokument: der Lauf kostet also höchstens `MAX_WINDOW_ROUNDS + 1` Modellaufrufe. */
export const MAX_WINDOW_ROUNDS = 3;

/** Was an das Modell geht: die Nachrichten und der Text, nach dem sich das Antwortbudget richtet. */
export interface AskRequest {
  messages: ChatMessage[];
  payload: string;
}

export type Ask = (req: AskRequest) => Promise<ConnectionOutcome>;

export interface WindowOptions {
  minLines: number;
  radius: number;
  rounds: number;
}

/**
 * @param source        der kaputte Text (Dateitext oder Inhalt des Codeblocks)
 * @param errorMessage  die Meldung des Parsers zu `source`
 * @param ask           ein Modellaufruf; der Fehler einer Verbindung beendet den Lauf sofort
 *
 * Eine Runde gilt als Fortschritt, wenn der Parser mit der eingesetzten Antwort an einer SPÄTEREN Stelle scheitert
 * als zuvor (oder das Dokument parst); dann bleibt die Antwort im Dokument. Sonst wird sie verworfen und das
 * nächste Fenster ist doppelt so groß. Eine Fehlerstelle, die der Parser nicht nennt, führt zum ganzen Dokument.
 */
export async function repairWindowed(
  source: string,
  errorMessage: string,
  lang: FenceLang,
  ask: Ask,
  options: Partial<WindowOptions> = {},
): Promise<RepairResult> {
  const {
    minLines,
    radius: baseRadius,
    rounds,
  } = { minLines: WINDOW_MIN_LINES, radius: WINDOW_RADIUS, rounds: MAX_WINDOW_ROUNDS, ...options };
  const whole = async (doc: string, message: string): Promise<RepairResult> =>
    toRepairResult(
      await ask({ messages: buildRepairMessages(doc, message, lang), payload: doc }),
      lang,
    );

  let working = source;
  let message = errorMessage;
  let offset = firstError(working, lang)?.offset ?? null;
  if (offset === null) return whole(source, errorMessage);
  if (lineWindow(working, offset, baseRadius).total <= minLines) return whole(source, errorMessage);

  let radius = baseRadius;
  for (let round = 0; round < rounds; round++) {
    const win = lineWindow(working, offset, radius);
    // Ein Fenster, das alles deckt, spart nichts: gleich das ganze Dokument.
    if (win.from === 0 && win.to === win.total - 1) break;
    const answer = outcomeToAnswer(
      await ask({ messages: buildExcerptMessages(win, message, lang), payload: win.text }),
    );
    if (!answer.ok) return answer;
    const excerpt = unwrapAnswer(answer.content, { keepIndent: true });
    if (excerpt === "") {
      radius *= 2;
      continue;
    }
    const candidate = spliceWindow(working, win, excerpt);
    const next = firstError(candidate, lang);
    if (next === null) return { ok: true, text: candidate };
    // Die Stelle zu verlieren heißt, nicht mehr beurteilen zu können, ob die Runde etwas gebracht hat: ganzes Dokument.
    if (next.offset === null) break;
    if (next.offset > offset) {
      working = candidate;
      offset = next.offset;
      message = next.message;
      radius = baseRadius;
    } else {
      radius *= 2;
    }
  }
  return whole(working, message);
}
