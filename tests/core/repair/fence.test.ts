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

// Die drei gemessenen Abweichungen gegen die frühere eigene Suche (Entscheidung 2026-11-15, Zaun-Scanner aus code-kit `fences`).
describe("findFenceAt — Kit-Scanner, entschiedene Abweichungen", () => {
  it("(1) der Rumpf einer CRLF-Notiz kommt LF-verbunden, ohne \\r je Zeile", () => {
    const f = findFenceAt('```json\r\n{\r\n  "a": 1,\r\n}\r\n```\r\n', 2);
    expect(f).toEqual({ lang: "json", start: 0, end: 4, content: '{\n  "a": 1,\n}' });
    expect(f?.content).not.toContain("\r");
  });
  it("(2) ein json-Zaun innerhalb eines anderen Zauns ist Inhalt des äußeren und kein Block", () => {
    const note = ["````md", "```json", '{"a": 1,}', "```", "````", ""].join("\n");
    expect(findFenceAt(note, 2)).toBeNull();
    // Gegenprobe: derselbe Block ohne den äußeren Zaun wird gefunden (die Messung kann also anschlagen).
    expect(findFenceAt(note.split("\n").slice(1, 4).join("\n"), 1)?.content).toBe('{"a": 1,}');
  });
  it('(3) die Sprache ist das erste Wort der Info-Zeile: ```json title="x" gilt als json', () => {
    expect(findFenceAt('```json title="x"\n{"a": 1,}\n```', 1)).toEqual({
      lang: "json",
      start: 0,
      end: 2,
      content: '{"a": 1,}',
    });
    expect(findFenceAt("```jsonc title\n{}\n```", 1)?.lang).toBe("jsonc");
    // Gegenprobe: ein anderes erstes Wort bleibt draußen, auch wenn „json“ später steht.
    expect(findFenceAt("```js json\n{}\n```", 1)).toBeNull();
    expect(findFenceAt("```jsonl\n{}\n```", 1)).toBeNull();
  });
  it("Einzug: bis drei Spalten ein Zaun, ab vier Code (CommonMark); früher galt jeder Einzug", () => {
    expect(findFenceAt("   ```json\n   {}\n   ```", 1)?.start).toBe(0);
    expect(findFenceAt("    ```json\n    {}\n    ```", 1)).toBeNull();
  });
  it("Groß-/Kleinschreibung der Sprache bleibt egal", () => {
    expect(findFenceAt("```JSON\n{}\n```", 1)?.lang).toBe("json");
    expect(findFenceAt("```JsonC\n{}\n```", 1)?.lang).toBe("jsonc");
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
