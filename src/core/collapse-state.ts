/**
 * Per-file collapse state for the tree view.
 *
 * Form deliberately mirrors obsidian-kit's `CollapsibleStorage` / `resolveCollapsed`
 * (a storage-agnostic port plus a pure "stored ?? default" rule) so that this case
 * counts as a second instance towards a real kit extraction later. The kit's own
 * module could not be reused: it drives a single flat settings section, whereas
 * this drives a recursive tree of `data-path`-addressed nodes.
 * Form uebernommen aus obsidian-kit/src/obsidian/collapsible.ts, 2026-08-11
 */

/** One file's state. `collapsed` holds the path strings of collapsed containers. */
export interface CollapseEntry {
  collapsed: string[];
  /** Last use, for the LRU cap. Injected by the caller — core stays clock-free. */
  touched: number;
}

/** Keyed by vault-relative file path. */
export type CollapseStates = Record<string, CollapseEntry>;

/** How many files keep a remembered state before the oldest are dropped. */
export const COLLAPSE_STATE_LIMIT = 50;

/**
 * Whether a container should start collapsed. A stored entry wins outright —
 * including an empty list, which legitimately means "the user expanded everything".
 * Only the absence of an entry falls back to the depth default.
 */
export function resolveCollapsed(
  entry: CollapseEntry | undefined,
  pathStr: string,
  depth: number,
  autoCollapseDepth: number | undefined,
): boolean {
  if (entry) return entry.collapsed.includes(pathStr);
  return autoCollapseDepth !== undefined && depth > autoCollapseDepth;
}

/** Replace one file's entry. Immutable — returns a new record. */
export function recordFileState(
  states: CollapseStates,
  filePath: string,
  collapsedPaths: string[],
  now: number,
): CollapseStates {
  return { ...states, [filePath]: { collapsed: [...collapsedPaths], touched: now } };
}

/** Keep the `limit` most recently touched entries. Immutable. */
export function capStates(
  states: CollapseStates,
  limit: number = COLLAPSE_STATE_LIMIT,
): CollapseStates {
  const entries = Object.entries(states);
  if (entries.length <= limit) return { ...states };
  entries.sort((a, b) => b[1].touched - a[1].touched);
  return Object.fromEntries(entries.slice(0, limit));
}
