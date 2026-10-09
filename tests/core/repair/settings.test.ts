import { describe, expect, it } from "vitest";
import { DEFAULT_LLM_SETTINGS, loadLlmSettings } from "../../../src/core/repair/settings";

describe("loadLlmSettings", () => {
  it("ohne gespeicherte Daten: Defaults, ohne Referenz auf das Defaults-Objekt", () => {
    const { llm, dropped } = loadLlmSettings(null);
    expect(llm.endpoints).toEqual(DEFAULT_LLM_SETTINGS.endpoints);
    expect(llm.endpoints).not.toBe(DEFAULT_LLM_SETTINGS.endpoints);
    expect(dropped).toEqual([]);
  });
  it("uebernimmt Endpunkte und Wahl, ein altes Zeitlimit liest niemand mehr", () => {
    const { llm } = loadLlmSettings({
      endpoints: [{ url: "http://a:1", model: "m" }, "http://b:2"],
      choice: { endpointId: "e1", model: "x", junk: 1 },
      timeoutSec: 1,
    });
    expect(llm.endpoints.map((e) => e.url)).toEqual(["http://a:1", "http://b:2"]);
    expect(llm.choice).toEqual({ endpointId: "e1", model: "x" });
    expect(llm).not.toHaveProperty("timeoutSec");
  });
  it("meldet verworfene Request-Eintraege statt sie still zu verlieren", () => {
    const { llm, dropped } = loadLlmSettings({ request: { thinking: { structured: "bogus" } } });
    expect(dropped.length).toBeGreaterThan(0);
    expect(llm.request.thinking.structured).toBeUndefined();
  });
});
