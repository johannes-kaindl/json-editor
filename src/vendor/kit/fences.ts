// vendored from code-kit@0.74.0, src/ts/pure/fences.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Origin: obsidian-plugins `3d-codeblocks/src/core/shapes/fence.ts` (`fenceFor`), `src/core/shapes/references.ts` (`shapesBlock`,
// here `wrapInFence` with the language as a parameter) and `src/obsidian/panel-accept.ts` (`closesOpenFence`, here on the opening
// line instead of the notes text and a fence object). The scanner (`listFences`/`findFenceAt`) has the shape of obsidian-kit
// `src/pure/fence-scan.ts` (itself from 3d-codeblocks `listFences`), widened by `closed` and `maxIndent`; `normalizeBlockBody` is the
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
  return end - i >= 3 ? { ch, len: end - i, end } : null;
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
    const lang = (/^[ \t]*([^\s`]*)/.exec(info)?.[1] ?? "").toLowerCase();
    if (visit({ lang, openLine: i, closeLine, closed, body: lines.slice(i + 1, closed ? j : lines.length).join("\n") })) return;
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
