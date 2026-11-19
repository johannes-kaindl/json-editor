// vendored from code-kit@0.82.0, src/ts/pure/user-regex.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Origin: obsidian-plugins `obsidian-transmute/src/core/regex/guard.ts` (`assessPattern`) and `compile.ts` (`compileRule`), moved here as the wish of
// mailstone (Capture session `mailstone-34`: the Bibliothek gate refused its own build of the same thing). Moved, not rewritten: the rules of the guard are
// the rules of the original, one by one. transmute keeps its own parts (`effectiveFlags`, `isMultilinePattern`, the `RuleDraft` type) and takes this over later.
//
// ── What differs from the original, and why ─────────────────────────────────────────────────────────
// (a) NO forced `g`. `compileRule` adds `g` because transmute shows every match; a caller that wants the FIRST match (mailstone: a ticket number in a
//     subject) gets the flags it wrote, no more. `firstMatch` does not need `g` either. transmute keeps `effectiveFlags` and calls
//     `compileUserRegex(draft.regex, effectiveFlags(draft.flags), opts)`.
// (b) An EMPTY source is its own answer, `{ ok: false, kind: "empty" }`. The original compiles `""` to `(?:)`, which matches everywhere; a field the user left
//     empty is "no rule", not "a rule that matches nothing in particular". It comes AFTER the flags check (the original's first step stays the first).
// (c) The flags check also refuses what the ENGINE refuses for flags alone: a flag twice (`ii`), `u` together with `v`, and a flag this engine does not
//     know (`v` on an older Electron). The original let those through to `new RegExp` and reported them as `syntax` with the engine's text ("Invalid flags
//     supplied to RegExp constructor"), which sends the user to the pattern when the flags are wrong. Here the kind is `flags` and `message` is the first
//     flag that cannot be added (`ii` → `i`, `uv` → `v`), found by building `new RegExp("", prefix)` for each prefix of the flags.
// (d) Two rules more and a wider first one, decided by the kit master after the measurement below: `nested-quantifier` looks for an unbounded quantifier ANYWHERE in the body of
//     a quantified group (the original: only at its end), `overlapping-alternation` (a branch that is a prefix of another in a quantified group) and `adjacent-quantifiers` (the
//     same atom twice in a row, each unbounded) are new. The new guard refuses everything the original refuses (a test over 270 000 sources compares them) and some more.
// (e) Names: `assessPattern` → `assessRegexRisk`, `RiskRule` → `RegexRiskRule`, `CompileResult` → the `UserRegexError` union plus the ok member.
// Order of the checks, as in the original: flags, then risk (not with `allowRisky`), then syntax. `allowRisky` frees the risk and nothing else.
//
// ── Never throws ────────────────────────────────────────────────────────────────────────────────────
// Every string for `source` and `flags` gives a value: a flag twice, `u` with `v`, an unpaired bracket, a lone `\` at the end (tests, one per kind).
//
// ── `firstMatch` ────────────────────────────────────────────────────────────────────────────────────
// Reads the first match of `re` in `text` from index 0 and leaves `re` as it found it: it works on a copy (`new RegExp(re)`), so `lastIndex` of `re` is not
// read, not written and not used, a `g` or `y` regex gives the same answer on every call. A `y` (sticky) regex therefore means "the match must start at 0".
// This is the idiom of `safe-markdown` (`inside = new RegExp(names.source, names.flags.replace("g", ""))` then `.test`) and of vault-rag `protect_markup.ts`
// (`new RegExp(TOKEN_RE.source).test(text)`) made into one function that returns the text of the match; both are the oracles of the test. Difference to
// vault-rag's: it drops ALL flags (its `TOKEN_RE` has only `g`, so nothing is lost there); a copy keeps `i`, `m`, `s`, `u`, `v`, `d` and `y`.
// `group` returns the text of one group (by number or name) of that match instead of the whole of it (added at the kit master's request: mailstone wants the number of `#(\d+)`).
// `nonEmpty: true` skips empty matches the way a global scan does (after an empty match at i the next try starts one code point later), so `a*` on `"bbb"`
// is `null` and on `"baa"` is `"aa"`. Without `nonEmpty` an empty match is returned as `""` (distinct from `null`, which means no match).
//
// ── The guard is a heuristic, and here is how far it goes ───────────────────────────────────────────
// A static scan of the source for the shapes that make a backtracking engine exponential (or high-degree polynomial). It runs BEFORE the first match, because a running match in
// Obsidian (no Web Worker) or in the UI thread of any host cannot be cancelled. It is deliberately on the conservative side of "a false alarm rejects
// a usable pattern", and it is NOT a proof: the measured list below is the honest statement of what it lets pass and what it refuses.
//
// Measured: scripts/user-regex-lab.mjs (not part of the gate), results pasted from the run on 2026-11-18, Node v24.14.0 (V8 Irregexp, the engine family
// of Obsidian's Electron; this is Node, NOT Obsidian). Each pattern ran in a child process (limit 2 s) on a hostile input of 28 characters and on one of
// 2000 characters; ">2000" is a kill at the limit.
//
// Table (ms; "-" = no flags). before = transmute's guard (tests/lib/transmute-guard.ts, verbatim), now = this one. SLIP = passes but slow, FALSE ALARM = refused but fast.
// "bad" rows are the known catastrophic patterns, "ordinary" rows are patterns a mail tool needs, "more" rows were added to see where the rules end.
//
//   pattern                          flags  before                   now                      28 chars  2000 chars  finding
//   -- bad
//   (a+)+$                           -      nested-quantifier        nested-quantifier        >2000     >2000       
//   (a*)*$                           -      nested-quantifier        nested-quantifier        >2000     >2000       
//   (a|a)*$                          -      quantified-alternation   quantified-alternation   >2000     >2000       
//   (a|aa)+$                         -      ok                       overlapping-alternation  67        >2000       
//   (.*a){12}                        -      ok                       ok                       0.40      20          
//   (\w+\s?)+$                       -      ok                       nested-quantifier        >2000     >2000       
//   ^(([a-z])+.)+[A-Z]([a-z])+$      -      ok                       nested-quantifier        19        >2000       
//   (x+x+)+y                         -      nested-quantifier        nested-quantifier        >2000     >2000       
//   (a|b|ab)*c                       -      ok                       overlapping-alternation  3.60      >2000       
//   ([a-z]+)*=                       -      nested-quantifier        nested-quantifier        >2000     >2000       
//   \d*\d*\d*\d*x                    -      ok                       adjacent-quantifiers     1.58      >2000       
//   (\1?a)+                          -      ok                       ok                       0.02      0.06        
//   -- ordinary
//   #(\d+)                           -      ok                       ok                       0.02      0.05        
//   \[(?:Ticket|Fall) (\d+)\]        -      ok                       ok                       0.03      0.06        
//   ^(?:Re|AW|Fwd):\s*               i      ok                       ok                       0.04      0.06        
//   ^(?:(?:Re|AW|Fwd|WG):\s*)+       i      nested-quantifier        nested-quantifier        0.05      0.08        FALSE ALARM
//   \bTicket[- ]?(\d{4,})\b          i      ok                       ok                       0.06      0.08        
//   \[#(\d+)\]                       -      ok                       ok                       0.02      0.05        
//   (?:Ticket|Fall|Case)\s*#?(\d+)   i      ok                       ok                       0.06      0.11        
//   ^\[?([A-Z]{2,5}-\d+)\]?          -      ok                       ok                       0.03      0.06        
//   \(Ref:\s*([A-Z0-9-]+)\)          -      ok                       ok                       0.03      0.06        
//   (\d+)(?:\.\d+)*                  -      nested-quantifier        nested-quantifier        0.03      0.12        FALSE ALARM
//   Re(\[\d+\])?:\s*                 i      ok                       ok                       0.05      0.08        
//   -- more
//   (\d+,)+$                         -      ok                       nested-quantifier        0.04      5.72        FALSE ALARM
//   (a+b)+$                          -      ok                       nested-quantifier        0.03      4.66        FALSE ALARM
//   (?:\s*-\s*\w)+$                  -      nested-quantifier        nested-quantifier        0.04      4.14        FALSE ALARM
//   \d*\w*x                          -      ok                       ok                       0.06      1891        SLIP
//   (.|\s)*x                         -      ok                       ok                       >2000     >2000       SLIP
//   (a|a?)+$                         -      ok                       ok                       >2000     >2000       SLIP
//   (a|b|ab)+$                       -      ok                       overlapping-alternation  0.06      >2000       
//   .*.*=.*                          -      ok                       adjacent-quantifiers     0.05      1927        
//   (.*)(.*)(.*)(.*)(.*)=            -      ok                       ok                       7.18      >2000       SLIP
//
// Result of the second run (after the three rules the kit master decided on, 2026-11-18): all twelve known catastrophic patterns that were slow are refused now (the first run let
// five of them through: `(\w+\s?)+$`, `(a|aa)+$`, `(a|b|ab)*c`, `^(([a-z])+.)+[A-Z]([a-z])+$`, `\d*\d*\d*\d*x`), and none of the ten ordinary patterns of the first run got a new false alarm.
//
// ── What it still lets through, and what it refuses wrongly ─────────────────────────────────────────
// SLIPS that stay (measured slow, not read by any rule; pinned in the tests): overlapping atoms that are not the same text (`\d*\w*x`, 1.4 s at 2000 characters), an alternation of
// atoms that overlap (`(.|\s)*x`, `(a|a?)+$`: over 2 s at 28), and a row of unbounded groups (`(.*)(.*)(.*)(.*)(.*)=`). The rules read text, not the language of the atoms.
// FALSE ALARMS that stay: a quantified group with an unbounded quantifier in its body is refused whatever else is in it, so `^(?:(?:Re|AW|Fwd|WG):\s*)+` (several reply prefixes) and
// `(\d+)(?:\.\d+)*` (a number with dots) are refused, and since rule 1 looks anywhere in the body also the linear `(\d+,)+$` and `(a+b)+$`. transmute refused the first two before as
// well. The remedy for a caller is `allowRisky: true` AFTER the user has said so (transmute asks the user), never by default.
// THE GUARD IS A HEURISTIC AND THE FIRST LINE, NOT A GUARANTEE. A caller that runs a user regex where a run cannot be cancelled (the UI thread, Obsidian has no Web Worker for it) should
// also bound the length of the text it matches against.
//

/** The shapes the guard looks for: the three of the original and two added here (decision of the kit master 2026-11-18, after the measurement below). */
export type RegexRiskRule =
  | "nested-quantifier"
  | "quantified-alternation"
  | "unbounded-backreference"
  | "overlapping-alternation"
  | "adjacent-quantifiers";

/** Opening parentheses that are not escaped, with the text between them and the matching close. A character class is NOT understood (`[(]` counts). */
function unescapedGroups(source: string): { start: number; body: string; end: number }[] {
  const out: { start: number; body: string; end: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "(") stack.push(i);
    else if (ch === ")") {
      const start = stack.pop();
      if (start !== undefined) out.push({ start, body: source.slice(start + 1, i), end: i });
    }
  }
  return out;
}

const QUANTIFIER = /^[*+]|^\{\d*,\d*\}|^\{\d+,\}/;

/** Does the body of a group itself end on an unbounded quantifier? (The rule of the original.) */
function bodyEndsUnbounded(body: string): boolean {
  const stripped = body.replace(/\\./g, "");
  return /[*+]$/.test(stripped) || /\{\d+,\}$/.test(stripped);
}

/** Index of the `]` that closes the class opened at `open` (`s.length` when it never closes). In JavaScript a `]` right after `[` or `[^` closes: `[]` is empty. */
function classEnd(s: string, open: number): number {
  for (let i = open + 1; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === "]") return i;
  }
  return s.length;
}

/** The text without its escapes and without its character classes: what is left are the operators and the literals. */
function operatorsOf(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") i++;
    else if (ch === "[") i = classEnd(body, i);
    else out += ch;
  }
  return out;
}

/** Rule 1, widened (added here): an unbounded quantifier ANYWHERE in the body, not only at its end (star height 2, `(\w+\s?)+$`, `^(([a-z])+.)+[A-Z]`). */
function bodyHasUnbounded(body: string): boolean {
  return /[*+]|\{\d+,\}/.test(operatorsOf(body));
}

function branchesOverlap(body: string): boolean {
  const stripped = body.replace(/\\./g, " ");
  if (!stripped.includes("|")) return false;
  const branches = stripped.split("|").map((b) => b.trim());
  return new Set(branches).size < branches.length;
}

/** The branches of a group body: it is split at every `|` that is not escaped. A `|` inside a nested group or a class cuts a piece that holds the `(` or `[` (or the `)` or
 *  `]`) and so is not a simple branch (below), which is all rule 2 needs: those pieces are never compared. */
function topBranches(body: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") i++;
    else if (ch === "|") { out.push(body.slice(from, i)); from = i + 1; }
  }
  out.push(body.slice(from));
  return out;
}

/** A branch made of literals and escapes only (`ab`, `\.`, `\d`): no `. * + ? ( ) [ ] { } ^ $`. Only those are compared by rule 2. (No piece of `topBranches` ends on a lone
 *  backslash: an escaped `|` is not a cut, and a `\)` does not close the group.) */
function isSimpleBranch(branch: string): boolean {
  for (let i = 0; i < branch.length; i++) {
    const ch = branch.charAt(i);
    if (ch === "\\") i++;
    else if (".*+?()[]{}^$".includes(ch)) return false;
  }
  return true;
}

/** Rule 2 (added here): is one simple, non-empty branch a prefix of another (`a|aa`, `a|b|ab`, `foo|foobar`)? After sorting, if a branch is a prefix of any other one it is a
 *  prefix of the one right behind it. A string prefix of a well-formed branch is a prefix of its tokens, because the tokens are read from the left. */
function branchPrefixesOverlap(body: string): boolean {
  let inner = body;
  if (inner.startsWith("?")) {
    // `(?:…)`, `(?<name>…)`, `(?i:…)` are groups with a body; `(?=…)`, `(?!…)`, `(?<=…)`, `(?<!…)` are not alternations of the text, so they are left alone.
    const prefix = /^\?(?::|<[^=!>][^>]*>|[a-z-]+:)/.exec(inner);
    if (prefix === null) return false;
    inner = inner.slice(prefix[0].length);
  }
  const simple = topBranches(inner).filter((b) => b !== "" && isSimpleBranch(b)).sort();
  return simple.some((branch, i) => i > 0 && branch.startsWith(simple[i - 1] ?? "\u0000"));
}

// One atom, as far as rule 3 needs it: an escape (with the long forms `\p{…}`, `\u{…}`, `\k<…>` whole; the length of the name is capped, so the scan stays linear),
// a character class, or any single other character. The unbounded quantifiers `*`, `+`, `{n,}` with an optional lazy `?`.
const ESCAPE = /\\(?:[pP]\{[^}]{0,64}\}|u\{[^}]{0,64}\}|k<[^>]{0,64}>|[\s\S]?)/y;
const UNBOUNDED = /(?:[*+]|\{\d+,\})\??/y;

/** Rule 3 (added here): the same atom twice or more IN A ROW, each with an unbounded quantifier (`\d*\d*`, `.*.*`, `[a-z]+[a-z]*`). Anything between them (an atom, a paren,
 *  a `|`, an anchor: each is an atom of its own here, without an unbounded quantifier) ends the row: `.*x.*` is not found. Overlapping atoms that are not the same text (`\d*\w*`) are not found either (a limit, in the header). */
function hasAdjacentQuantifiers(source: string): boolean {
  let prev: string | null = null; // the atom just before, if it carried an unbounded quantifier
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    let end: number;
    if (ch === "\\") {
      ESCAPE.lastIndex = i;
      end = i + (ESCAPE.exec(source)?.[0].length ?? 1);
    } else if (ch === "[") {
      end = Math.min(classEnd(source, i) + 1, source.length);
    } else {
      end = i + 1;
    }
    const atom = source.slice(i, end);
    UNBOUNDED.lastIndex = end;
    const quantifier = UNBOUNDED.exec(source);
    if (quantifier === null) {
      prev = null;
      i = end;
    } else {
      if (prev === atom) return true;
      prev = atom;
      i = end + quantifier[0].length;
    }
  }
  return false;
}

/** The static check of a pattern source for the shapes of catastrophic backtracking. Never throws. A heuristic and a first line, not a guarantee: what it lets
 *  pass is in the header of this file. The rules: `nested-quantifier` (a quantified group with an unbounded quantifier anywhere in its body, `(a+)+`, `(\w+\s?)+`),
 *  `quantified-alternation` (a quantified group with two equal branches, `(a|a)*`), `overlapping-alternation` (a quantified group in which one branch is a prefix of
 *  another, `(a|aa)+`), `unbounded-backreference` (`\1+`, `\2*`, `\3{2,}`) and `adjacent-quantifiers` (the same atom twice in a row, each unbounded, `\d*\d*`). */
export function assessRegexRisk(source: string): { ok: true } | { ok: false; rule: RegexRiskRule } {
  for (const group of unescapedGroups(source)) {
    const after = source.slice(group.end + 1);
    const quantified = QUANTIFIER.test(after);
    if (!quantified) continue;
    if (bodyEndsUnbounded(group.body) || bodyHasUnbounded(group.body)) return { ok: false, rule: "nested-quantifier" };
    if (branchesOverlap(group.body)) return { ok: false, rule: "quantified-alternation" };
    if (branchPrefixesOverlap(group.body)) return { ok: false, rule: "overlapping-alternation" };
  }
  if (/\\[1-9]\s*[*+]|\\[1-9]\{\d+,\}/.test(source)) {
    return { ok: false, rule: "unbounded-backreference" };
  }
  if (hasAdjacentQuantifiers(source)) return { ok: false, rule: "adjacent-quantifiers" };
  return { ok: true };
}

/** Why a user regex was not built. `flags.message` is the first flag that is not allowed (or cannot be added); `syntax.message` is the engine's text. */
export type UserRegexError =
  | { ok: false; kind: "empty" }
  | { ok: false; kind: "flags"; message: string }
  | { ok: false; kind: "risky"; rule: RegexRiskRule }
  | { ok: false; kind: "syntax"; message: string };

const ALLOWED_FLAGS = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);

/** Can this engine build a regex with exactly these flags? (An empty pattern, so only the flags can be at fault.) */
function flagsBuild(flags: string): boolean {
  try {
    new RegExp("", flags);
    return true;
  } catch {
    return false;
  }
}

/** The first flag that is no flag, repeats an earlier one, clashes with one (`u` and `v`) or is unknown to this engine; `null` when all are fine. */
function firstBadFlag(flags: string): string | null {
  let prefix = "";
  for (const flag of flags) {
    prefix += flag;
    if (!ALLOWED_FLAGS.has(flag) || !flagsBuild(prefix)) return flag;
  }
  return null;
}

/** Builds the regex a user wrote: flags first, then (unless `opts.allowRisky === true`) the risk check, then the syntax, as the engine reads it. Never
 *  throws. No flag is added: `compileUserRegex("a")` has the flags `""`. An empty `source` is `{ kind: "empty" }`. */
export function compileUserRegex(source: string, flags = "", opts: { allowRisky?: boolean } = {}): { ok: true; re: RegExp } | UserRegexError {
  const bad = firstBadFlag(flags);
  if (bad !== null) return { ok: false, kind: "flags", message: bad };
  if (source === "") return { ok: false, kind: "empty" };
  // The release applies to the risk veto ONLY. A syntax error or a bad flag is not something to weigh, it cannot run: there is nothing to release.
  if (opts.allowRisky !== true) {
    const risk = assessRegexRisk(source);
    if (!risk.ok) return { ok: false, kind: "risky", rule: risk.rule };
  }
  try {
    return { ok: true, re: new RegExp(source, flags) };
  } catch (err) {
    return { ok: false, kind: "syntax", message: err instanceof Error ? err.message : String(err) };
  }
}

/** What `firstMatch` hands back for a match: the whole match, or the text of one group. A group that did not take part, does not exist or has no such name is `null`;
 *  a group that took part and matched nothing is `""`. A name that no group has (also `constructor` or `__proto__`: `groups` has no prototype) is `null`. */
function pick(m: RegExpExecArray, group: number | string | undefined): string | null {
  if (group === undefined) return m[0];
  const text = typeof group === "number" ? m[group] : m.groups?.[group];
  return typeof text === "string" ? text : null;
}

/** The text of the first match of `re` in `text`, or `null`. Starts at index 0 and works on a copy: `re.lastIndex` is neither read nor changed (so a
 *  regex with `g` or `y` answers the same twice). `nonEmpty: true` skips empty matches (`a*` on `"bbb"` is `null`, on `"baa"` it is `"aa"`) -- the WHOLE match is what
 *  counts as empty. `group` (a number, or the name of a named group) returns the text of that group from the first match (from the first non-empty one with
 *  `nonEmpty`) instead of the whole match: `#(\d+)` with `group: 1` on `"Ticket #4711"` is `"4711"`; a group that did not take part, or that does not exist, is `null`. */
export function firstMatch(text: string, re: RegExp, opts: { nonEmpty?: boolean; group?: number | string } = {}): string | null {
  const copy = new RegExp(re);
  if (opts.nonEmpty !== true) {
    const m = copy.exec(text);
    return m === null ? null : pick(m, opts.group);
  }
  // Empty matches are skipped, so the copy has to move on by itself: a regex without `g` or `y` does not advance, hence `g`. A `y` copy tries index 0 only.
  const sticky = copy.sticky;
  const scan = sticky || copy.global ? copy : new RegExp(re.source, `${re.flags}g`);
  const unicode = scan.flags.includes("u") || scan.flags.includes("v");
  for (let m = scan.exec(text); m !== null; m = scan.exec(text)) {
    if (m[0] !== "") return pick(m, opts.group);
    if (sticky) return null;
    const cp = text.codePointAt(m.index);
    scan.lastIndex = m.index + (unicode && cp !== undefined && cp > 0xffff ? 2 : 1);
  }
  return null;
}
