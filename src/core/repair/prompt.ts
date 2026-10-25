import { unwrapAnswer } from "../../vendor/kit/llm-answer";
import type { TextWindow } from "../../vendor/kit/text-window";
import { jsoncParse } from "../jsonc";
import { parse } from "../parse";
import type { FenceLang } from "./fence";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

const SYSTEM = [
  "You repair broken JSON.",
  "You receive a document and the error message of a strict JSON parser.",
  "Return the same document with the smallest possible change that makes it parse:",
  "fix syntax only (missing or extra commas, quotes, brackets and braces, unquoted keys, single quotes, trailing commas, stray text).",
  "Never rename keys, reorder entries, change values or add data that is not there.",
  "Answer with the repaired document only — no explanation, no Markdown fence.",
].join(" ");

const SYSTEM_JSONC = `${SYSTEM} The document may contain // and /* */ comments; keep them exactly where they are.`;

export function buildRepairMessages(
  source: string,
  errorMessage: string,
  lang: FenceLang,
): ChatMessage[] {
  return [
    { role: "system", content: lang === "jsonc" ? SYSTEM_JSONC : SYSTEM },
    { role: "user", content: `Parser error: ${errorMessage}\n\nDocument:\n${source}` },
  ];
}

const SYSTEM_EXCERPT = [
  "You repair broken JSON.",
  "You receive an excerpt — consecutive lines — of a larger document, and the error message of a strict JSON parser for the whole document.",
  "The excerpt starts and ends in the middle of the document: brackets and braces that are opened or closed outside of it are expected, so do not add or remove one just to balance the excerpt.",
  "Return the same lines with the smallest possible change that fixes the syntax error at the reported spot:",
  "fix syntax only (missing or extra commas, quotes, brackets and braces, unquoted keys, single quotes, trailing commas, stray text).",
  "Never rename keys, reorder entries, change values or add data that is not there, and keep the indentation.",
  "Answer with the repaired lines only — no explanation, no Markdown fence, nothing from outside the excerpt.",
].join(" ");

const SYSTEM_EXCERPT_JSONC = `${SYSTEM_EXCERPT} The excerpt may contain // and /* */ comments; keep them exactly where they are.`;

/** Die Meldung ohne die Stelle im ganzen Dokument: `position N` und `line N column M` meinen dort Zahlen,
 *  die der Ausschnitt nicht trägt, und verleiteten das Modell, nach einer Zeile zu suchen, die es nicht sieht. */
function withoutPosition(message: string): string {
  return message
    .replace(/\s*\(line\s+\d+\s+column\s+\d+\)/gi, "")
    .replace(/\s+at\s+(?:position\s+\d+|line\s+\d+\s+column\s+\d+)/gi, "")
    .trim();
}

/** Anfrage für ein Fenster: das Modell bekommt nur die Zeilen um die Fehlerstelle und gibt nur diese Zeilen zurück.
 *  Bewusst ein anderes Kopfwort als `Document:` — die ganze Datei und der Ausschnitt sind zwei Verträge. */
export function buildExcerptMessages(
  win: TextWindow,
  errorMessage: string,
  lang: FenceLang,
): ChatMessage[] {
  const line = win.line - win.from + 1;
  return [
    { role: "system", content: lang === "jsonc" ? SYSTEM_EXCERPT_JSONC : SYSTEM_EXCERPT },
    {
      role: "user",
      content: [
        `Parser error: ${withoutPosition(errorMessage)}`,
        `The parser stopped at line ${line}, column ${win.col} of the excerpt below (lines ${win.from + 1} to ${win.to + 1} of ${win.total} of the document).`,
        "",
        `Excerpt:\n${win.text}`,
      ].join("\n"),
    },
  ];
}

/** Zieht das Dokument aus der Antwort: Denkbloecke weg, ein umschliessender Markdown-Zaun weg.
 *  Mehr nicht — was danach nicht parst, ist ein Fehler, keine Reparatur wert. */
export function extractDocument(answer: string): string {
  return unwrapAnswer(answer);
}

export type Validated = { ok: true; text: string } | { ok: false; error: string };

/** Prueft die Antwort mit DEMSELBEN Parser, der den Block abgelehnt hat. Nur ein gueltiges
 *  Ergebnis darf im Modal zum Anwenden freigegeben werden. */
export function validateRepair(answer: string, lang: FenceLang): Validated {
  const text = extractDocument(answer);
  if (text === "") return { ok: false, error: "Empty answer" };
  const parsed = lang === "jsonc" ? jsoncParse(text) : parse(text);
  return parsed.ok ? { ok: true, text } : { ok: false, error: parsed.error };
}
