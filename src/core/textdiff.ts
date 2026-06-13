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
