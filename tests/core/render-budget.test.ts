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

  it("counts nodes with early-exit (does not walk a huge array fully)", () => {
    // 2 million nodes but the guard must return quickly once the cap is passed.
    const huge = Array.from({ length: 2_000_000 }, () => 0);
    const start = performance.now();
    expect(exceedsRenderBudget("(small)", huge)).toBe(true);
    // Generous bound; the point is it does not traverse all 2M nodes.
    expect(performance.now() - start).toBeLessThan(500);
  });
});
