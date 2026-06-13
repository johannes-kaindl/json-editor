import type { JsonValue } from "./types";

/** Open in source mode above either threshold (audit 4.1). */
export const MAX_TREE_BYTES = 1_000_000;
export const MAX_TREE_NODES = 15_000;

export interface RenderBudgetOptions {
  maxBytes?: number;
  maxNodes?: number;
}

/**
 * Count value nodes (each primitive/array/object = 1), short-circuiting as soon
 * as `limit` is passed so the walk is O(limit), never O(document). Returns a
 * count that is `> limit` when the budget is blown (the exact overflow value is
 * not meaningful).
 */
function countNodesCapped(value: JsonValue, limit: number, acc: { n: number }): void {
  acc.n++;
  if (acc.n > limit) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (acc.n > limit) return;
      countNodesCapped(item, limit, acc);
    }
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) {
      if (acc.n > limit) return;
      countNodesCapped(v, limit, acc);
    }
  }
}

/**
 * Whether rendering `value` (originally `data`) as a full tree would likely
 * block the main thread — by raw text size or by node count. Cheap and
 * allocation-light (uses data.length as a byte proxy, like schema.ts).
 */
export function exceedsRenderBudget(
  data: string,
  value: JsonValue,
  opts?: RenderBudgetOptions,
): boolean {
  const maxBytes = opts?.maxBytes ?? MAX_TREE_BYTES;
  const maxNodes = opts?.maxNodes ?? MAX_TREE_NODES;
  if (data.length > maxBytes) return true;
  const acc = { n: 0 };
  countNodesCapped(value, maxNodes, acc);
  return acc.n > maxNodes;
}
