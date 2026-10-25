import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Die Prüfpunkt-Tabelle in docs/SMOKE.md ist hinter dem Treiber zurückgeblieben (F, G, H und sieben Einzelpunkte fehlten),
// obwohl Welle 26 sie schon einmal nachgezogen hatte: ein Hinweis im Treiberkopf hält sie nicht gleich, dieser Test schon.
// Der Treiber startet beim Import, deshalb liest der Test seinen Quelltext statt ihn zu laden.

const idsAusTreiber = (quelle: string): string[] => {
  const start = quelle.indexOf("const PUNKTE_JE_SECTION");
  const ende = quelle.indexOf("\n};", start);
  if (start < 0 || ende < 0) return [];
  return [...quelle.slice(start, ende).matchAll(/^\s+"([A-Z]+\d+) /gm)].map((m) => m[1]);
};

const idsAusTabelle = (doku: string): string[] => {
  const start = doku.indexOf("## Automatisiert");
  const ende = doku.indexOf("## Bleibt Handarbeit");
  if (start < 0 || ende < 0) return [];
  return [...doku.slice(start, ende).matchAll(/^\| ([A-Z]+\d+) \|/gm)].map((m) => m[1]);
};

const ohne = (a: string[], b: string[]): string[] => a.filter((id) => !b.includes(id));

describe("docs/SMOKE.md führt jeden Prüfpunkt des Treibers", () => {
  const treiber = idsAusTreiber(readFileSync("scripts/gui-smoke.ts", "utf8"));
  const tabelle = idsAusTabelle(readFileSync("docs/SMOKE.md", "utf8"));

  it("die Leser finden die Punkte (ein leerer Abgleich wäre grün und stumm)", () => {
    expect(treiber).toContain("A1");
    expect(treiber).toContain("CL3");
    expect(treiber).toContain("H5");
    expect(tabelle).toContain("A1");
    expect(tabelle).toContain("CL3");
  });

  it("jede ID kommt im Treiber und in der Tabelle genau einmal vor", () => {
    const doppelt = (ids: string[]): string[] => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect({ treiber: doppelt(treiber), tabelle: doppelt(tabelle) }).toEqual({
      treiber: [],
      tabelle: [],
    });
  });

  it("beide Mengen sind gleich", () => {
    expect({
      nurImTreiber: ohne(treiber, tabelle),
      nurInDerTabelle: ohne(tabelle, treiber),
    }).toEqual({
      nurImTreiber: [],
      nurInDerTabelle: [],
    });
  });
});
