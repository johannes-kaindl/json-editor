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

  it("matches a string value", () => {
    const r = findMatches({ env: "production" }, "prod");
    expect(r.matches).toEqual(new Set(["env"]));
    expect(r.counts.values).toBe(1);
  });

  it("matches a number value", () => {
    const r = findMatches({ port: 8080 }, "808");
    expect(r.matches).toEqual(new Set(["port"]));
    expect(r.counts.values).toBe(1);
  });

  it("matches a boolean value", () => {
    const r = findMatches({ enabled: true }, "tru");
    expect(r.matches).toEqual(new Set(["enabled"]));
  });

  it("matches a null value when searching 'null'", () => {
    const r = findMatches({ x: null }, "null");
    expect(r.matches).toEqual(new Set(["x"]));
  });

  it("matches inside a nested object", () => {
    const r = findMatches({ db: { connection: { port: 5432 } } }, "543");
    expect(r.matches).toEqual(new Set(["db.connection.port"]));
    expect(r.onPath).toEqual(new Set(["root", "db", "db.connection"]));
  });

  it("walks arrays and records ancestor chain", () => {
    const r = findMatches({ users: [{ name: "alice" }, { name: "bob" }] }, "bob");
    expect(r.matches).toEqual(new Set(["users[1].name"]));
    expect(r.onPath).toEqual(new Set(["root", "users", "users[1]"]));
  });

  it("matches at root-level primitive value", () => {
    const r = findMatches("hello world" as unknown as import("../../src/core/types").JsonValue, "world");
    expect(r.matches).toEqual(new Set(["root"]));
    expect(r.counts.values).toBe(1);
  });

  it("does not match array index as a key", () => {
    const r = findMatches([1, 2, 3], "0");
    // "0" still matches the value 0? No — values are 1, 2, 3. So 0 matches nothing.
    expect(r.matches.size).toBe(0);
  });

  it("opts.matchKeys=false skips key matches", () => {
    const r = findMatches({ port: 5432 }, "port", { matchKeys: false });
    expect(r.matches.size).toBe(0);
  });

  it("opts.matchValues=false skips value matches", () => {
    const r = findMatches({ port: 5432 }, "543", { matchValues: false });
    expect(r.matches.size).toBe(0);
  });

  it("counts split between keys and values", () => {
    const r = findMatches({ port: "portable" }, "port");
    expect(r.counts).toEqual({ keys: 1, values: 1 });
  });

  it("matches keys with non-identifier characters (quoted-bracket form)", () => {
    const r = findMatches({ "weird key": 1 }, "weird");
    expect(r.matches).toEqual(new Set(['["weird key"]']));
  });

  it("string substring match works on multi-word values", () => {
    const r = findMatches({ greeting: "Hello, World!" }, "world");
    expect(r.matches).toEqual(new Set(["greeting"]));
  });

  it("does not double-count when key and value both match", () => {
    const r = findMatches({ port: "port" }, "port");
    expect(r.matches).toEqual(new Set(["port"]));
    expect(r.counts).toEqual({ keys: 1, values: 1 });
  });

  it("handles empty object", () => {
    const r = findMatches({}, "anything");
    expect(r.matches.size).toBe(0);
  });

  it("handles empty array", () => {
    const r = findMatches([], "anything");
    expect(r.matches.size).toBe(0);
  });
});
