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

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;
const FENCED = /^```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/i;

/** Zieht das Dokument aus der Antwort: Denkbloecke weg, ein umschliessender Markdown-Zaun weg.
 *  Mehr nicht — was danach nicht parst, ist ein Fehler, keine Reparatur wert. */
export function extractDocument(answer: string): string {
  const bare = answer.replace(THINK_BLOCK, "").trim();
  const fenced = FENCED.exec(bare);
  return (fenced ? (fenced[1] ?? "") : bare).trim();
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
