// vendored from code-kit@0.73.0, src/ts/pure/word-diff.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Word-level diff with offsets — the question `diff.ts` cannot answer, because a paragraph is one line there.
 *
 *  Origin: born here for Diachronic (a Markdown review plugin), no ancestor in any repo. Measured 2026-10-18 and again
 *  2026-10-21: `diffLines` (`diff.ts`) compares `\n`-split lines and is typed on strings, so a correction in a 252-character
 *  paragraph is one hunk and a token list cannot be fed to it (a white-space token holding `\n` would break its `split`);
 *  `diffReplaceSpan` (`replace-span.ts`) returns exactly one span and trims by character, which can cut inside a word. What is
 *  taken over is the pattern, not code: the flat `(n+1)×(m+1)` LCS field with the `?? 0` edge of `diff.ts` (no `!` under
 *  `--noUncheckedIndexedAccess`), and the cell cap of neurovim's `LCS_CELL_LIMIT` (`core/utils/diff.ts`), here counted in
 *  tokens.
 *
 *  What is fixed here, and why:
 *
 *  1. **Tokens.** A run of letters, marks and digits (`\p{L}\p{M}\p{N}`, so "Grüße" is one word) · a run of white space ·
 *     any other single code point (a comma, a bracket, an emoji). A correction hits the word, not its neighbours.
 *  2. **Common ends first, prefix before suffix.** The shared prefix is trimmed, then the shared suffix of what is left. That
 *     order makes an insertion unambiguous: `a c` → `a b c` is "insert `b ` at 2", not "insert ` b` at 1".
 *  3. **LCS over the middle on token text, delete before insert on a tie** (as `diffLines`). A change is a maximal run of
 *     tokens that do not match.
 *  4. **Neighbouring changes are merged** when the unchanged gap between them is at most `mergeGapTokens` tokens (default 1)
 *     and none of them is a word — so `das ist` → `dies war` is one change, not two cards joined by a space, while two
 *     changes with a word between them stay two.
 *  5. **A cell cap.** Above `maxCells` the LCS is skipped: one change covers the trimmed middle and `exact` is false, so the
 *     caller can say so ("long text, coarse comparison"). Trimming the ends is linear and always runs; a text that differs
 *     only at its ends is `exact` whatever the cap.
 *
 *  Offsets are UTF-16 code units, the unit CodeMirror and `replace-span.ts` use. A pure insertion has `oldStart === oldEnd`, a
 *  pure deletion `newStart === newEnd`. {@link diffTokens} takes tokens the caller built (a Markdown link as one token, say) —
 *  `critic-compare.ts` does that. Pure: no I/O, no clock. */

export type WordTokenKind = "word" | "space" | "punct";
export interface WordToken { text: string; start: number; end: number; kind: WordTokenKind }

export interface WordChange { oldStart: number; oldEnd: number; newStart: number; newEnd: number }
export interface DiffWordsOptions {
  /** Merge two changes when the unchanged gap between them has at most this many tokens
   *  and none of them is a word. Default 1 (one space or one punctuation mark). */
  mergeGapTokens?: number;
  /** Above (oldTokens+1)*(newTokens+1) cells the LCS is skipped: one change covers the
   *  trimmed middle and `exact` is false. Default 4_000_000. */
  maxCells?: number;
}
export interface DiffWordsResult { changes: WordChange[]; exact: boolean }

export type DiffSegmentKind = "same" | "del" | "ins";
export interface DiffSegment { kind: DiffSegmentKind; text: string }

const DEFAULT_MERGE_GAP = 1;
const DEFAULT_MAX_CELLS = 4_000_000;

// One global regex, `u` flag: `[\s\S]` then matches a whole code point (a surrogate pair stays together).
const TOKEN_RE = /[\p{L}\p{M}\p{N}]+|\s+|[\s\S]/gu;
const WORD_RE = /^[\p{L}\p{M}\p{N}]/u;
const SPACE_RE = /^\s/;

export function tokenizeWords(text: string): WordToken[] {
  const out: WordToken[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const t = m[0];
    const start = m.index;
    const kind: WordTokenKind = WORD_RE.test(t) ? "word" : SPACE_RE.test(t) ? "space" : "punct";
    out.push({ text: t, start, end: start + t.length, kind });
  }
  return out;
}

/** A change in token indices, half-open on both sides. */
interface TokenRun { as: number; ae: number; bs: number; be: number }

function lcsRuns(a: readonly WordToken[], b: readonly WordToken[], lo: number, loB: number, n: number, m: number): TokenRun[] {
  // lcs(i,j) = length of the LCS of a[lo+i..lo+n) and b[loB+j..loB+m). Flat field with a zero edge, as in diff.ts.
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  const at = (i: number, j: number): number => lcs[i * w + j] ?? 0;
  const same = (i: number, j: number): boolean => a[lo + i]?.text === b[loB + j]?.text;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = same(i, j) ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const runs: TokenRun[] = [];
  let open: TokenRun | null = null;
  const close = (): void => { if (open) { runs.push(open); open = null; } };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && same(i, j)) { close(); i++; j++; continue; }
    if (!open) open = { as: lo + i, ae: lo + i, bs: loB + j, be: loB + j };
    // Delete before insert on a tie, as diffLines does.
    if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) { i++; open.ae = lo + i; }
    else { j++; open.be = loB + j; }
  }
  close();
  return runs;
}

function mergeRuns(runs: readonly TokenRun[], a: readonly WordToken[], maxGap: number): TokenRun[] {
  const out: TokenRun[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && r.as - prev.ae <= maxGap && a.slice(prev.ae, r.as).every((t) => t.kind !== "word")) {
      prev.ae = r.ae;
      prev.be = r.be;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Offset in `tokens` of the boundary before token `i` (the end of the text when `i` is past the last one). */
function boundary(tokens: readonly WordToken[], i: number): number {
  const t = tokens[i];
  if (t) return t.start;
  const last = tokens[tokens.length - 1];
  return last ? last.end : 0;
}

/** Diff over tokens the caller built. Tokens must be in order and not overlap; `start`/`end` are the offsets in the text the
 *  changes refer to. {@link diffWords} is this over {@link tokenizeWords}. */
export function diffTokens(a: readonly WordToken[], b: readonly WordToken[], opts: DiffWordsOptions = {}): DiffWordsResult {
  const maxGap = opts.mergeGapTokens ?? DEFAULT_MERGE_GAP;
  const maxCells = opts.maxCells ?? DEFAULT_MAX_CELLS;

  let pre = 0;
  const minLen = Math.min(a.length, b.length);
  while (pre < minLen && a[pre]?.text === b[pre]?.text) pre++;
  let suf = 0;
  while (suf < minLen - pre && a[a.length - 1 - suf]?.text === b[b.length - 1 - suf]?.text) suf++;

  const n = a.length - pre - suf;
  const m = b.length - pre - suf;
  if (n === 0 && m === 0) return { changes: [], exact: true };

  let runs: TokenRun[];
  let exact = true;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) <= maxCells) {
    runs = n === 0 || m === 0 ? [{ as: pre, ae: pre + n, bs: pre, be: pre + m }] : lcsRuns(a, b, pre, pre, n, m);
  } else {
    runs = [{ as: pre, ae: pre + n, bs: pre, be: pre + m }];
    exact = false;
  }
  const changes = mergeRuns(runs, a, maxGap).map((r) => ({
    oldStart: boundary(a, r.as),
    oldEnd: r.ae > r.as ? (a[r.ae - 1]?.end ?? boundary(a, r.ae)) : boundary(a, r.as),
    newStart: boundary(b, r.bs),
    newEnd: r.be > r.bs ? (b[r.be - 1]?.end ?? boundary(b, r.be)) : boundary(b, r.bs),
  }));
  return { changes, exact };
}

export function diffWords(oldText: string, newText: string, opts: DiffWordsOptions = {}): DiffWordsResult {
  return diffTokens(tokenizeWords(oldText), tokenizeWords(newText), opts);
}

/** `same` / `del` / `ins` pieces in reading order; a replaced span gives its `del` before its `ins`. Empty pieces are left out. */
export function wordDiffSegments(oldText: string, newText: string, changes: readonly WordChange[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  const push = (kind: DiffSegmentKind, text: string): void => { if (text !== "") out.push({ kind, text }); };
  let pos = 0;
  for (const c of changes) {
    push("same", oldText.slice(pos, c.oldStart));
    push("del", oldText.slice(c.oldStart, c.oldEnd));
    push("ins", newText.slice(c.newStart, c.newEnd));
    pos = c.oldEnd;
  }
  push("same", oldText.slice(pos));
  return out;
}

/** The text with the new side taken for change `k` when `take[k]` is not `false` (a missing entry takes it), the old side
 *  otherwise. All taken gives `newText`, none taken `oldText`. */
export function applyWordChanges(oldText: string, newText: string, changes: readonly WordChange[], take: readonly boolean[]): string {
  let out = "";
  let pos = 0;
  changes.forEach((c, k) => {
    out += oldText.slice(pos, c.oldStart);
    out += take[k] === false ? oldText.slice(c.oldStart, c.oldEnd) : newText.slice(c.newStart, c.newEnd);
    pos = c.oldEnd;
  });
  return out + oldText.slice(pos);
}

/** Character-level comparison of two short texts that keeps the shared start and the shared end: `same`, then the replaced
 *  middle as `del` before `ins`, then `same`. Empty pieces are left out; equal texts give one `same` piece, two empty texts none.
 *
 *  This is what a name review wants and {@link wordDiffSegments} does not give: `foo1.md` → `foo2.md` is `foo`, `1`→`2`, `.md`
 *  here, but one replaced word (`foo1` → `foo2`) there. It is linear, has no cell cap, and always `exact` in the sense that
 *  `same` + `del` read back the old text and `same` + `ins` the new one; the price is that a change in two places is one big
 *  replaced middle. For prose use {@link diffWords}.
 *
 *  The cut never falls inside a surrogate pair: two emoji that share their first UTF-16 unit differ as a whole code point.
 *
 *  Origin: `nameDiff` of the `filename-sanitizer` plugin (core/review-view.ts, 2026-11-09), which cut at code units. */
export function affixDiffSegments(oldText: string, newText: string): DiffSegment[] {
  if (oldText === newText) return oldText === "" ? [] : [{ kind: "same", text: oldText }];
  const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
  const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;
  let head = 0;
  while (head < oldText.length && head < newText.length && oldText.charCodeAt(head) === newText.charCodeAt(head)) head++;
  // A shared high surrogate whose low half differs is not shared: step back so the pair stays whole.
  if (head > 0 && isHigh(oldText.charCodeAt(head - 1))) head--;
  let tail = 0;
  while (tail < oldText.length - head && tail < newText.length - head
    && oldText.charCodeAt(oldText.length - 1 - tail) === newText.charCodeAt(newText.length - 1 - tail)) tail++;
  // Same at the other end: a shared low surrogate whose high half differs.
  if (tail > 0 && isLow(oldText.charCodeAt(oldText.length - tail))) tail--;
  const out: DiffSegment[] = [];
  const push = (kind: DiffSegmentKind, text: string): void => { if (text !== "") out.push({ kind, text }); };
  push("same", oldText.slice(0, head));
  push("del", oldText.slice(head, oldText.length - tail));
  push("ins", newText.slice(head, newText.length - tail));
  push("same", oldText.slice(oldText.length - tail));
  return out;
}
