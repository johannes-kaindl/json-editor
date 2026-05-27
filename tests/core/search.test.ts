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

  it("matches a key in a flat object", () => {
    const r = findMatches({ port: 8080, host: "localhost" }, "port");
    expect(r.matches).toEqual(new Set(["port"]));
    expect(r.onPath).toEqual(new Set(["root"]));
    expect(r.counts).toEqual({ keys: 1, values: 0 });
  });

  it("substring-matches a key", () => {
    const r = findMatches({ portName: 1 }, "port");
    expect(r.matches.has("portName")).toBe(true);
  });

  it("case-insensitive key match", () => {
    const r = findMatches({ Port: 1 }, "POR");
    expect(r.matches.has("Port")).toBe(true);
  });

  it("multiple key matches at flat level", () => {
    const r = findMatches({ port: 1, portMap: 2, host: 3 }, "port");
    expect(r.matches.has("port")).toBe(true);
    expect(r.matches.has("portMap")).toBe(true);
    expect(r.counts.keys).toBe(2);
  });
});
