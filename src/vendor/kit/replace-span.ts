// vendored from code-kit@0.28.0, src/ts/pure/replace-span.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// uebernommen aus json-editor/src/core/textdiff.ts (3d-codeblocks/src/core/textdiff.ts war dieselbe Funktion, Byte-Kopie bis auf die Stempelzeilen), 2026-10-11
/** The smallest single span that turns one text into another — NOT a line diff (that is `diff.ts`).
 *
 *  Origin: json-editor `diffReplaceSpan`, used there to dispatch a partial CodeMirror change so the
 *  cursor and selection survive an undo or a reformat when they lie outside the changed span; the
 *  same function sat byte-identical in 3d-codeblocks. Code and signature are unchanged.
 *
 *  Why its own module and not part of `diff.ts`: `diff.ts` is the line-based LCS diff with hunks and
 *  selective apply, and three consumers vendor it as one file. This is a different question
 *  (one `{from, to, insert}` for an editor transaction), with a different consumer set (editors, not
 *  review panes), and a consumer of one should not carry the other.
 *
 *  Offsets are UTF-16 code units, the unit CodeMirror and `String.prototype.slice` use. A differing
 *  emoji that shares its first code unit with its neighbour is therefore cut between the two halves of
 *  the surrogate pair; the result still applies exactly (`old.slice(0, from) + insert + old.slice(to)`
 *  equals `next`), and an editor takes such a change as any other. */
export interface ReplaceSpan {
  from: number;
  to: number;
  insert: string;
}

/**
 * Minimal single-span diff between two strings: the shared prefix and suffix
 * are trimmed, leaving the smallest `{from, to, insert}` such that
 * `old.slice(0, from) + insert + old.slice(to) === next`. Used to dispatch a
 * partial CodeMirror change (audit 2.2) so the cursor/selection is preserved
 * when it lies outside the changed span. Pure — no Obsidian/CM imports.
 * Linear in the length of the shorter text.
 */
export function diffReplaceSpan(oldText: string, next: string): ReplaceSpan {
  const minLen = Math.min(oldText.length, next.length);

  let start = 0;
  while (start < minLen && oldText[start] === next[start]) start++;

  let oldEnd = oldText.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return { from: start, to: oldEnd, insert: next.slice(start, newEnd) };
}
