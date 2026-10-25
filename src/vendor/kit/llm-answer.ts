// vendored from code-kit@0.37.5, src/ts/pure/llm-answer.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { stripThinkBlocks } from "./think-splitter";

/** The shape of the whole answer: a Markdown fence from the first line to the last, language tag optional, a closing fence that may
 *  follow the text directly. */
const FENCED = /^```[a-z]*[ \t]*\r?\n([\s\S]*?)\n?```\s*$/i;
const LEADING_BLANK_LINES = /^(?:[ \t]*\r?\n)+/;

export interface UnwrapAnswerOptions {
  /** Keep the indentation of the first line. Default `false`: the result is trimmed at both ends. `true` is for an EXCERPT (consecutive
   *  lines out of a larger text), where the indentation of the first line is content: blank lines in front and whitespace behind are
   *  removed, the indentation of the first non-blank line stays. */
  keepIndent?: boolean | undefined;
}

/** What a model answer contained besides the thing asked for: thinking blocks out, one surrounding Markdown fence out. Nothing more —
 *  a text that does not parse afterwards is a failure of the model, not something to repair here.
 *
 *  - `<think>…</think>` blocks are removed ({@link stripThinkBlocks}, defaults: pairs only).
 *  - If what is left is ONE fence from the first line to the last (` ```json … ``` `, any or no language tag, CRLF allowed, the closing
 *    fence may follow the text directly, whitespace behind it is fine), the inside is the result. An unclosed fence, text behind the
 *    closing fence, a fence in the middle and (with `keepIndent`) an INDENTED fence are no wrapper: the text comes back as it is.
 *  - Default: trimmed at both ends. `keepIndent: true`: see {@link UnwrapAnswerOptions.keepIndent}.
 *
 *  Origin: json-editor `src/core/repair/prompt.ts`: `extractDocument` is `unwrapAnswer(answer)`, `extractExcerpt` is
 *  `unwrapAnswer(answer, { keepIndent: true })` (Welle 27, part 4). Other copies of "unwrap the answer" exist in vault-crews
 *  (`extractText`), deck-core (`unwrapFence`) and ghostline (`stripWrappers`); they ask slightly different questions and are not
 *  switched (Cockpit task). Linear in the answer: json-editor measured the expressions with many unclosed `<think>`, a fence with
 *  many blank lines that never closes, and the keep-indent paths (tests here). */
export function unwrapAnswer(answer: string, opts: UnwrapAnswerOptions = {}): string {
  const bare = stripThinkBlocks(answer);
  if (opts.keepIndent === true) {
    const text = bare.replace(LEADING_BLANK_LINES, "").trimEnd();
    const fenced = FENCED.exec(text);
    return (fenced ? (fenced[1] ?? "") : text).replace(LEADING_BLANK_LINES, "").trimEnd();
  }
  const text = bare.trim();
  const fenced = FENCED.exec(text);
  return (fenced ? (fenced[1] ?? "") : text).trim();
}
