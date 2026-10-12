import { describe, expect, it } from "vitest";
import { MAX_TREE_NODES, exceedsRenderBudget } from "../../src/core/render-budget";

// Audit 4.1: renderTree builds the whole tree eagerly (collapsed subtrees too),
// so a multi-MB / many-node file freezes the main thread on open. A cheap guard
// decides up front whether to open in source mode instead. The node count must
// short-circuit so the guard itself is O(threshold), never O(filesize).

describe("exceedsRenderBudget", () => {
  it("flags a document whose text exceeds the byte cap (even if trivially shaped)", () => {
    const big = `"${"x".repeat(1_000_001)}"`;
    expect(exceedsRenderBudget(big, "x".repeat(1_000_001))).toBe(true);
  });

  it("flags a value with more nodes than the node cap", () => {
    const arr = Array.from({ length: MAX_TREE_NODES + 5 }, (_, i) => i);
    expect(exceedsRenderBudget("(small text)", arr)).toBe(true);
  });

  it("does not flag a small, shallow document", () => {
    expect(exceedsRenderBudget('{"a":1,"b":[true,null]}', { a: 1, b: [true, null] })).toBe(false);
  });

  it("respects custom thresholds", () => {
    expect(exceedsRenderBudget("ab", [1, 2, 3], { maxNodes: 2 })).toBe(true);
    expect(exceedsRenderBudget("x".repeat(50), 0, { maxBytes: 10 })).toBe(true);
  });

  it("counts nodes with early-exit (the walk stops at the limit, not at the end of the document)", () => {
    // 2 million nodes, but the guard must stop shortly after `maxNodes`. Counted, not timed: every element read
    // goes through the proxy, so the number of reads is the number of nodes the walk visited.
    let gelesen = 0;
    const huge = new Proxy(
      Array.from({ length: 2_000_000 }, () => 0),
      {
        get(target, key, receiver) {
          if (typeof key === "string" && /^\d+$/.test(key)) gelesen++;
          return Reflect.get(target, key, receiver) as unknown;
        },
      },
    );
    expect(exceedsRenderBudget("(small)", huge)).toBe(true);
    expect(gelesen).toBeLessThanOrEqual(MAX_TREE_NODES + 1);
  });
});
