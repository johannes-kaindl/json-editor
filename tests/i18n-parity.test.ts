import { afterEach, describe, expect, it } from "vitest";
import { typeLabel } from "../src/core/type-labels";
import { STRINGS } from "../src/i18n/strings";
import { SearchBar } from "../src/obsidian/SearchBar";
import { getLang, setLang } from "../src/vendor/kit/i18n";

describe("i18n — EN und DE tragen dieselben Schlüssel", () => {
  it("jeder Schlüssel steht in beiden Sprachen, mit Text und gleichen Platzhaltern", () => {
    const en = STRINGS.en as Record<string, string>;
    const de = STRINGS.de as Record<string, string>;
    expect(Object.keys(de).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in de))).toEqual([]);
    const platzhalter = (s: string): string => (s.match(/\{\d+\}/g) ?? []).sort().join(",");
    for (const k of Object.keys(en)) {
      expect(de[k]?.trim(), k).not.toBe("");
      expect(platzhalter(de[k] ?? ""), `Platzhalter von ${k}`).toBe(platzhalter(en[k] ?? ""));
    }
  });
});

describe("i18n — die Oberfläche folgt der Sprache", () => {
  const vorher = getLang();
  afterEach(() => {
    setLang(vorher);
  });

  it("Typnamen im Menü sind deutsch, wenn die Sprache de ist", () => {
    setLang("de");
    expect(typeLabel("object")).toBe("Objekt");
    setLang("en");
    expect(typeLabel("object")).toBe("Object");
  });

  it("die Suchleiste beschriftet ihr Feld in der Sprache", () => {
    setLang("de");
    const bar = new SearchBar({ onQueryChange: () => {} });
    expect(bar.getElement().querySelector("input")?.getAttribute("aria-label")).toBe(
      "JSON durchsuchen",
    );
    bar.destroy();
  });
});
