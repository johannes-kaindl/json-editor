import { afterEach, describe, expect, it } from "vitest";
import { CoreError } from "../../src/core/errors";
import { compileSchema } from "../../src/core/schema";
import { STRINGS } from "../../src/i18n/strings";
import { errorText, schemaErrorText } from "../../src/obsidian/error-text";
import { getLang, setLang } from "../../src/vendor/kit/i18n";

describe("errorText", () => {
  const vorher = getLang();
  afterEach(() => setLang(vorher));

  it("is German with the German UI and keeps the named values", () => {
    setLang("de");
    expect(errorText(new CoreError("keyEmpty", "Key cannot be empty"))).toBe(
      "Der Schlüssel darf nicht leer sein.",
    );
    expect(errorText(new CoreError("keyExists", 'Key "a" already exists', ["a"]))).toBe(
      "Den Schlüssel „a“ gibt es schon.",
    );
  });

  it("is English with the English UI", () => {
    setLang("en");
    expect(errorText(new CoreError("keyExists", 'Key "a" already exists', ["a"]))).toBe(
      'Key "a" already exists.',
    );
  });

  it("passes a foreign error through unchanged (a library text stays what the library said)", () => {
    setLang("de");
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("plain")).toBe("plain");
  });

  it("has a text in both languages for every code the core can throw", () => {
    const codes = [
      "keyEmpty",
      "keyExists",
      "parentNotObject",
      "parentNotArray",
      "cannotDeleteRoot",
      "cannotRenameRoot",
      "cannotRenameIndex",
      "indexOutOfBounds",
      "keyNotFound",
      "expectedIndexAt",
      "expectedKeyAt",
      "expectedIndexFor",
      "expectedKeyFor",
      "cannotDescend",
      "cannotDeleteFrom",
      "unsupportedType",
      "numberTooLarge",
      "schemaTooLarge",
      "schemaNotJson",
      "schemaUnsafePattern",
      "schemaNotDraft07",
    ];
    for (const c of codes) {
      expect((STRINGS.en as Record<string, string>)[`err.${c}`], `en err.${c}`).toBeTruthy();
      expect((STRINGS.de as Record<string, string>)[`err.${c}`], `de err.${c}`).toBeTruthy();
    }
  });
});

describe("schemaErrorText", () => {
  const vorher = getLang();
  afterEach(() => setLang(vorher));

  it("translates the compiler's own findings and leaves the validator library's text alone", () => {
    setLang("de");
    const unsafe = compileSchema('{"type":"string","pattern":"(a+)+$"}');
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok)
      expect(schemaErrorText(unsafe)).toBe(
        "Das Schema enthält ein womöglich unsicheres Regex-Muster: (a+)+$",
      );
    expect(schemaErrorText({ ok: false, error: "library says no" })).toBe("library says no");
  });
});
