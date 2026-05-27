import { describe, it, expect } from "vitest";
import { findMatches } from "../../src/core/search";

describe("findMatches", () => {
  it("returns empty result for empty query", () => {
    const result = findMatches({ a: 1 }, "");
    expect(result.matches.size).toBe(0);
    expect(result.onPath.size).toBe(0);
    expect(result.counts).toEqual({ keys: 0, values: 0 });
  });

  it("returns empty result for whitespace-only query", () => {
    const result = findMatches({ a: 1 }, "   ");
    expect(result.matches.size).toBe(0);
  });
});
