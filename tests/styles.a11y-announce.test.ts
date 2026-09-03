import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Die Ansage-Region traegt Text ("Value copied"), der NUR fuer Hilfstechnologie gedacht
// ist. Ohne eine Regel, die sie aus dem Textfluss nimmt, steht dieser Text sichtbar im
// Baum — ein Defekt, den happy-dom nicht sehen kann (es rechnet kein Layout und wendet
// kein externes CSS an), also wird die Quelle geprueft.
//
// `display: none` waere die naheliegende Loesung und die falsche: so ausgeblendete
// Elemente werden aus dem Accessibility-Tree entfernt und nie angesagt. Deshalb der
// Clip-Ansatz — sichtbar fuer den Screenreader, unsichtbar fuer das Auge.
const css = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

describe("styles: the live region is invisible but not hidden", () => {
  const block = /\.json-a11y-announce\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  it("has a rule at all", () => {
    expect(block).not.toBe("");
  });

  it("takes the text out of the visual flow", () => {
    expect(block).toMatch(/position:\s*absolute/);
    expect(block).toMatch(/clip-path|clip:/);
  });

  it("does not use display:none or visibility:hidden, which would silence it", () => {
    expect(block).not.toMatch(/display:\s*none/);
    expect(block).not.toMatch(/visibility:\s*hidden/);
  });
});
