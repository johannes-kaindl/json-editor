import { describe, expect, it } from "vitest";
import { findFenceAt, spliceFence } from "../../../src/core/repair/fence";

const NOTE = [
  "# T",
  "",
  "```json",
  '{"a": 1,}',
  "```",
  "",
  "text",
  "",
  "~~~jsonc",
  "// c",
  "{}",
  "~~~",
  "",
].join("\n");

describe("findFenceAt", () => {
  it("findet den Block unter dem Cursor, inklusive Zaunzeilen", () => {
    for (const line of [2, 3, 4]) {
      expect(findFenceAt(NOTE, line)).toEqual({
        lang: "json",
        start: 2,
        end: 4,
        content: '{"a": 1,}',
      });
    }
  });
  it("erkennt jsonc und Tilden-Zaeune", () => {
    expect(findFenceAt(NOTE, 10)).toEqual({
      lang: "jsonc",
      start: 8,
      end: 11,
      content: "// c\n{}",
    });
  });
  it("liefert null ausserhalb und bei fremden Sprachen", () => {
    expect(findFenceAt(NOTE, 0)).toBeNull();
    expect(findFenceAt(NOTE, 6)).toBeNull();
    expect(findFenceAt("```js\nx\n```", 1)).toBeNull();
  });
  it("repariert keinen nie geschlossenen Zaun", () => {
    expect(findFenceAt("```json\n{\n", 1)).toBeNull();
  });
});

describe("spliceFence", () => {
  it("ersetzt nur den Inhalt, der Rest der Notiz bleibt byte-gleich", () => {
    const out = spliceFence(NOTE, 2, 4, '{"a": 1,}', '{"a": 1}');
    expect(out).toBe(NOTE.replace('{"a": 1,}', '{"a": 1}'));
  });
  it("mehrzeilige Ersetzung", () => {
    expect(spliceFence("```json\n{\n```", 0, 2, "{", '{\n  "a": 1\n}')).toBe(
      '```json\n{\n  "a": 1\n}\n```',
    );
  });
  it("verweigert, wenn sich der Text seit der Anfrage geaendert hat", () => {
    expect(spliceFence(NOTE, 2, 4, '{"a": 2,}', "{}")).toBeNull();
  });
  it("fuellt einen leeren Block", () => {
    expect(spliceFence("```json\n```", 0, 1, "", "{}")).toBe("```json\n{}\n```");
  });
});
