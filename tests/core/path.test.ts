import { describe, it, expect } from "vitest";
import { pathToString } from "../../src/core/path";

describe("pathToString", () => {
  it("returns 'root' for empty path", () => {
    expect(pathToString([])).toBe("root");
  });

  it("serializes a single string segment", () => {
    expect(pathToString(["name"])).toBe("name");
  });

  it("serializes a single numeric segment as bracketed index", () => {
    expect(pathToString([0])).toBe("[0]");
  });

  it("joins string segments with dots", () => {
    expect(pathToString(["a", "b", "c"])).toBe("a.b.c");
  });

  it("uses bracket notation for numeric segments after strings", () => {
    expect(pathToString(["users", 0, "name"])).toBe("users[0].name");
  });

  it("chains numeric segments without separator", () => {
    expect(pathToString([0, 1, 2])).toBe("[0][1][2]");
  });

  it("uses bracket-with-quotes notation for keys with non-identifier chars", () => {
    expect(pathToString(["weird key"])).toBe('["weird key"]');
    expect(pathToString(["a", "weird key", "b"])).toBe('a["weird key"].b');
  });

  it("treats keys starting with digit as non-identifier", () => {
    expect(pathToString(["123abc"])).toBe('["123abc"]');
  });

  it("treats empty string key as non-identifier", () => {
    expect(pathToString([""])).toBe('[""]');
  });

  it("handles mixed deep paths", () => {
    expect(pathToString(["api", "v2", "users", 5, "addresses", 0, "street name"])).toBe(
      'api.v2.users[5].addresses[0]["street name"]'
    );
  });
});
