import { describe, expect, it } from "vitest";
import { PATH_COLLECT_LIMIT, collectPaths } from "../../src/core/paths";

describe("collectPaths", () => {
  it("returns nothing for a primitive root", () => {
    expect(collectPaths(42)).toEqual({ paths: [], truncated: false });
  });

  it("collects object keys in document order", () => {
    expect(collectPaths({ b: 1, a: 2 }).paths).toEqual(["b", "a"]);
  });

  it("collects nested paths depth-first", () => {
    expect(collectPaths({ a: { b: 1 }, c: 2 }).paths).toEqual(["a", "a.b", "c"]);
  });

  it("collects array indices", () => {
    expect(collectPaths({ xs: [1, 2] }).paths).toEqual(["xs", "xs[0]", "xs[1]"]);
  });

  it("stops at the limit and reports the truncation", () => {
    const big = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, i]));
    const r = collectPaths(big, 4);
    expect(r.paths.length).toBe(4);
    expect(r.truncated).toBe(true);
  });

  it("exposes the documented default limit", () => {
    expect(PATH_COLLECT_LIMIT).toBe(5000);
  });
});
