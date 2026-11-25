// vendored from code-kit@0.91.1, src/ts/pure/fences.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Origin: obsidian-plugins `3d-codeblocks/src/core/shapes/fence.ts` (`fenceFor`), `src/core/shapes/references.ts` (`shapesBlock`,
// here `wrapInFence` with the language as a parameter) and `src/obsidian/panel-accept.ts` (`closesOpenFence`, here on the opening
// line instead of the notes text and a fence object). The scanner (`listFences`/`findFenceAt`) has the shape of obsidian-kit
// `src/pure/fence-scan.ts` (itself from 3d-codeblocks `listFences`), widened by `closed` and `maxIndent`; `findNestedFenceAt` is obsidian-kit's
// reader for fences in quotes and under list items (0.75.0); `normalizeBlockBody` is the
// comparison rule measured on 2026-11-14 (cockpit `_SDD/2026-11-14-zeilenende-regeln-zaun-module`).
//
// What the readers see (since 0.78.0, one basis for all three): a fence that starts a line is FLAT (indent up to `maxIndent`, body as written); a fence
// indented further under a list item, or behind `>` signs, is NESTED (`findNestedFenceAt`, `countFences`); and a fence that opens on the line of a LIST
// MARKER (`- ```js`, `1. ~~~`, `- - ```js`, `> - ```js`, `- > ```js`) is read by its containers, the way CommonMark and so Obsidian render it: begin, language,
// body without the indent of the item (and without quote signs), closing line, `closed`. Without a quote in front it is FLAT (`listFences`, `findFenceAt`),
// behind a quote it is NESTED. Lines end at `\n` and `\r\n`; a lone `\r` is no line break here (the rule of `detectEol` in text-window.ts), unlike in
// safe-markdown.ts and heading-title.ts, which read it as one on purpose.
//
// Why one basis (decision 2026-11-18, Welle 36 k9e3). Before 0.78.0 the flat scan, the nested scan and `countFences` ignored list markers: the closing line of
// a fence on a marker line (`  ```` ` under the item) was read as the OPENING of an unclosed fence without info string that hid what followed. A switch on
// the nested reader did not help (the flat scan makes the wrong fence first), so the fix is one reader that knows containers: `parseContainers` (the prefix of
// an opening line), `followContainers` and `readItemFence` (the lines after it) read the new forms, `createContext` keeps what the scans must know about the
// lines they pass (the open list items, whether the line before is paragraph text), and BOTH scans use them: `scan` (flat family, `listFences`) and
// `scanNested` (nested family, `findNestedFenceAt`, `countFences`). The old forms keep their rules byte for byte, only the new reader is added: the flat scan
// stays independent of the nested scan (an old-form fence under an item must not hide a flat fence behind it), so the flat family cannot be one pass with the
// nested one. The differential `tests/fences-list-item.test.ts` holds the 0.77.0 file as oracle.
//
// Where an old form ends (Welle 37, the one change of an old form since 0.78.0). A fence that opens INSIDE a list item (flat, indent up to `maxIndent`, or nested,
// indented over it; at least the item's content column in, at most three columns beyond it, else it is indented code) ends where the item ends: at the first
// non-blank line with less indent than the content column (`endAtItem`; the blank lines in front of it belong to the fence), `closed: false`, whether that line is
// a closing line or not. Before, such a fence ran to the end of the text, or to a closing line OUTSIDE the item, and that line was no longer read as the opening of
// the fence it is in CommonMark. The item comes from the context of the flat scan (`ctx.enclosing`), which hands its answer to the nested scan (`flatScan`), so both
// cut at the same line. Not cut, as before: a fence behind a quote sign whose item stands in front of the quote (`- a`, then `  > ```js`, then `> y`), and a fence
// inside an old-form fence under an item (`blockedUntil`: the context has not read those lines). `tests/fences-item-end.test.ts` holds the differential against
// the 0.87.0 file and both reference parsers.
//
// Where a fence on a marker line is NOT seen, as CommonMark has it: an empty item (`-` alone), content of five blanks and more after the marker (indented code),
// four columns of indent that no open item holds (code), an ordered item that does not start with 1 right after paragraph text, an empty item right after
// paragraph text, more than 100 containers on the line, inside another fence (an example in a Markdown fence). An unclosed fence ends where the item ends (the first
// non-blank line with less indent; the blank lines in front of that line belong to it, as in markdown-it), in a quote at the line without enough quote signs.
// `maxIndent` does not change them (the indent is the item's, not a width): it keeps its meaning for the old forms.

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
  const lf = body.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  // the trailing breaks by a walk back from the end and one slice: `replace(/\n+$/, "")` tried the end check from every start of a long run of breaks in the MIDDLE of the text (quadratic:
  // 98 ms at 10 000, 2.4 s at 50 000, measured by the breadth over 3d-codeblocks, 2026-11-19)
  let end = lf.length;
  while (end > 0 && lf.charCodeAt(end - 1) === 10) end--;
  const clean = lf.slice(0, end);
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

// ── Containers: the fence on the line of a list marker ─────────────────────────────────────────────────────────────────────────────
//
// `- ```js`, `1. ~~~`, `- - ```js`, `> - ```js`, `- > ```js`: the fence opens behind one or more containers on its own line. CommonMark reads such a line by
// its containers, not by its first character: the marker plus the blanks after it (one to four) give the item a CONTENT INDENT `w`, and a later line
// belongs to the item (and so to the fence) only if it is indented by `w` columns, or is blank; the body is the line without those columns, the closing
// line is the fence line in the same coordinates (at most three more blanks), and the first non-blank line with less indent ends the item and with it
// the fence (`closed: false`; no lazy continuation for the content of a fence). A `Container` is one such step, a quote (`> ` with up to three blanks
// in front) or an item (`w` columns, counted from where the previous container ended).
//
// One reader for everything that opens behind a list marker, used by both scans below: `parseContainers` reads the prefix of an opening line, `readItemFence`
// follows the lines after it. The old forms (a fence that starts the line, or follows only `>` signs, or sits indented under an item) are NOT read here:
// their rules stay as they were (every one of them is pinned by a test, and the differential against 0.77.0 keeps them so).

interface Container {
  /** `true` for a quote, `false` for a list item. */
  quote: boolean;
  /** Item: the content indent in columns, counted from where the previous container ended. Unused for a quote. */
  w: number;
}

/** Take `n` columns of leading blanks off `s` (a tab advances to the next multiple of 4 from absolute column `col`); a tab that reaches past `n` leaves
 *  its rest as blanks. `ok` is `false` when `s` has fewer leading columns than `n`; `rest` is then what is left after all of them (a blank line may be
 *  shorter than the indent). */
function takeColumns(s: string, col: number, n: number): { rest: string; ok: boolean } {
  let c = col;
  let p = 0;
  while (c - col < n) {
    const ch = s.charCodeAt(p);
    if (ch === 0x20) c += 1;
    else if (ch === 0x09) c += 4 - (c % 4);
    else return { rest: s.slice(p), ok: false };
    p += 1;
  }
  return { rest: " ".repeat(c - col - n) + s.slice(p), ok: true };
}

/** The most containers (quote signs and list markers together) read on one line; markdown-it stops nesting at 100 as well. A line with more is no fence line
 *  here: each container costs a copy of the rest of the line, so an unbounded count would make a line of `- - - - …` quadratic. */
const MAX_CONTAINERS = 100;

const LIST_MARKER = /([-*+]|(\d{1,9})[.)])([ \t]|$)/y;
/** What can start a block at the first non-blank character of a line (so the line is not a lazy continuation of a paragraph). */
const STARTS_BLOCK = /^(?:>|#{1,6}(?:[ \t]|$)|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|([-*_])(?:[ \t]*\1){2,}[ \t]*$)/;
/** Does a block start at the first non-blank character of `rest`: a quote sign, a heading, a thematic break, a list marker, or a fence that is one (a backtick
 *  fence with a backtick in its info string is inline code, text). */
function startsBlock(rest: string): boolean {
  const t = rest.trimStart();
  const run = fenceRun(t, 0);
  if (run !== null) return !(run.ch === "`" && t.slice(run.end).includes("`"));
  return STARTS_BLOCK.test(t);
}

const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const HEADING_OR_BREAK = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|([-*_])(?:[ \t]*\1){2,}[ \t]*$)/;

interface Prefix {
  chain: Container[];
  /** Absolute column (in the text after the quotes of the row) at which each list item on this line, up to the first quote, has its content. */
  ends: number[];
  /** A quote stands in front of the fence, in the row or in the prefix. */
  quoted: boolean;
  /** Number of list markers read. */
  items: number;
  /** What follows the prefix. */
  rest: string;
  /** The prefix stopped at something that is no container with a fence behind it (an empty item, an item whose content is indented code, an ordered
   *  item that cannot interrupt a paragraph, an indent of four): `rest` is then not the start of a fence. */
  stopped: boolean;
  /** The last item on the line has no text of its own: it is empty, or its content is indented code. No paragraph starts there. */
  bare: boolean;
  /** `bare` because the item is empty (not because its content is indented code). */
  empty: boolean;
}

/** Read the containers at the start of `rest` (the row without its quote signs, `depth` of them). `enclosing` is the content column of the innermost list
 *  item the line sits in (0 for none), `afterText` says that the line before is paragraph text in the same place: an ordered item can then interrupt only
 *  if it starts with 1 (CommonMark). */
function parseContainers(rest: string, depth: number, enclosing: number, afterText: boolean): Prefix {
  const chain: Container[] = [];
  for (let d = 0; d < depth; d++) chain.push({ quote: true, w: 0 });
  const out: Prefix = { chain, ends: [], quoted: depth > 0, items: 0, rest, stopped: false, bare: false, empty: false };
  if (depth > MAX_CONTAINERS) { out.stopped = true; return out; }
  let s = rest;
  let col = 0;
  let sawQuote = false;
  if (enclosing > 0) {
    const t = takeColumns(s, 0, enclosing);
    if (!t.ok) { out.stopped = true; return out; }
    chain.push({ quote: false, w: enclosing });
    s = t.rest;
    col = enclosing;
  }
  for (;;) {
    let p = 0;
    let c = col;
    while (s.charCodeAt(p) === 0x20 || s.charCodeAt(p) === 0x09) { c += s.charCodeAt(p) === 0x20 ? 1 : 4 - (c % 4); p += 1; }
    if (c - col > 3 || chain.length >= MAX_CONTAINERS) { out.stopped = true; break; }
    if (s.charCodeAt(p) === 0x3e) {
      p += 1;
      c += 1;
      if (s.charCodeAt(p) === 0x20) { p += 1; c += 1; }
      chain.push({ quote: true, w: 0 });
      out.quoted = true;
      sawQuote = true;
      s = s.slice(p);
      col = c;
      continue;
    }
    LIST_MARKER.lastIndex = p;
    const m = LIST_MARKER.exec(s);
    if (m === null) break;
    const mark = m[1] ?? "";
    if (out.items === 0 && afterText && m[2] !== undefined && Number(m[2]) !== 1) { out.stopped = true; break; }
    let q = p + mark.length;
    let cc = c + mark.length;
    let n = 0;
    while (s.charCodeAt(q) === 0x20 || s.charCodeAt(q) === 0x09) { const w = s.charCodeAt(q) === 0x20 ? 1 : 4 - (cc % 4); cc += w; n += w; q += 1; }
    // an empty item cannot interrupt a paragraph (CommonMark): the line is then text
    if (q >= s.length && out.items === 0 && afterText) { out.stopped = true; break; }
    out.items += 1;
    if (q >= s.length || n >= 5) {
      // an empty item, or content that starts with four blanks of indented code: the item exists with content indent marker + 1 blank
      if (!sawQuote) out.ends.push(c + mark.length + 1);
      out.stopped = true;
      out.bare = true;
      out.empty = q >= s.length;
      break;
    }
    chain.push({ quote: false, w: cc - col });
    if (!sawQuote) out.ends.push(cc);
    s = s.slice(q);
    col = cc;
  }
  out.rest = s;
  return out;
}

/** The line `line` seen through the containers of `chain`: what is left of it, or `null` when it does not belong to them (a quote sign missing, a non-blank
 *  line with less indent than an item needs). A blank line stays inside items. */
function followContainers(line: string, chain: readonly Container[]): string | null {
  let s = line;
  let col = 0;
  for (const c of chain) {
    if (c.quote) {
      let p = 0;
      while (p < 3 && s.charCodeAt(p) === 0x20) p += 1;
      if (s.charCodeAt(p) !== 0x3e) return null;
      p += 1;
      if (s.charCodeAt(p) === 0x20) p += 1;
      col += p;
      s = s.slice(p);
    } else {
      const t = takeColumns(s, col, c.w);
      if (!t.ok && s.trim() !== "") return null;
      col += c.w;
      s = t.rest;
    }
  }
  return s;
}

/** The fence that opens behind the containers `open` (read from line `at`), followed over the lines after it. The closing line is a fence line in the
 *  coordinates of the innermost container (at most three blanks, as CommonMark); a line that leaves the containers ends the fence unclosed, and the blank
 *  lines in front of it are part of it (markdown-it does the same). */
function readItemFence(lines: readonly string[], at: number, open: Prefix, run: FenceRun): Fence {
  const body: string[] = [];
  let j = at + 1;
  let closed = false;
  for (; j < lines.length; j++) {
    const r = followContainers(lines[j] ?? "", open.chain);
    if (r === null) break;
    if (closes(r, run.ch, run.len, 3)) { closed = true; break; }
    body.push(r);
  }
  const info = open.rest.slice(run.end);
  return { lang: langOf(info), openLine: at, closeLine: closed ? j : j - 1, closed, body: body.join("\n") };
}

/** What the scans remember about the lines they pass: the list items the current line sits in (the content columns of the open items, growing, one stack per
 *  quote depth: an item that holds a quote stays open while the lines of the quote go by), and whether the line before is paragraph text. Fed with the lines in
 *  order: `plain` with a line that opens no fence, `fenced` with the opening line of one (the lines inside it are not fed). */
function createContext(): {
  enclosing: (depth: number, rest: string, raw: string) => number;
  afterText: () => boolean;
  plain: (rest: string, depth: number, raw: string) => void;
  fenced: (depth: number, rest: string, raw: string, ends?: readonly number[]) => void;
  dedent: (indent: number) => void;
} {
  const stacks: number[][] = [[]];
  let atDepth = 0;
  let items = stacks[0] ?? [];
  let text = false;
  let textItems = 0; // how many items the paragraph text line sat in
  let emptyItem = false; // the line before is an item with nothing in it
  let lazy = false; // the text lines since the quote ended continue the paragraph OF the quote (lazy continuation), they are no paragraph of the outer level
  const sync = (depth: number): void => {
    if (depth === atDepth) return;
    lazy = depth < atDepth && text; // text of a quote paragraph goes on without its `>`; after an empty quote line the text is a paragraph of its own
    text = false; // a quote ends before a list item, whatever its number (markdown-it), and a new quote holds no paragraph yet
    emptyItem = false;
    if (depth > atDepth) stacks[depth] = [];
    else stacks.length = depth + 1;
    atDepth = depth;
    items = stacks[depth] ?? [];
  };
  const indentOf = (rest: string): number => {
    let c = 0;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest.charCodeAt(i);
      if (ch === 0x20) c += 1;
      else if (ch === 0x09) c += 4 - (c % 4);
      else break;
    }
    return c;
  };
  const settle = (rest: string, raw: string): void => {
    if (raw.trim() === "") return;
    // the items in front of the quote signs (`- a` then `  > b`) are judged by the indent of the whole line, also when nothing follows the sign
    if (atDepth > 0) {
      const outer = stacks[0] ?? [];
      const rawIndent = indentOf(raw);
      while (outer.length > 0 && (outer[outer.length - 1] ?? 0) > rawIndent) outer.pop();
    }
    if (rest.trim() === "") return;
    const ind = indentOf(rest);
    let keep = items.length;
    while (keep > 0 && (items[keep - 1] ?? 0) > ind) keep -= 1;
    // a line of plain text right after paragraph text continues the paragraph, however little it is indented (lazy continuation): the items stay open. It
    // is plain text when nothing starts a block in it: no marker, quote sign, fence or heading, or four columns of indent beyond the items that would hold it.
    if ((text || lazy) && keep < items.length && (!startsBlock(rest) || ind - (items[keep - 1] ?? 0) >= 4)) return;
    items.length = keep;
  };
  return {
    enclosing(depth, rest, raw) {
      sync(depth);
      settle(rest, raw);
      return items[items.length - 1] ?? 0;
    },
    // a paragraph the line would continue: the line before is text, and the line is not outside the item that text sat in (then it ends the item, and any
    // ordered item may start there)
    afterText: () => text && items.length >= textItems,
    plain(rest, depth, raw) {
      sync(depth);
      // an empty item ends at a blank line (an item begins with at most one blank line)
      if (emptyItem && rest.trim() === "") items.pop();
      emptyItem = false;
      if (rest.trim() === "" || HEADING_OR_BREAK.test(rest)) { text = false; lazy = false; return; }
      settle(rest, raw);
      // the underline of a setext heading ends the paragraph above (`-` alone included)
      if (text && items.length >= textItems && SETEXT_UNDERLINE.test(rest)) { text = false; return; }
      const inner = items[items.length - 1] ?? 0;
      // four columns in beyond the item, with no paragraph before: indented code, not text (after a paragraph it is part of it)
      if (!text && indentOf(rest) - inner >= 4) return;
      const p = parseContainers(rest, 0, inner, text && items.length >= textItems);
      for (const e of p.ends) items.push(e);
      emptyItem = p.empty;
      if (p.items > 0) lazy = false;
      text = !p.bare && !lazy;
      textItems = items.length;
    },
    // lines the scan skipped inside an old-form fence (it did not feed them): the least indent among them ends every item of the top level that holds more
    dedent(indent) {
      const outer = stacks[0] ?? [];
      while (outer.length > 0 && (outer[outer.length - 1] ?? 0) > indent) outer.pop();
    },
    // a fence is no paragraph text; the items its opening line started (`- ```js`) stay open for the lines after it
    fenced(depth, rest, raw, ends) {
      sync(depth);
      settle(rest, raw);
      text = false;
      lazy = false;
      emptyItem = false;
      if (ends) for (const e of ends) items.push(e);
    },
  };
}

/** The least indent among the non-blank lines `from` to `to` (a quote sign counts as the column it stands at); `Infinity` when there is none. */
function leastIndent(lines: readonly string[], from: number, to: number): number {
  let least = Infinity;
  for (let j = from; j <= to && j < lines.length; j++) {
    const l = lines[j] ?? "";
    if (l.trim() !== "") least = Math.min(least, leadingColumns(l));
  }
  return least;
}

/** The scan for the FLAT fences; `visit` returns `true` to stop. Linear: a fence swallows the lines up to its closing line (or to the end), so every line is
 *  read once, as an opening line or as a closing candidate. Besides the fences that start a line (indent up to `maxIndent`) it reads the ones that open on
 *  the line of a list marker with no quote in front (`- ```js`, `1. ~~~`, `- - ```js`): they are "flat" too, the list is the document's own structure. */
function scan(text: string, maxIndent: number, visit: (f: Fence) => boolean, cols?: Map<number, number>): void {
  const lines = text.split(/\r?\n/);
  const ctx = createContext();
  const rowAt = createRowReader(lines);
  const nested = nestedReader(lines, rowAt, maxIndent);
  let blockedUntil = -1; // lines of an indented fence under a list item (see `nestedReader`): an example there opens no list-marker fence
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const run = fenceRun(line, maxIndent);
    // CommonMark: the info string of a backtick fence holds no backtick (a line like "```svg``` text" is inline code, no fence).
    if (run !== null && !(run.ch === "`" && line.slice(run.end).includes("`"))) {
      const info = line.slice(run.end);
      // the context has not seen the lines inside an old-form fence indented under an item (`blockedUntil`): no item is claimed there
      const w = i > blockedUntil ? ctx.enclosing(0, line, line) : 0;
      cols?.set(i, w);
      const chain = itemChain(run.indent, w, 0);
      let j = i + 1;
      let ended = false;
      while (j < lines.length) {
        const l = lines[j] ?? "";
        if (chain !== null && followContainers(l, chain) === null) { ended = true; break; }
        if (closes(l, run.ch, run.len, maxIndent)) break;
        j += 1;
      }
      const closed = j < lines.length && !ended;
      const f: Fence = { lang: langOf(info), openLine: i, closeLine: closed ? j : j - 1, closed, body: lines.slice(i + 1, j).join("\n") };
      if (visit(f)) return;
      ctx.fenced(0, line, line);
      ctx.dedent(leastIndent(lines, i + 1, f.closeLine));
      i = f.closeLine + 1;
      continue;
    }
    const row = rowAt(i);
    if (row.depth === 0 && i > blockedUntil) {
      const own = fenceRun(row.rest, Infinity);
      if (own !== null && own.indent > maxIndent) {
        const w = ctx.enclosing(0, row.rest, line);
        cols?.set(i, w);
        const n = nested(i, row, own, w);
        if (n !== null) { blockedUntil = n.closeLine; ctx.fenced(0, row.rest, line); ctx.dedent(leastIndent(lines, i + 1, n.closeLine)); }
      }
    }
    if (i > blockedUntil) {
      const open = parseContainers(row.rest, row.depth, ctx.enclosing(row.depth, row.rest, line), ctx.afterText());
      const mrun = open.items > 0 && !open.stopped ? fenceRun(open.rest, 3) : null;
      if (mrun !== null && !(mrun.ch === "`" && open.rest.slice(mrun.end).includes("`"))) {
        const f = readItemFence(lines, i, open, mrun);
        if (!open.quoted) {
          if (visit(f)) return;
          ctx.fenced(0, row.rest, line, open.ends);
        } else {
          // behind a quote: the nested scan reports it; here it only ends the paragraph, opens its items and is skipped
          ctx.fenced(row.depth, row.rest, line, open.ends);
        }
        i = f.closeLine + 1;
        continue;
      }
      const qrun = row.depth > 0 ? fenceRun(row.rest, Infinity) : null;
      const qw = qrun === null ? 0 : ctx.enclosing(row.depth, row.rest, line);
      if (qrun !== null) cols?.set(i, qw);
      const q = qrun === null ? null : nested(i, row, qrun, qw);
      if (q !== null) {
        // a fence in a quote (the old nested form): skipped, its lines are no paragraph text of the quote
        ctx.fenced(row.depth, row.rest, line);
        ctx.dedent(leastIndent(lines, i + 1, q.closeLine));
        i = q.closeLine + 1;
        continue;
      }
      ctx.plain(row.rest, row.depth, line);
    }
    i += 1;
  }
}

/** Every flat fenced block of `text`, in order: the ones that start a line (indent up to `maxIndent`) and, since 0.78.0, the ones that open on the line of a
 *  list marker with no quote in front (`- ```js`, `1. ~~~`; their body is without the indent of the item, see the header). A fence that never closes is
 *  returned with `closed: false` and runs to the end (a fence on a marker line: to the end of its item). Linear in the length of the text. */
export function listFences(text: string, opts?: FenceOptions): Fence[] {
  return flatScan(text, resolveMaxIndent(opts)).flat;
}

/** The flat fences and, for the nested reader that runs after them, the content column of the list item that each candidate line sits in (the scan's context
 *  knows it; the nested reader must cut an old-form fence at the same place, so it is handed the answer, not asked to find it again). */
function flatScan(text: string, maxIndent: number): { flat: Fence[]; cols: Map<number, number> } {
  const flat: Fence[] = [];
  const cols = new Map<number, number>();
  scan(text, maxIndent, (f) => { flat.push(f); return false; }, cols);
  return { flat, cols };
}

/** The flat fence that holds the 0-based `line`, its opening and closing line included (the fences of {@link listFences}); `null` when no fence does. Stops
 *  scanning at the first fence that covers or passes `line`. For an unclosed fence the answer holds every line up to the end of the text (of its item, for a
 *  fence on a marker line). */
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
// no quote signs and no de-indent, there is no fingerprint to check. (A fence behind a list marker AND a quote, `> - ```js` or `- > ```js`, is read by
// the container reader above and has the body without the quote signs and without the item's indent.)
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

/** The rows of `lines` (a leading BOM goes), made when asked for and kept. */
function createRowReader(lines: readonly string[]): (i: number) => QuoteRow {
  const rows: (QuoteRow | undefined)[] = [];
  return (i) => (rows[i] ??= stripQuote(i === 0 && (lines[0] ?? "").charCodeAt(0) === 0xfeff ? (lines[0] ?? "").slice(1) : (lines[i] ?? "")));
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

/** The containers that a fence opened with `indent` columns in front, inside the list item with content column `w`, stays in (`depth` quote signs, then the item),
 *  or `null` when there is no item to end it (`w` is 0), or when the fence is not read as in it: indented four columns beyond the item it is indented code in
 *  CommonMark, and a fence indented less than the content column is no part of the item. The old forms ran past the end of the item: to the end of the text, or to a
 *  closing line OUTSIDE the item. Now the search for the closing line stops at the first line that leaves these containers (a non-blank line with less indent than
 *  the item, or without the quote signs), whether that line is a closing line or not: the fence is then `closed: false` and ends in front of that line (the
 *  blank lines in front of it belong to the fence, as in markdown-it). `w` is the content column of the item the opening line sits in, as the context of the scan
 *  reads it. */
function itemChain(indent: number, w: number, depth: number): Container[] | null {
  if (w <= 0 || indent < w || indent - w > 3) return null;
  const chain: Container[] = [];
  for (let d = 0; d < depth; d++) chain.push({ quote: true, w: 0 });
  chain.push({ quote: false, w });
  return chain;
}

/** The reader of the OLD nested forms: `(i, row, run, w)` gives the fence that opens on line `i` when `run` (the fence run in `row.rest`) is under a quote, or
 *  indented over `maxIndent` under a list item, else `null`; `w` is the content column of the list item the line sits in (see {@link endAtItem}), 0 for none or
 *  under a quote. Called with growing `i` only (the list item above a line is looked up on a stack of the lines before it, not by walking back, so the cost
 *  stays linear). */
function nestedReader(lines: readonly string[], rowAt: (i: number) => QuoteRow, maxIndent: number): (i: number, row: QuoteRow, run: FenceRun, w: number) => Fence | null {
  // The nearest line above with less indent than a fence line: the stack holds, bottom to top, strictly growing indents of the lines read so far.
  const stackIndent: number[] = [];
  const stackItem: boolean[] = [];
  let pushed = 0;
  const underListItem = (index: number, indent: number): boolean => {
    for (; pushed < index; pushed++) {
      const r = rowAt(pushed).rest;
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
  return (i, row, run, w) => {
    // Under a quote any indent counts; otherwise only an indent the flat scanner did not take, and only under a list item.
    const isNested = row.depth > 0 || (run.indent > maxIndent && underListItem(i, run.indent));
    const info = row.rest.slice(run.end);
    if (!isNested || (run.ch === "`" && info.includes("`"))) return null;
    const chain = itemChain(run.indent, w, row.depth);
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      const r = rowAt(j);
      if (r.depth < row.depth) break; // the quote is over
      if (chain !== null && followContainers(lines[j] ?? "", chain) === null) break; // the item is over
      if (closes(r.rest, run.ch, run.len, Infinity)) { closed = true; break; }
      j += 1;
    }
    const closeLine = closed ? j : j - 1;
    const body: string[] = [];
    for (let k = i + 1; k < (closed ? closeLine : closeLine + 1); k++) body.push(rowAt(k).rest);
    return { lang: langOf(info), openLine: i, closeLine, closed, body: body.join("\n") };
  };
}

/** The nested fences (see {@link findNestedFenceAt}) whose opening line is at or before `limit`, in order, each handed to `visit` (which returns `true` to
 *  stop): the old forms (`nestedReader`) and the ones behind a list marker AND a quote (`parseContainers`). One reader for both questions, "which fence holds
 *  this line" and "how many are there", so they cannot drift apart. Linear in the length of the text up to `limit`. */
function scanNested(lines: string[], flat: readonly Fence[], cols: ReadonlyMap<number, number>, maxIndent: number, limit: number, visit: (f: Fence) => boolean): void {
  const rowAt = createRowReader(lines);
  const nested = nestedReader(lines, rowAt, maxIndent);
  const ctx = createContext();
  let f = 0;
  let i = 0;
  while (i < lines.length && i <= limit) {
    while (f < flat.length && (flat[f]?.closeLine ?? 0) < i) f += 1;
    const fl = flat[f];
    if (fl !== undefined && i >= fl.openLine) { ctx.fenced(0, lines[fl.openLine] ?? "", lines[fl.openLine] ?? ""); i = fl.closeLine + 1; continue; }
    const row = rowAt(i);
    const run = fenceRun(row.rest, Infinity);
    let found: Fence | null = null;
    let ends: readonly number[] = [];
    if (run !== null) {
      found = nested(i, row, run, cols.get(i) ?? 0);
    } else {
      const open = parseContainers(row.rest, row.depth, ctx.enclosing(row.depth, row.rest, lines[i] ?? ""), ctx.afterText());
      const mrun = open.items > 0 && !open.stopped && open.quoted ? fenceRun(open.rest, 3) : null;
      if (mrun !== null && !(mrun.ch === "`" && open.rest.slice(mrun.end).includes("`"))) { found = readItemFence(lines, i, open, mrun); ends = open.ends; }
    }
    if (found === null) { ctx.plain(row.rest, row.depth, lines[i] ?? ""); i += 1; continue; }
    if (visit(found)) return;
    ctx.fenced(row.depth, row.rest, lines[i] ?? "", ends);
    i = found.closeLine + 1;
  }
}


/** The fence in a quote, a callout or under a list item (indent over `maxIndent`) that holds the 0-based `line`, its opening and closing line
 *  included; `null` when none does. Since 0.78.0 also a fence on the line of a list marker that has a quote in front or behind the marker (`> - ```js`,
 *  `- > ```js`, in a callout; a marker with no quote is flat, `listFences` has it). Fences `listFences` finds with the same `opts`, and the lines inside
 *  them (an example in a Markdown fence), do not count here. A fence with no closing line ends with its quote (the first line with fewer quote signs) or with
 *  the text and has `closed: false`. `body` holds the lines without their quote signs (and, on a marker line, without the indent of the item). Linear in the
 *  length of the text (the list item above a line is looked up on a stack of the lines before it, not by walking back). */
export function findNestedFenceAt(text: string, line: number, opts?: FenceOptions): Fence | null {
  const maxIndent = resolveMaxIndent(opts);
  let found: Fence | null = null;
  const { flat, cols } = flatScan(text, maxIndent);
  scanNested(text.split(/\r?\n/), flat, cols, maxIndent, line, (f) => {
    if (line >= f.openLine && line <= f.closeLine) { found = f; return true; }
    return false;
  });
  return found;
}

/** How many fenced blocks of language `lang` the text holds, as Obsidian renders them: the flat ones (`listFences`) AND the ones in a quote, a callout or
 *  under a list item (the forms `findNestedFenceAt` reads), so the number matches what a reader of the note sees (`countFences(md, "mermaid")` is the
 *  number of diagrams). `lang` is compared with the first word of the info string, case-insensitively (`Mermaid` and `MERMAID` count for `mermaid`);
 *  an empty `lang` counts the fences without an info string. A fence inside another fence (an example in a Markdown fence) is part of that fence and
 *  does not count. **An unclosed fence counts** (as CommonMark has it: it runs to the end of the text, or in a quote to the end of the quote, and Obsidian
 *  renders it as a block). Whoever must not count an unclosed one reads `listFences` and `findNestedFenceAt`, which report `closed`.
 *  The same readers as `listFences` and `findNestedFenceAt` (no third one), so they cannot disagree about what a fence is. Linear in the length of the text.
 *  A fence on the line of a list marker (`- ```mermaid`, `1. ~~~js`) counts since 0.78.0 (0.77.0 missed it, and `listFences` read its closing line as an opening one). */
export function countFences(markdown: string, lang: string, opts?: FenceOptions): number {
  const maxIndent = resolveMaxIndent(opts);
  const want = lang.toLowerCase();
  const { flat, cols } = flatScan(markdown, maxIndent);
  let n = 0;
  for (const f of flat) if (f.lang === want) n += 1;
  scanNested(markdown.split(/\r?\n/), flat, cols, maxIndent, Infinity, (f) => { if (f.lang === want) n += 1; return false; });
  return n;
}

/** A fence of {@link listAllFences}: the {@link Fence} plus where it was read. */
export interface ListedFence extends Fence {
  /** `false`: the fence of {@link listFences} (starts a line, or opens on the line of a list marker with no quote in front). `true`: one of the nested forms of
   *  {@link findNestedFenceAt} (behind a quote or callout sign, or indented over `maxIndent` under a list item), whose `body` is without the quote signs.
   *  It is on this type and not on {@link Fence} so that `listFences`, `findFenceAt` and `findNestedFenceAt` answer word for word as before (a test that compares
   *  their result with `toEqual` would turn red on one more property). The quote and indent prefix is not reported: the caller who needs it reads the line
   *  `openLine` of its own text; `nested` tells whether there is one to look for. */
  nested: boolean;
}

/** EVERY fenced block of `text`, flat and nested, in document order (by `openLine`), each once: the fences of {@link listFences} and the ones of
 *  {@link findNestedFenceAt}, which never overlap (the nested reader skips the lines of a flat fence), so the list is their merge, not a union that needs
 *  a de-duplication. The same two readers as {@link countFences} (`listFences` and `scanNested`, no third one): `listAllFences(md).filter(f => f.lang === l)`
 *  has the length of `countFences(md, l)` by construction, and a test holds it against markdown-it. An unclosed fence is in the list with `closed: false`.
 *  A fence inside another fence (an example in a Markdown fence) is part of that fence and not in the list. One pass over the text for each reader: linear,
 *  where asking `findNestedFenceAt` for each line would be quadratic. `opts` are those of `listFences`. */
export function listAllFences(text: string, opts?: FenceOptions): ListedFence[] {
  const maxIndent = resolveMaxIndent(opts);
  const { flat, cols } = flatScan(text, maxIndent);
  const nested: Fence[] = [];
  scanNested(text.split(/\r?\n/), flat, cols, maxIndent, Infinity, (f) => { nested.push(f); return false; });
  const out: ListedFence[] = [];
  let a = 0;
  let b = 0;
  while (a < flat.length || b < nested.length) {
    const x = flat[a];
    const y = nested[b];
    if (x !== undefined && (y === undefined || x.openLine < y.openLine)) { out.push({ ...x, nested: false }); a += 1; }
    else if (y !== undefined) { out.push({ ...y, nested: true }); b += 1; }
    else break; // not reachable: the loop runs while one of the two lists has an entry left
  }
  return out;
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
