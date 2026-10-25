import { describe, expect, it } from "vitest";
import { parse } from "../../../src/core/parse";
import type { ConnectionOutcome } from "../../../src/core/repair/client";
import {
  type AskRequest,
  MAX_WINDOW_ROUNDS,
  WINDOW_MIN_LINES,
  repairWindowed,
} from "../../../src/core/repair/windowed";

/** Objekt mit n Einträgen, je eine Zeile: `  "kN": N,`. */
const bigDoc = (n: number, eol = "\n"): string =>
  `{${eol}${Array.from({ length: n }, (_, i) => `  "k${i}": ${i}${i < n - 1 ? "," : ""}`).join(eol)}${eol}}${eol}`;

const N = WINDOW_MIN_LINES * 3; // deutlich über der Schwelle: das Fenster spart etwas
const EARLY = Math.floor(N / 6);
const MID = Math.floor(N / 2);
const LATE = Math.floor((N * 5) / 6);
const MISSING_COMMA = (k: number) => [`  "k${k}": ${k},`, `  "k${k}": ${k}`] as const; // [gesund, kaputt]

/** Kaputtes Dokument aus dem gesunden, mit den Brüchen an den Einträgen `ks` (fehlendes Komma). */
const broken = (doc: string, ks: number[]): string =>
  ks.reduce((d, k) => d.replace(MISSING_COMMA(k)[0], MISSING_COMMA(k)[1]), doc);

const excerptOf = (req: AskRequest): string =>
  req.messages[1]?.content.split("Excerpt:\n")[1] ?? "";
const isExcerpt = (req: AskRequest): boolean =>
  (req.messages[1]?.content ?? "").includes("Excerpt:\n");
const isWhole = (req: AskRequest): boolean =>
  (req.messages[1]?.content ?? "").includes("Document:\n");

/** Fake-Verbindung: zeichnet jede Anfrage auf, die Antwort bestimmt der Test. */
const fake = (answer: (req: AskRequest, n: number) => string | ConnectionOutcome) => {
  const calls: AskRequest[] = [];
  const ask = async (req: AskRequest): Promise<ConnectionOutcome> => {
    calls.push(req);
    const a = answer(req, calls.length);
    return typeof a === "string" ? { ok: true, content: a } : a;
  };
  return { calls, ask };
};

/** Ein Modell, das die fehlenden Kommas der Einträge `ks` im Ausschnitt (oder im ganzen Dokument) ergänzt. */
const fixesCommas =
  (...ks: number[]) =>
  (req: AskRequest): string =>
    ks.reduce(
      (text, k) => text.replace(MISSING_COMMA(k)[1], MISSING_COMMA(k)[0]),
      isExcerpt(req) ? excerptOf(req) : (req.messages[1]?.content.split("Document:\n")[1] ?? ""),
    );

describe("repairWindowed", () => {
  const doc = bigDoc(N);

  it("kleines Dokument: ein Aufruf mit dem ganzen Dokument, wie bisher", async () => {
    const small = bigDoc(10);
    const { calls, ask } = fake(fixesCommas(3));
    const out = await repairWindowed(broken(small, [3]), "E", "json", ask);
    expect(out).toEqual({ ok: true, text: small.trim() });
    expect(calls).toHaveLength(1);
    expect(isWhole(calls[0] as AskRequest)).toBe(true);
  });

  it("die Schwelle: genau `WINDOW_MIN_LINES` Zeilen gehen ganz, eine Zeile mehr bekommt ein Fenster", async () => {
    // bigDoc(n) hat n + 2 Zeilen.
    const atLimit = bigDoc(WINDOW_MIN_LINES - 2);
    const over = bigDoc(WINDOW_MIN_LINES - 1);
    const a = fake(fixesCommas(WINDOW_MIN_LINES / 2));
    await repairWindowed(broken(atLimit, [WINDOW_MIN_LINES / 2]), "E", "json", a.ask);
    expect(a.calls.map(isWhole)).toEqual([true]);
    const b = fake(fixesCommas(WINDOW_MIN_LINES / 2));
    await repairWindowed(broken(over, [WINDOW_MIN_LINES / 2]), "E", "json", b.ask);
    expect(b.calls.map(isExcerpt)).toEqual([true]);
  });

  it("großes Dokument: die Anfrage trägt nur das Fenster, die Datei bleibt außerhalb byte-gleich", async () => {
    const bad = broken(doc, [MID]);
    const { calls, ask } = fake(fixesCommas(MID));
    const out = await repairWindowed(bad, "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
    expect(calls).toHaveLength(1);
    const req = calls[0] as AskRequest;
    expect(isExcerpt(req)).toBe(true);
    expect(isWhole(req)).toBe(false);
    expect(req.payload.length).toBeLessThan(doc.length / 5);
    expect(req.payload.split("\n")).toHaveLength(41);
  });

  it("Fehler in den ersten Zeilen", async () => {
    const { calls, ask } = fake(fixesCommas(1));
    const out = await repairWindowed(broken(doc, [1]), "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
    expect(calls).toHaveLength(1);
  });

  it("Fehler in der letzten Zeile (fehlendes Komma vor dem letzten Eintrag)", async () => {
    const { calls, ask } = fake(fixesCommas(N - 2));
    const out = await repairWindowed(broken(doc, [N - 2]), "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
    expect(calls).toHaveLength(1);
  });

  it("Fehler am Dateiende: die schließende Klammer fehlt", async () => {
    const bad = doc.replace(/\}\n$/, "");
    const { calls, ask } = fake((req) => `${excerptOf(req)}\n}`);
    const out = await repairWindowed(bad, "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
    expect(calls).toHaveLength(1);
    expect(isExcerpt(calls[0] as AskRequest)).toBe(true);
  });

  it("Position unbekannt (Komma vor `]`): das ganze Dokument, wie bisher", async () => {
    const list = `{\n  "list": [\n${Array.from({ length: N }, (_, i) => `    ${i},`).join("\n")}\n  ]\n}\n`;
    const { calls, ask } = fake((req) =>
      (req.messages[1]?.content.split("Document:\n")[1] ?? "").replace(/,\n {2}\]/, "\n  ]"),
    );
    const out = await repairWindowed(list, "E", "json", ask);
    expect(out).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(isWhole(calls[0] as AskRequest)).toBe(true);
  });

  it("zwei Fehler weit auseinander: zwei Fenster, beide Reparaturen im Ergebnis", async () => {
    const bad = broken(doc, [EARLY, LATE]);
    const { calls, ask } = fake(fixesCommas(EARLY, LATE));
    const out = await repairWindowed(bad, "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
    expect(calls).toHaveLength(2);
    expect(calls.every(isExcerpt)).toBe(true);
    expect(excerptOf(calls[0] as AskRequest)).toContain(`"k${EARLY}": ${EARLY}`);
    expect(excerptOf(calls[1] as AskRequest)).toContain(`"k${LATE}": ${LATE}`);
    expect(excerptOf(calls[1] as AskRequest)).not.toContain(`"k${EARLY}"`);
  });

  it("Antwort noch kaputt: die nächste Runde nimmt ein größeres Fenster", async () => {
    const bad = broken(doc, [MID]);
    const { calls, ask } = fake((req, n) => (n === 1 ? excerptOf(req) : fixesCommas(MID)(req)));
    const out = await repairWindowed(bad, "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
    expect(calls).toHaveLength(2);
    expect((calls[0] as AskRequest).payload.split("\n")).toHaveLength(41);
    expect((calls[1] as AskRequest).payload.split("\n")).toHaveLength(81);
  });

  it("nie behoben: drei Fenster, dann das ganze Dokument; das Ergebnis ist der Fehler der Prüfung", async () => {
    const bad = broken(doc, [MID]);
    const { calls, ask } = fake((req) =>
      isExcerpt(req) ? excerptOf(req) : (req.messages[1]?.content.split("Document:\n")[1] ?? ""),
    );
    const out = await repairWindowed(bad, "E", "json", ask);
    expect(out).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(calls).toHaveLength(MAX_WINDOW_ROUNDS + 1);
    expect(calls.slice(0, MAX_WINDOW_ROUNDS).every(isExcerpt)).toBe(true);
    expect(isWhole(calls[MAX_WINDOW_ROUNDS] as AskRequest)).toBe(true);
    expect(calls.slice(0, MAX_WINDOW_ROUNDS).map((c) => c.payload.split("\n").length)).toEqual([
      41, 81, 161,
    ]);
  });

  it("ein Fehler der Verbindung beendet den Lauf sofort", async () => {
    const { calls, ask } = fake(() => ({ ok: false, kind: "http", detail: "bad", status: 500 }));
    const out = await repairWindowed(broken(doc, [MID]), "E", "json", ask);
    expect(out).toEqual({ ok: false, error: { kind: "http", status: 500, detail: "bad" } });
    expect(calls).toHaveLength(1);
  });

  it("Abbruch durch den Nutzer beendet den Lauf sofort", async () => {
    const { calls, ask } = fake(() => ({ ok: false, kind: "aborted", detail: "" }));
    const out = await repairWindowed(broken(doc, [MID]), "E", "json", ask);
    expect(out).toEqual({ ok: false, error: { kind: "aborted" } });
    expect(calls).toHaveLength(1);
  });

  it("Zaun und Denkblock um den Ausschnitt stören nicht; die Einrückung der ersten Zeile bleibt", async () => {
    const { ask } = fake(
      (req) => `<think>hm</think>\n\`\`\`json\n${fixesCommas(MID)(req)}\n\`\`\``,
    );
    const out = await repairWindowed(broken(doc, [MID]), "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
  });

  it("eine leere Antwort zählt als Runde ohne Fortschritt, nicht als Abbruch", async () => {
    const { calls, ask } = fake((req, n) => (n === 1 ? "```\n```" : fixesCommas(MID)(req)));
    const out = await repairWindowed(broken(doc, [MID]), "E", "json", ask);
    expect(out).toEqual({ ok: true, text: doc });
    expect(calls).toHaveLength(2);
  });

  describe("Fortschritt", () => {
    it("behebt eine Runde nur den ersten von zwei nahen Fehlern, bleibt sie im Dokument; das nächste Fenster ist wieder klein", async () => {
      const bad = broken(doc, [MID, MID + 6]);
      const { calls, ask } = fake((req, n) =>
        n === 1 ? fixesCommas(MID)(req) : fixesCommas(MID + 6)(req),
      );
      const out = await repairWindowed(bad, "E", "json", ask);
      expect(out).toEqual({ ok: true, text: doc });
      expect(calls).toHaveLength(2);
      expect((calls[1] as AskRequest).payload.split("\n")).toHaveLength(41);
      // Das zweite Fenster sieht schon die Reparatur der ersten Runde.
      expect(excerptOf(calls[1] as AskRequest)).toContain(`"k${MID}": ${MID},`);
    });

    it("eine Antwort, die den Parser früher scheitern lässt, wird verworfen", async () => {
      const bad = broken(doc, [MID]);
      const { calls, ask } = fake((req, n) => {
        if (n > 1) return fixesCommas(MID)(req);
        // „Reparatur“ zerstört eine Zeile weit vor der Fehlerstelle: der Parser scheitert dort früher als zuvor.
        return excerptOf(req).replace(
          `"k${MID - 10}": ${MID - 10},`,
          `"k${MID - 10}" ${MID - 10},`,
        );
      });
      const out = await repairWindowed(bad, "E", "json", ask);
      expect(out).toEqual({ ok: true, text: doc });
      // Zweite Runde: größeres Fenster, und die zerstörte Zeile des Verworfenen steht dort nicht.
      expect((calls[1] as AskRequest).payload.split("\n")).toHaveLength(81);
      expect(excerptOf(calls[1] as AskRequest)).toContain(`"k${MID - 10}": ${MID - 10},`);
    });

    it("nennt die nächste Meldung keine Stelle mehr (Komma vor `]`), geht das ganze Dokument an das Modell", async () => {
      const withList = doc.replace(`  "k${LATE}": ${LATE},`, `  "k${LATE}": [1, 2,],`);
      const bad = broken(withList, [EARLY]);
      const { calls, ask } = fake((req, n) => {
        if (n === 1) return fixesCommas(EARLY)(req);
        return fixesCommas(EARLY)(req).replace("[1, 2,]", "[1, 2]");
      });
      const out = await repairWindowed(bad, "E", "json", ask);
      expect(out).toMatchObject({ ok: true });
      expect(calls).toHaveLength(2);
      expect(isWhole(calls[1] as AskRequest)).toBe(true);
      // Die Runde ließ sich nicht beurteilen und ist verworfen: das ganze Dokument trägt den ersten Fehler noch.
      expect((calls[1] as AskRequest).payload).toContain(`"k${EARLY}": ${EARLY}\n`);
    });

    it("scheitert das Ende, geht das ganze Dokument mit den bisherigen Reparaturen an das Modell", async () => {
      const bad = broken(doc, [EARLY, LATE]);
      const { calls, ask } = fake((req, n) => {
        if (n === 1) return fixesCommas(EARLY)(req);
        if (isExcerpt(req)) return excerptOf(req);
        return req.messages[1]?.content.split("Document:\n")[1] ?? "";
      });
      await repairWindowed(bad, "E", "json", ask);
      expect(calls).toHaveLength(MAX_WINDOW_ROUNDS + 1);
      const last = calls[MAX_WINDOW_ROUNDS] as AskRequest;
      expect(isWhole(last)).toBe(true);
      expect(last.payload).toContain(`"k${EARLY}": ${EARLY},`);
      expect(last.payload).toContain(`"k${LATE}": ${LATE}\n`);
    });
  });

  describe("Zeilenenden", () => {
    it("CRLF bleibt durchgehend CRLF, auch an der eingesetzten Stelle", async () => {
      const crlf = bigDoc(N, "\r\n");
      const crlfBad = crlf.replace(`  "k${MID}": ${MID},\r\n`, `  "k${MID}": ${MID}\r\n`);
      expect(crlfBad).not.toBe(crlf);
      const { ask } = fake((req) =>
        excerptOf(req).replace(`"k${MID}": ${MID}`, `"k${MID}": ${MID},`),
      );
      const out = await repairWindowed(crlfBad, "E", "json", ask);
      expect(out).toEqual({ ok: true, text: crlf });
      if (out.ok) expect((out.text.match(/(?<!\r)\n/g) ?? []).length).toBe(0);
    });

    it("das Fenster, das das Modell sieht, trägt kein `\\r`", async () => {
      const crlf = bigDoc(N, "\r\n");
      const crlfBad = crlf.replace(`  "k${MID}": ${MID},\r\n`, `  "k${MID}": ${MID}\r\n`);
      const { calls, ask } = fake((req) =>
        excerptOf(req).replace(`"k${MID}": ${MID}`, `"k${MID}": ${MID},`),
      );
      await repairWindowed(crlfBad, "E", "json", ask);
      expect((calls[0] as AskRequest).payload).not.toContain("\r");
    });
  });

  describe("jsonc", () => {
    it("die Stelle kommt vom Parser mit Kommentaren, der Kommentar im Fenster bleibt", async () => {
      const lines = Array.from(
        { length: N },
        (_, i) => `  "k${i}": ${i}${i < N - 1 ? "," : ""}${i === MID ? " // behalten" : ""}`,
      );
      const good = `{\n${lines.join("\n")}\n}\n`;
      const bad = good.replace(`"k${MID + 10}": ${MID + 10},`, `"k${MID + 10}": ${MID + 10},,`);
      const { calls, ask } = fake((req) => excerptOf(req).replace(`${MID + 10},,`, `${MID + 10},`));
      const out = await repairWindowed(bad, "E", "jsonc", ask);
      expect(out).toEqual({ ok: true, text: good });
      expect(isExcerpt(calls[0] as AskRequest)).toBe(true);
      expect(excerptOf(calls[0] as AskRequest)).toContain("// behalten");
    });
  });

  describe("Optionen", () => {
    it("ein Fenster, das das ganze Dokument deckt, ist keins: der Lauf geht gleich zum ganzen Dokument", async () => {
      const mid = bigDoc(30);
      const { calls, ask } = fake(fixesCommas(15));
      const out = await repairWindowed(broken(mid, [15]), "E", "json", ask, {
        minLines: 5,
        radius: 100,
      });
      expect(out).toMatchObject({ ok: true });
      expect(calls).toHaveLength(1);
      expect(isWhole(calls[0] as AskRequest)).toBe(true);
    });

    it("das Ergebnis ist mit dem Parser des Blocks geprüft", async () => {
      const { ask } = fake(fixesCommas(MID));
      const out = await repairWindowed(broken(doc, [MID]), "E", "json", ask);
      expect(out.ok && parse(out.text).ok).toBe(true);
    });
  });
});
