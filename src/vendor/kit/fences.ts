// vendored from code-kit@0.75.0, src/ts/pure/fences.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Origin: obsidian-plugins `3d-codeblocks/src/core/shapes/fence.ts` (`fenceFor`), `src/core/shapes/references.ts` (`shapesBlock`,
// here `wrapInFence` with the language as a parameter) and `src/obsidian/panel-accept.ts` (`closesOpenFence`, here on the opening
// line instead of the notes text and a fence object). The scanner (`listFences`/`findFenceAt`) has the shape of obsidian-kit
// `src/pure/fence-scan.ts` (itself from 3d-codeblocks `listFences`), widened by `closed` and `maxIndent`; `findNestedFenceAt` is obsidian-kit's
// reader for fences in quotes and under list items (0.75.0); `normalizeBlockBody` is the
// comparison rule measured on 2026-11-14 (cockpit `_SDD/2026-11-14-zeilenende-regeln-zaun-module`).
//
// What the scanner reads: the note as FLAT text. A fence inside a quote, a callout or a list item is not found (its opening line starts
// with `>` or a list marker, not with the fence); a fence indented inside a list item is found only if `maxIndent` allows that indent,
// and its body is then NOT de-indented. Lines end at `\n` and `\r\n`; a lone `\r` is no line break here (the rule of `detectEol` in
// text-window.ts), unlike in safe-markdown.ts and heading-title.ts, which read it as one on purpose.

/** The fence for `body`: three backticks, or one more than the longest run of backticks inside the body, so no body line can close it. */
export function fenceFor(body: string): string {
  let longest = 0;
  for (const m of body.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

/** A fenced block with language `lang`. The body is normalised first: a leading BOM goes, CRLF becomes LF, trailing line breaks go
 *  (a BOM would sit in the first line of the body and break its parsing). Known, accepted normalisation: the way back (block → file)
 *  writes a file without BOM. The fence is measured on the normalised body. */
export function wrapInFence(lang: string, body: string): string {
  const clean = body.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
  const fence = fenceFor(clean);
  return `${fence}${lang}\n${clean}\n${fence}`;
}

/** Would a line of `body` close the fence that `openLineText` opens? CommonMark: same character (backtick or tilde), at least as long,
 *  at most three spaces of indent, nothing but whitespace after it. `false` when `openLineText` is no fence at all. Use it before
 *  writing a body into an existing block: a body that closes the fence early cuts the block in two. */
export function closesFence(openLineText: string, body: string): boolean {
  const open = /^ {0,3}(`{3,}|~{3,})/.exec(openLineText.replace(/^\uFEFF/, ""));
  const marker = open?.[1];
  if (marker === undefined) return false;
  const ch = marker.startsWith("`") ? "`" : "~";
  const close = new RegExp(`^ {0,3}${ch}{${String(marker.length)},}[ \\t]*$`);
  return body.split(/\r?\n/).some((line) => close.test(line));
}

/** One fenced code block as the flat text has it. Lines are 0-based. */
export interface Fence {
  /** First word of the info string, lower-cased; empty for a fence without one. */
  lang: string;
  /** Line of the opening fence. */
  openLine: number;
  /** Line of the closing fence; for a fence that never closes (`closed: false`) the LAST line of the text. */
  closeLine: number;
  /** `false` when no line closes the fence: it then runs to the end of the text and its last line is content, not a fence. The caller
   *  decides what that means (reject, repair, ignore); the scanner does not guess. */
  closed: boolean;
  /** The lines between the fences joined with `\n` (also for a CRLF text); for an unclosed fence all lines to the end of the text. */
  body: string;
}

export interface FenceOptions {
  /** The widest indent a fence line may have, in columns (a tab advances to the next multiple of 4, as in CommonMark). Default 3, which
   *  is CommonMark's rule for the opening and the closing line; `Infinity` allows any indent. A negative number or `NaN` throws a
   *  `RangeError` (a silent fallback would hide a typo). */
  maxIndent?: number;
}

const DEFAULT_MAX_INDENT = 3;

function resolveMaxIndent(opts: FenceOptions | undefined): number {
  const m = opts?.maxIndent ?? DEFAULT_MAX_INDENT;
  if (Number.isNaN(m) || m < 0) throw new RangeError(`maxIndent must be a number from 0 up, got ${String(m)}`);
  return m;
}

interface FenceRun {
  /** `` ` `` or `~`. */
  ch: string;
  /** Length of the run of fence characters. */
  len: number;
  /** Index after the run. */
  end: number;
  /** Columns of indent in front of the run (a tab advances to the next multiple of 4). */
  indent: number;
}

/** The run of three or more fence characters at the start of `line`, after an indent of at most `maxIndent` columns; `null` if there is
 *  none. A leading BOM is ignored. */
function fenceRun(line: string, maxIndent: number): FenceRun | null {
  let i = line.charCodeAt(0) === 0xfeff ? 1 : 0;
  let col = 0;
  for (; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 0x20) col += 1;
    else if (c === 0x09) col += 4 - (col % 4);
    else break;
    if (col > maxIndent) return null;
  }
  const ch = line.charAt(i);
  if (ch !== "`" && ch !== "~") return null;
  let end = i;
  while (line.charAt(end) === ch) end++;
  return end - i >= 3 ? { ch, len: end - i, end, indent: col } : null;
}

/** Does `line` close a fence of character `ch` and length `len`: the same character, at least as long, nothing but blanks after it. */
function closes(line: string, ch: string, len: number, maxIndent: number): boolean {
  const run = fenceRun(line, maxIndent);
  if (run === null || run.ch !== ch || run.len < len) return false;
  for (let i = run.end; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 0x20 && c !== 0x09) return false;
  }
  return true;
}

/** The language of an info string: its first word, lower-cased (a blank in front is a space or a tab). */
function langOf(info: string): string {
  return (/^[ \t]*([^\s`]*)/.exec(info)?.[1] ?? "").toLowerCase();
}

/** The scan; `visit` returns `true` to stop. Linear: a fence swallows the lines up to its closing line (or to the end), so every line is
 *  read once, as an opening line or as a closing candidate. */
function scan(text: string, maxIndent: number, visit: (f: Fence) => boolean): void {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const run = fenceRun(line, maxIndent);
    if (run === null) {
      i += 1;
      continue;
    }
    const info = line.slice(run.end);
    // CommonMark: the info string of a backtick fence holds no backtick (a line like "```svg``` text" is inline code, no fence).
    if (run.ch === "`" && info.includes("`")) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !closes(lines[j] ?? "", run.ch, run.len, maxIndent)) j += 1;
    const closed = j < lines.length;
    const closeLine = closed ? j : lines.length - 1;
    if (visit({ lang: langOf(info), openLine: i, closeLine, closed, body: lines.slice(i + 1, closed ? j : lines.length).join("\n") })) return;
    i = closeLine + 1;
  }
}

/** Every fenced block of `text`, in order. A fence that never closes is returned with `closed: false` and runs to the end. Linear in the
 *  length of the text. */
export function listFences(text: string, opts?: FenceOptions): Fence[] {
  const out: Fence[] = [];
  scan(text, resolveMaxIndent(opts), (f) => { out.push(f); return false; });
  return out;
}

/** The fence that holds the 0-based `line`, its opening and closing line included; `null` when no fence does. Stops scanning at the
 *  first fence that covers or passes `line`. For an unclosed fence the answer holds every line up to the end of the text. */
export function findFenceAt(text: string, line: number, opts?: FenceOptions): Fence | null {
  let found: Fence | null = null;
  scan(text, resolveMaxIndent(opts), (f) => {
    if (f.openLine > line) return true;
    if (line <= f.closeLine) { found = f; return true; }
    return false;
  });
  return found;
}

// ── Fences the flat scanner does not see ───────────────────────────────────────────────────────────────────────────────────────────
//
// Origin: obsidian-kit `src/pure/fence-scan.ts` `findNestedFenceAt` (there from the Opus review A3 of 2026-11-04: `insertAtCursor` put a new block into
// the middle of the fence of a callout). A fence in a quote or callout (`> ```js`) and a fence indented under a list item are none for `listFences`.
// This reader answers one question, "does the line lie in such a fence?", and returns the same `Fence`. It does not serve for writing: the body has
// no quote signs and no de-indent, there is no fingerprint to check.
//
// Differences from the original, each with a case in `tests/fences-nested.test.ts` (D1 to D5): the original counts indent with blanks only, this one by
// the column rule of `fenceRun` (a tab advances to the next multiple of 4), so (D1) a tab in front of the info string no longer ends it empty, (D2) a
// fence indented with a tab under a list item is found, (D3) so is one behind `>` plus a tab, (D4) a closing line indented with a tab closes, (D5) a
// list item indented with a tab is one. One more is a choice for the parameter the original lacks: the indent from which a fence counts as nested is
// `maxIndent + 1` (4 by default, as in the original), so what the flat scanner does not see at its width this reader does, without a gap.
// What stays as in the original: a line that starts with other whitespace (a no-break space) counts those characters as indent where it looks for the
// list item above, and the fence in a quote has any indent.

const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?: |$)/;

interface QuoteRow {
  /** How many `>` signs (nested quotes included) stand in front. */
  depth: number;
  /** The line without them. */
  rest: string;
}

/** Take the quote signs (` {0,3}> ?`, repeated) off the front. */
function stripQuote(line: string): QuoteRow {
  let pos = 0;
  let depth = 0;
  for (;;) {
    let p = pos;
    while (p < line.length && p - pos < 3 && line.charCodeAt(p) === 0x20) p += 1;
    if (line.charCodeAt(p) !== 0x3e) break;
    p += 1;
    if (line.charCodeAt(p) === 0x20) p += 1;
    pos = p;
    depth += 1;
  }
  return { depth, rest: depth === 0 ? line : line.slice(pos) };
}

/** Columns of leading whitespace the way `trimStart` reads whitespace (a tab to the next multiple of 4, any other whitespace character as one). */
function leadingColumns(s: string): number {
  let col = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x20) col += 1;
    else if (c === 0x09) col += 4 - (col % 4);
    else if (s.charAt(i).trim() === "") col += 1;
    else break;
  }
  return col;
}

/** The fence in a quote, a callout or under a list item (indent over `maxIndent`) that holds the 0-based `line`, its opening and closing line
 *  included; `null` when none does. Fences `listFences` finds with the same `opts`, and the lines inside them (an example in a Markdown fence),
 *  do not count here. A fence with no closing line ends with its quote (the first line with fewer quote signs) or with the text and has
 *  `closed: false`. `body` holds the lines without their quote signs. Linear in the length of the text (the list item above a line is looked
 *  up on a stack of the lines before it, not by walking back). */
export function findNestedFenceAt(text: string, line: number, opts?: FenceOptions): Fence | null {
  const maxIndent = resolveMaxIndent(opts);
  const lines = text.split(/\r?\n/);
  const flat = listFences(text, opts);
  const rows = lines.map((l) => stripQuote(l.charCodeAt(0) === 0xfeff ? l.slice(1) : l));
  // The nearest line above with less indent than a fence line: the stack holds, bottom to top, strictly growing indents of the lines read so far.
  const stackIndent: number[] = [];
  const stackItem: boolean[] = [];
  let pushed = 0;
  const underListItem = (index: number, indent: number): boolean => {
    for (; pushed < index; pushed++) {
      const r = rows[pushed]?.rest ?? "";
      if (r.trim() === "") continue;
      const own = leadingColumns(r);
      while (stackIndent.length > 0 && (stackIndent[stackIndent.length - 1] ?? 0) >= own) { stackIndent.pop(); stackItem.pop(); }
      stackIndent.push(own);
      stackItem.push(LIST_ITEM.test(r));
    }
    let lo = 0;
    let hi = stackIndent.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((stackIndent[mid] ?? 0) < indent) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && stackItem[lo - 1] === true;
  };
  let f = 0;
  let i = 0;
  while (i < lines.length && i <= line) {
    while (f < flat.length && (flat[f]?.closeLine ?? 0) < i) f += 1;
    const fl = flat[f];
    if (fl !== undefined && i >= fl.openLine) { i = fl.closeLine + 1; continue; }
    const row = rows[i];
    const run = row ? fenceRun(row.rest, Infinity) : null;
    if (!row || run === null) { i += 1; continue; }
    // Under a quote any indent counts; otherwise only an indent the flat scanner did not take, and only under a list item.
    const nested = row.depth > 0 || (run.indent > maxIndent && underListItem(i, run.indent));
    const info = row.rest.slice(run.end);
    if (!nested || (run.ch === "`" && info.includes("`"))) { i += 1; continue; }
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      const r = rows[j];
      if (!r || r.depth < row.depth) break; // the quote is over
      if (closes(r.rest, run.ch, run.len, Infinity)) { closed = true; break; }
      j += 1;
    }
    const closeLine = closed ? j : j - 1;
    if (line >= i && line <= closeLine) {
      return { lang: langOf(info), openLine: i, closeLine, closed, body: rows.slice(i + 1, closed ? closeLine : closeLine + 1).map((r) => r.rest).join("\n") };
    }
    i = closeLine + 1;
  }
  return null;
}

/** The rule for COMPARING a block body with a text that should hold the same (the other half of `wrapInFence`, which WRITES): a leading
 *  BOM goes, CRLF becomes LF, exactly one trailing line break goes, then a single `\r` at the end goes (the rest of a `\r\n` whose `\n`
 *  was cut away with the line). Kept as content on purpose: blanks at the end of a line, a second trailing empty line (a blank line at
 *  the end of a block is a change), a `\r` in the middle of a line. Measured against six variants in the cockpit
 *  `_SDD/2026-11-14-zeilenende-regeln-zaun-module`; a consumer that switches to it changes its behaviour for bodies with a BOM, two
 *  trailing empty lines or blanks at the end (CORE-META-21). */
export function normalizeBlockBody(text: string): string {
  let s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  s = s.replace(/\r\n/g, "\n");
  if (s.endsWith("\n")) s = s.slice(0, -1);
  if (s.endsWith("\r")) s = s.slice(0, -1);
  return s;
}
