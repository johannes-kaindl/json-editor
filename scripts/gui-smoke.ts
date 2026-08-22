/**
 * GUI-Smoke-Treiber — fährt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand.
 *
 * Warum getrackt (CORE-TEST-02 b): die Praxis existiert in diesem Repo und hat sich
 * zweimal bezahlt gemacht — 1.10.1 (Lossy-Guard-Fehlalarm bei `.jsonc`-Kommentaren, 633
 * Tests grün) und 1.11.0 (der seit 1.10.2 tote Brotkrumen-Klick, 705 Tests grün). Beide
 * Male war es Handarbeit, und genau das verbietet (b): ein Werkzeug, das nur in einer
 * Session existiert, ist keine Praxis.
 *
 * Was er prüft, das die vitest-Suite strukturell nicht kann: echtes CSS und echte
 * Geometrie (happy-dom rechnet kein Layout), echtes Live-Preview-DOM, echte Mausklicks
 * (`isTrusted`), den echten Speicherweg auf die Platte, den echten Lebenszyklus.
 *
 * ## Voraussetzung
 *
 * Obsidian muss mit offenem Debug-Port laufen (der einzige Handgriff, der Handarbeit
 * bleibt — die App muss dafür neu gestartet werden):
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * Dann, mit deployter Plugin-Version (`npm run deploy`):
 *
 * ```bash
 * npm run smoke:gui -- --vault <vault-name>
 * npm run smoke:gui -- --port 9222 --section layout --keep
 * ```
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne Fokus bleibt der DOM
 * der Ansicht leer und man debuggt ein Phantom (CORE-TEST-02).
 */

import { execFileSync } from "node:child_process";

import {
  type Cdp,
  attachTo,
  clickReal,
  closeExtraLeaves,
  pollUntil,
  releaseAlwaysOnTop,
  requireVisible,
} from "../../tools/obsidian-cdp/cdp.js";

const PLUGIN_ID = "json-editor";
/** Interner View-Registrierungs-Key — NICHT die Plugin-id (AGENTS.md: nie ändern). */
const VIEW_TYPE = "json-editor-view";

/** Vom Lauf angelegte Dateien — das `finally` wirft sie gebündelt in den Papierkorb. */
const createdFiles = new Set<string>();

const SMOKE_JSON = "_json-smoke.json";
const SMOKE_JSONC = "_json-smoke.jsonc";
const SMOKE_BAD = "_json-smoke-bad.json";
const SMOKE_NOTE = "_json-smoke-block.md";

/**
 * Prüfdatei mit Absicht in jedem Feld: `nested.deep.leaf` liegt drei Ebenen tief (für den
 * Sprung in einen eingeklappten Ast), `nested.deep.filler` macht den eingeklappten Teilbaum
 * breit (nur so fällt auf, wenn er weiter Platz beansprucht), und `marker` ist der Wert,
 * der beim Editieren auf die Platte wandern muss.
 */
const SMOKE_DATA = {
  marker: "unveraendert",
  zahl: 42,
  flag: true,
  nested: {
    deep: {
      leaf: "tief-innen",
      filler: "ein sehr langer Wert, damit der eingeklappte Teilbaum breit waere",
    },
  },
  liste: ["alpha", "beta"],
};

/** `.jsonc`-Probe. Der Bindestrich im Kommentar ist der historische Defekt aus 1.10.1:
 *  `Number("-")` ist `NaN`, und der Lossy-Number-Guard sperrte darauf das Tree-Editieren. */
const SMOKE_JSONC_TEXT = [
  "{",
  '  // Kommentar mit Binde-Strich — 1.10.1',
  '  "wert": "original",',
  '  "zahl": 7',
  "}",
].join("\n");

const fence = "```";

// --- Protokoll ---------------------------------------------------------------

interface Result {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Result[] = [];

function check(name: string, passed: boolean, detail = ""): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Was der Lauf bewusst NICHT misst. Steht im Protokoll, damit eine Lücke nicht wie
 *  Abdeckung aussieht — ein stillschweigend ausgelassener Punkt liest sich hinterher
 *  wie ein grüner. */
function skipped(name: string, reason: string): void {
  console.log(`  – ${name} — übersprungen: ${reason}`);
}

// --- Szenen-Helfer -----------------------------------------------------------

/** Eine Datei anlegen (oder überschreiben) und im Hauptbereich öffnen.
 *
 *  Gewartet wird auf die **View-Instanz des Prüflings**, nicht auf „Datei ist aktiv":
 *  zwischen beidem liegt Obsidians asynchrones Öffnen, und in dieser Lücke misst jeder
 *  Prüfpunkt ein leeres Dokument. */
async function openJsonFile(cdp: Cdp, path: string, content: string): Promise<boolean> {
  createdFiles.add(path);
  const ok = await cdp.evaluate<boolean>(`
    const path = ${JSON.stringify(path)};
    const body = ${JSON.stringify(content)};
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing) await app.vault.modify(existing, body);
    else await app.vault.create(path, body);
    const file = app.vault.getAbstractFileByPath(path);
    let leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    if (!leaf || !leaf.parent) leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    return true;
  `);
  if (!ok) return false;
  const view = await pollUntil<string>(
    cdp,
    `
      const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
      const view = leaf?.view;
      if (!view) return null;
      const type = view.getViewType();
      if (type !== ${JSON.stringify(VIEW_TYPE)}) return type;
      // Auf gerendertes Wurzel-Element warten, nicht nur auf den View-Typ.
      return view.containerEl.querySelector(".json-tree-root, .cm-content, .json-error-banner")
        ? type
        : null;
    `,
    15_000,
    250,
  );
  return view === VIEW_TYPE;
}

/** Der View-Typ des aktiven Blattes — die ehrliche Antwort auf „wer hat die Datei". */
async function activeViewType(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`
    const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    return leaf?.view?.getViewType() ?? "(kein Blatt)";
  `);
}

/** Ein Ausdruck, der im Renderer auf dem Container der Prüfling-View auswertet.
 *  `document.querySelector` allein würde bei mehreren offenen Blättern das falsche
 *  Dokument treffen. */
const inView = (body: string): string => `
  const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
  const view = leaf?.view;
  if (!view || !view.containerEl) return null;
  const root = view.containerEl;
  ${body}
`;

/** Einen Plugin-Befehl über den Host ausführen — nicht die Methode direkt rufen.
 *  Die Registrierung ist Teil dessen, was hier geprüft wird. */
async function runCommand(cdp: Cdp, id: string): Promise<boolean> {
  return cdp.evaluate<boolean>(`
    const ok = app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:${id}`)});
    await new Promise((r) => setTimeout(r, 500));
    return Boolean(ok);
  `);
}

/** Auf den Inhalt einer Datei warten. Der Schreibweg ist debounced (`requestSave`) —
 *  wer sofort liest, misst den Vorzustand und hält ihn für einen Defekt. */
async function fileContains(cdp: Cdp, path: string, needle: string): Promise<string | null> {
  return pollUntil<string>(
    cdp,
    `
      const file = app.vault.getAbstractFileByPath(${JSON.stringify(path)});
      if (!file) return null;
      const text = await app.vault.read(file);
      return text.includes(${JSON.stringify(needle)}) ? text : null;
    `,
    12_000,
    400,
  );
}

// --- Abschnitte --------------------------------------------------------------

interface Section {
  key: string;
  title: string;
  run: (cdp: Cdp) => Promise<void>;
}

const SECTIONS: Section[] = [
  {
    key: "ansicht",
    title: "A — Datei-Ansicht (Host-Claim, Lebenszyklus)",
    run: async (cdp) => {
      const opened = await openJsonFile(cdp, SMOKE_JSON, JSON.stringify(SMOKE_DATA, null, 2));
      const type = await activeViewType(cdp);
      check(
        "A1 .json öffnet in der Plugin-Ansicht",
        opened && type === VIEW_TYPE,
        `View-Typ: ${type}`,
      );

      const tree = await cdp.evaluate<{ rows: number; keys: string[] } | null>(
        inView(`
          const rows = [...root.querySelectorAll(".json-row")];
          return {
            rows: rows.length,
            keys: [...root.querySelectorAll(".json-key")].map((k) => k.textContent.trim()),
          };
        `),
      );
      const hatSchluessel = Boolean(
        tree && tree.keys.some((k) => k.includes("marker")) && tree.keys.some((k) => k.includes("nested")),
      );
      check(
        "A2 Tree rendert mit den erwarteten Schlüsseln",
        Boolean(tree) && tree!.rows > 0 && hatSchluessel,
        tree ? `${tree.rows} Zeile(n), Schlüssel: ${tree.keys.slice(0, 4).join(", ")}` : "kein Baum",
      );

      // A3 — 1.10.1: Bindestrich im Kommentar löste den Lossy-Guard aus und sperrte den Tree.
      const openedJsonc = await openJsonFile(cdp, SMOKE_JSONC, SMOKE_JSONC_TEXT);
      const jsonc = await cdp.evaluate<{ lossy: boolean; editable: number; rows: number } | null>(
        inView(`
          // SICHTBARKEIT, nicht Existenz: der Banner haengt dauerhaft im DOM und wird nur
          // ueber \`hidden\` weggeschaltet. Wer ihn per querySelector zaehlt, misst ihn in
          // JEDEM Lauf als "da" — ein Pruefpunkt, der immer rot ist, sagt nichts.
          const banner = root.querySelector(".json-lossy-banner");
          return {
            lossy: Boolean(banner) && banner.getClientRects().length > 0,
            editable: root.querySelectorAll(".json-editable").length,
            rows: root.querySelectorAll(".json-row").length,
          };
        `),
      );
      check(
        "A3 .jsonc mit Kommentar bleibt editierbar (kein Lossy-Banner)",
        openedJsonc && Boolean(jsonc) && !jsonc!.lossy && jsonc!.editable > 0,
        jsonc
          ? `Lossy-Banner: ${jsonc.lossy ? "DA" : "keins"}, ${jsonc.editable} editierbare(r) Wert(e)`
          : "keine Ansicht",
      );

      // A4 — kaputtes JSON: der Modus wird erzwungen, nicht nur ein Banner gezeigt.
      await openJsonFile(cdp, SMOKE_BAD, '{"a": 1,,}');
      const bad = await pollUntil<{ banner: string; source: boolean }>(
        cdp,
        inView(`
          const banner = root.querySelector(".json-error-banner");
          if (!banner || banner.getClientRects().length === 0) return null;
          return {
            banner: banner.textContent.trim(),
            source: Boolean(root.querySelector(".cm-content")),
          };
        `),
        8000,
        300,
      );
      check(
        "A4 Kaputtes JSON erzwingt Source-Modus + Fehler-Banner",
        Boolean(bad) && bad!.source && /\d/.test(bad!.banner),
        bad ? `„${bad.banner}", CodeMirror: ${bad.source ? "da" : "fehlt"}` : "kein Banner",
      );
    },
  },

  {
    key: "layout",
    title: "B — Layout & Theme (echtes CSS, echte Geometrie)",
    run: async (cdp) => {
      await openJsonFile(cdp, SMOKE_JSON, JSON.stringify(SMOKE_DATA, null, 2));
      await runCommand(cdp, "collapse-all");

      // B1 — 1.10.2: das Trennkomma war ein nackter Textnode in einer Flex-Zeile und
      // wurde hinter die GANZE Box des Wertes gesetzt. Zusammen mit einem eingeklappten
      // Teilbaum, der weiter die Breite seiner versteckten Kinder trug, driftete es pro
      // Zeile unterschiedlich weit nach rechts. Gemessen wird deshalb der Abstand,
      // nicht die Existenz einer Klasse — die Klasse gab es im Defektfall auch.
      const komma = await cdp.evaluate<{ elemente: number; luecke: number; text: string } | null>(
        inView(`
          // DIREKTE Kinder: \`querySelector\` findet sonst Chip und Komma verschiedener
          // Verschachtelungsebenen und vergleicht zwei Punkte, die nie zusammengehoerten
          // (gemessen im ersten Lauf: -437px, ein Treiberfehler, kein Befund).
          const container = [...root.querySelectorAll(".json-container")]
            .find((c) => c.querySelector(":scope > .json-collapse-chip") && c.querySelector(":scope > .json-comma"));
          if (!container) return null;
          const chip = container.querySelector(":scope > .json-collapse-chip");
          const comma = container.querySelector(":scope > .json-comma");
          const cr = chip.getBoundingClientRect();
          const kr = comma.getBoundingClientRect();
          return {
            elemente: root.querySelectorAll(".json-comma").length,
            luecke: Math.round(kr.left - cr.right),
            text: comma.textContent.trim(),
          };
        `),
      );
      check(
        "B1 Trennkomma dockt am eingeklappten Wert an",
        Boolean(komma) && komma!.text === "," && komma!.luecke >= 0 && komma!.luecke <= 24,
        komma ? `${komma.luecke}px hinter dem Collapse-Chip (${komma.elemente} Komma-Elemente)` : "kein Komma gefunden",
      );

      // B2 — „Höhe 0 heißt nicht Platz 0": eine Box mit `max-height: 0` trägt weiter die
      // intrinsische Breite ihrer versteckten Kinder. Nur echtes Layout beantwortet das.
      const eingeklappt = await cdp.evaluate<{ display: string; breite: number } | null>(
        inView(`
          const content = root.querySelector(".json-content.collapsed");
          if (!content) return null;
          return {
            display: getComputedStyle(content).display,
            breite: content.getBoundingClientRect().width,
          };
        `),
      );
      check(
        "B2 Eingeklappter Teilbaum beansprucht keine Breite",
        Boolean(eingeklappt) && eingeklappt!.display === "none" && eingeklappt!.breite === 0,
        eingeklappt ? `display: ${eingeklappt.display}, Breite: ${eingeklappt.breite}px` : "nichts eingeklappt",
      );

      await runCommand(cdp, "expand-all");

      // B3 — Theme-Variablen greifen wirklich. Erst Existenz belegen, dann Eigenschaft
      // prüfen: ein Vergleich gegen ein fehlendes Element wird sonst ausgerechnet im
      // Defektfall grün.
      const farben = await cdp.evaluate<{ key: string; str: string } | null>(
        inView(`
          const key = root.querySelector(".json-key");
          const str = root.querySelector(".json-string");
          if (!key || !str) return null;
          return { key: getComputedStyle(key).color, str: getComputedStyle(str).color };
        `),
      );
      const gesetzt = (c: string): boolean => c !== "" && !/rgba\(0, 0, 0, 0\)/.test(c);
      check(
        "B3 Theme-Farben greifen (Key ≠ String, beide gesetzt)",
        Boolean(farben) && gesetzt(farben!.key) && gesetzt(farben!.str) && farben!.key !== farben!.str,
        farben ? `Key ${farben.key} · String ${farben.str}` : "keine Elemente",
      );

      // B4 — die `[hidden]`-Falle (1.8.0): ein Klassen-`display:` schlägt das UA-
      // `[hidden] { display: none }` bei gleicher Spezifität. Gemessen wird die
      // Sichtbarkeit, nicht das Attribut — das Attribut stimmte im Defektfall.
      const versteckt = await cdp.evaluate<{ gefunden: number; sichtbar: string[] } | null>(
        inView(`
          const kandidaten = [...root.querySelectorAll("[hidden]")];
          if (kandidaten.length === 0) return null;
          const sichtbar = kandidaten
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.className || el.tagName);
          return { gefunden: kandidaten.length, sichtbar };
        `),
      );
      if (!versteckt) {
        skipped("B4 [hidden]-Elemente sind wirklich unsichtbar", "kein [hidden]-Element in dieser Szene");
      } else {
        check(
          "B4 [hidden]-Elemente sind wirklich unsichtbar",
          versteckt.sichtbar.length === 0,
          `${versteckt.gefunden} geprüft${versteckt.sichtbar.length ? `, sichtbar trotz hidden: ${versteckt.sichtbar.join(", ")}` : ""}`,
        );
      }
    },
  },

  {
    key: "navigation",
    title: "C — Navigation (Befehle, Sichtbarkeit, Fokus)",
    run: async (cdp) => {
      await openJsonFile(cdp, SMOKE_JSON, JSON.stringify(SMOKE_DATA, null, 2));

      await runCommand(cdp, "expand-all");
      const offen = await cdp.evaluate<number>(
        inView(`return root.querySelectorAll(".json-content.collapsed").length;`),
      );
      await runCommand(cdp, "collapse-all");
      const zu = await cdp.evaluate<{ collapsed: number; gesamt: number }>(
        inView(`
          return {
            collapsed: root.querySelectorAll(".json-content.collapsed").length,
            gesamt: root.querySelectorAll(".json-content").length,
          };
        `),
      );
      check(
        "C1 collapse-all / expand-all wirken auf alle Container",
        offen === 0 && zu.gesamt > 0 && zu.collapsed === zu.gesamt,
        `expand-all: ${offen} zu · collapse-all: ${zu.collapsed}/${zu.gesamt} zu`,
      );

      // C2 — der Defekt, der einen Monat lebte: `scrollToPath` expandierte die Vorfahren
      // seines Ziels nicht, und seit 1.10.2 (`display: none`) war der Sprung damit ein
      // vollständiger No-Op. Gefahren wird der NUTZERWEG: Zeile anklicken (echter Klick,
      // damit der Brotkrumen gesetzt wird), alles einklappen, Brotkrumen-Segment klicken.
      await runCommand(cdp, "expand-all");
      const zielVorhanden = await cdp.evaluate<boolean>(
        inView(`return Boolean(root.querySelector('.json-row[data-path="nested.deep.leaf"]'));`),
      );
      if (!zielVorhanden) {
        check("C2 Sprung in einen eingeklappten Ast macht die Zeile sichtbar", false, "Zielzeile nicht im Baum");
      } else {
        await clickReal(cdp, `document.querySelector('.json-row[data-path="nested.deep.leaf"] .json-key')`);
        await new Promise((r) => setTimeout(r, 400));
        const segmente = await cdp.evaluate<string[]>(
          inView(`return [...root.querySelectorAll(".bc-seg")].map((s) => s.textContent.trim());`),
        );
        await runCommand(cdp, "collapse-all");
        const vorher = await cdp.evaluate<boolean>(
          inView(`
            const row = root.querySelector('.json-row[data-path="nested.deep.leaf"]');
            return Boolean(row) && row.getClientRects().length > 0;
          `),
        );
        // Auf das letzte Segment klicken: es zeigt auf die Zeile selbst, also genau den
        // Sprung, der im Defektfall nichts tat.
        const geklickt = await clickReal(
          cdp,
          `(() => {
            const segs = [...document.querySelectorAll(".bc-seg")];
            return segs.length ? segs[segs.length - 1] : null;
          })()`,
        );
        const nachher = await pollUntil<boolean>(
          cdp,
          inView(`
            const row = root.querySelector('.json-row[data-path="nested.deep.leaf"]');
            return Boolean(row) && row.getClientRects().length > 0;
          `),
          6000,
          300,
        );
        check(
          "C2 Sprung in einen eingeklappten Ast macht die Zeile sichtbar",
          segmente.length > 0 && geklickt && !vorher && nachher === true,
          `Brotkrumen: ${segmente.join(" › ") || "(leer)"} · vor dem Klick sichtbar: ${vorher ? "ja (Szene ungültig)" : "nein"} · danach: ${nachher ? "ja" : "nein"}`,
        );
      }

      // C3 — Suche: Trefferzahl und Weiterspringen. Gemessen wird, was im Baum markiert
      // ist, nicht was die Suchfunktion zurückgibt.
      await runCommand(cdp, "expand-all");
      const suche = await cdp.evaluate<{ treffer: number; zaehler: string; aktiv: string | null } | null>(
        inView(`
          const input = root.querySelector(".json-search-input");
          if (!input) return null;
          input.value = "alpha";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 400));
          const aktiv = root.querySelector(".json-match-active");
          return {
            treffer: root.querySelectorAll(".json-match").length,
            zaehler: (root.querySelector(".json-search-count")?.textContent ?? "").trim(),
            aktiv: aktiv ? aktiv.getAttribute("data-path") : null,
          };
        `),
      );
      check(
        "C3 Suche markiert Treffer und zählt sie",
        Boolean(suche) && suche!.treffer > 0 && /\d/.test(suche!.zaehler),
        suche ? `${suche.treffer} markiert, Zähler „${suche.zaehler}"` : "keine Suchleiste",
      );

      // Aufräumen der Szene: Suche leeren, damit der nächste Abschnitt nicht gefiltert misst.
      await cdp.evaluate(
        inView(`
          const input = root.querySelector(".json-search-input");
          if (input) {
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return true;
        `),
      );
    },
  },

  {
    key: "editieren",
    title: "D — Editieren (echter Klick, echter Schreibweg)",
    run: async (cdp) => {
      await openJsonFile(cdp, SMOKE_JSON, JSON.stringify(SMOKE_DATA, null, 2));
      await runCommand(cdp, "expand-all");

      // D1 — echter Mausklick statt `element.click()`: ein synthetischer Klick trägt
      // `isTrusted: false` und läuft an Host-Pfaden vorbei, die an echten Zeigereingaben
      // hängen (Fokus, Blur, Tooltip). Ein Defekt genau dort bliebe unsichtbar.
      const geklickt = await clickReal(
        cdp,
        `document.querySelector('.json-row[data-path="marker"] .json-editable')`,
      );
      const feld = await pollUntil<boolean>(
        cdp,
        inView(`return Boolean(root.querySelector(".json-inline-edit"));`),
        5000,
        200,
      );
      check(
        "D1 Echter Klick auf einen Wert öffnet das Inline-Feld",
        geklickt && feld === true,
        geklickt ? (feld ? "Feld offen" : "kein .json-inline-edit erschienen") : "Klickziel nicht gefunden",
      );

      // D2 — der Effekt ist die Datei auf der Platte, nicht der DOM-Zustand.
      const NEU = "geaendert-durch-smoke";
      await cdp.evaluate(
        inView(`
          const input = root.querySelector(".json-inline-edit");
          if (!input) return false;
          input.value = ${JSON.stringify(NEU)};
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          await new Promise((r) => setTimeout(r, 300));
          return true;
        `),
      );
      const nachEdit = await fileContains(cdp, SMOKE_JSON, NEU);
      check(
        "D2 Geänderter Wert landet auf der Platte",
        Boolean(nachEdit),
        nachEdit ? "Datei trägt den neuen Wert" : "Datei unverändert (Schreibweg?)",
      );

      // D3 — Undo über den registrierten Befehl, gemessen wieder an der Datei.
      const undoLage = await cdp.evaluate<{ aktiv: string; kannUndo: boolean }>(`
        const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
        const v = leaf?.view;
        return {
          aktiv: app.workspace.getActiveFile()?.path ?? "(keine)",
          kannUndo: Boolean(v && typeof v.canUndo === "function" && v.canUndo()),
        };
      `);
      const undoOk = await runCommand(cdp, "undo-edit");
      const nachUndo = await fileContains(cdp, SMOKE_JSON, "unveraendert");
      check(
        "D3 Undo stellt den Dateiinhalt wieder her",
        undoOk && Boolean(nachUndo),
        nachUndo
          ? "Ausgangswert zurück"
          : `Ausgangswert nicht zurück (Befehl lief: ${undoOk ? "ja" : "nein"}, canUndo: ${undoLage.kannUndo ? "ja" : "nein"}, aktive Datei: ${undoLage.aktiv})`,
      );

      // D4 — der duale Mutationspfad: eine `.jsonc`-Änderung darf die Kommentare nicht
      // wegwerfen. Auch das ist nur an der geschriebenen Datei zu sehen.
      await openJsonFile(cdp, SMOKE_JSONC, SMOKE_JSONC_TEXT);
      await runCommand(cdp, "expand-all");
      const jsoncGeklickt = await clickReal(
        cdp,
        `document.querySelector('.json-row[data-path="wert"] .json-editable')`,
      );
      await cdp.evaluate(
        inView(`
          const input = root.querySelector(".json-inline-edit");
          if (!input) return false;
          input.value = "neu-mit-kommentar";
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          await new Promise((r) => setTimeout(r, 300));
          return true;
        `),
      );
      const jsoncText = await fileContains(cdp, SMOKE_JSONC, "neu-mit-kommentar");
      check(
        "D4 .jsonc-Edit erhält die Kommentare",
        jsoncGeklickt && Boolean(jsoncText) && jsoncText!.includes("Binde-Strich"),
        jsoncText
          ? jsoncText.includes("Binde-Strich")
            ? "Kommentar steht noch in der Datei"
            : "Wert geschrieben, KOMMENTAR VERLOREN"
          : "Wert nicht geschrieben",
      );
    },
  },

  {
    key: "codeblock",
    title: "E — Codeblock in Notizen (Post-Processor, Lesemodus)",
    run: async (cdp) => {
      const note = [
        "# Smoke",
        "",
        `${fence}json`,
        '{ "block": "gueltig", "n": 1 }',
        fence,
        "",
        `${fence}json`,
        "{ kaputt ,,, }",
        fence,
        "",
      ].join("\n");
      createdFiles.add(SMOKE_NOTE);
      await cdp.evaluate(`
        const path = ${JSON.stringify(SMOKE_NOTE)};
        const body = ${JSON.stringify(note)};
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) await app.vault.modify(existing, body);
        else await app.vault.create(path, body);
        const file = app.vault.getAbstractFileByPath(path);
        let leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
        if (!leaf || !leaf.parent) leaf = app.workspace.getLeaf(true);
        await leaf.openFile(file, { state: { mode: "preview" } });
        app.workspace.setActiveLeaf(leaf, { focus: true });
        return true;
      `);

      const bloecke = await pollUntil<{ ok: number; fehler: number; zeilen: number }>(
        cdp,
        `
          const preview = document.querySelector(".markdown-reading-view");
          if (!preview) return null;
          const ok = preview.querySelectorAll(".json-codeblock").length;
          const fehler = preview.querySelectorAll(".json-codeblock-error").length;
          if (ok === 0 && fehler === 0) return null;
          return { ok, fehler, zeilen: preview.querySelectorAll(".json-codeblock .json-row").length };
        `,
        15_000,
        400,
      );
      check(
        "E1 Gültiger ```json-Block rendert als Tree",
        Boolean(bloecke) && bloecke!.ok > 0 && bloecke!.zeilen > 0,
        bloecke ? `${bloecke.ok} Karte(n), ${bloecke.zeilen} Zeile(n)` : "kein Codeblock gerendert",
      );
      check(
        "E2 Kaputter Block fällt auf die Fehler-Karte zurück",
        Boolean(bloecke) && bloecke!.fehler > 0,
        bloecke ? `${bloecke.fehler} Fehler-Karte(n)` : "nicht messbar",
      );

      // E3 — der Copy-Knopf des Codeblocks hatte bis 1.11.2 GAR KEINEN Guard. Gemessen
      // wird die Zwischenablage selbst; ihr Vorwert wird in `main` zurückgeschrieben.
      const kopiert = await clickReal(cdp, `document.querySelector(".json-codeblock-copy")`);
      const inhalt = kopiert
        ? await pollUntil<string>(
            cdp,
            `
              try {
                const text = await navigator.clipboard.readText();
                return text && text.includes("gueltig") ? text : null;
              } catch (e) {
                return null;
              }
            `,
            6000,
            400,
          )
        : null;
      if (!kopiert) {
        check("E3 Copy-Knopf schreibt in die Zwischenablage", false, "Knopf nicht gefunden");
      } else if (inhalt === null) {
        // Zwei zulässige Ausgänge trennen: der Knopf kann geliefert haben, während das
        // LESEN der Zwischenablage im Renderer verweigert wird. Dann belegt die Notice
        // den Erfolg — falsch ist nur das stumme Dritte.
        const beschriftung = await cdp.evaluate<string>(
          `return (document.querySelector(".json-codeblock-copy")?.textContent ?? "").trim();`,
        );
        check(
          "E3 Copy-Knopf schreibt in die Zwischenablage",
          beschriftung.toLowerCase().includes("copied"),
          `Zwischenablage nicht lesbar; Knopf meldet „${beschriftung}"`,
        );
      } else {
        check("E3 Copy-Knopf schreibt in die Zwischenablage", true, "Zwischenablage trägt den Blockinhalt");
      }
    },
  },
];

// --- Lauf --------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");
  const keep = argv.includes("--keep");
  const sectionArg = flag("section");

  const sections = sectionArg ? SECTIONS.filter((s) => s.key === sectionArg) : SECTIONS;
  if (sections.length === 0) {
    throw new Error(
      `Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`,
    );
  }

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Workspace-Fenster auf Port ${port}${vault ? ` fuer Vault „${vault}"` : ""}. `
        + `Laeuft Obsidian mit --remote-debugging-port=${port}?`,
    );
  }

  // Ausserhalb des `try`, damit das `finally` sie auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben kann.
  let previousSettings: string | null = null;
  let previousClipboard: string | null = null;

  try {
    // Ohne Fokus drosselt Chromium den Renderer: der DOM der Ansicht bleibt leer, waehrend
    // die App-API den Zustand korrekt meldet — man debuggt ein Phantom. `Page.bringToFront`
    // allein genuegt auf macOS NICHT (es holt das Fenster in der App nach vorn, nicht die
    // App nach vorn), deshalb zusaetzlich `osascript activate`.
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
    }
    await requireVisible(cdp);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));

    const vaultName = await cdp.evaluate<string>(`return window.app ? app.vault.getName() : "";`);
    if (!vaultName) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    console.log(`Vault: ${vaultName}`);

    // Das Plugin NEU LADEN, bevor irgendetwas gemessen wird. `npm run deploy` ersetzt nur
    // die Dateien; die laufende Instanz behaelt den alten Code im Speicher — ohne diesen
    // Schritt meldet der Smoke den zuletzt geladenen Stand als Ergebnis fuer den gerade
    // gebauten. (In 3d-codeblocks lief eine absichtlich kaputte Version so 13/13 gruen.)
    const plugin = await cdp.evaluate<{ ok: boolean; version?: string }>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      if (app.plugins.plugins[id]) {
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 400));
      }
      await app.plugins.enablePlugin(id);
      await new Promise((r) => setTimeout(r, 1200));
      const p = app.plugins.plugins[id];
      return p ? { ok: true, version: p.manifest.version } : { ok: false };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv. Erst \`npm run deploy\`.`);
    // Die Version aus der DEPLOYTEN Datei, nicht aus `plugin.manifest`: Obsidian liest die
    // Manifeste beim Start und behaelt sie im Speicher — ein `npm run deploy` danach
    // aktualisiert den geladenen Code (enablePlugin liest main.js neu), aber nicht diese
    // Angabe. Im ersten Lauf meldete der Treiber deshalb 1.11.1 fuer einen 1.11.2-Deploy:
    // eine Zahl, die genau dann in die Irre fuehrt, wenn man ihr glauben will.
    const deployt = await cdp.evaluate<string>(`
      try {
        const pfad = app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/manifest.json";
        const roh = await app.vault.adapter.read(pfad);
        return JSON.parse(roh).version ?? "?";
      } catch (e) { return "?"; }
    `);
    console.log(`Plugin-Version: ${deployt} deployt, ${plugin.version} beim App-Start registriert\n`);

    await closeExtraLeaves(cdp).catch(() => undefined);

    // Vorwerte sichern. Ein Gesamt-Schnappschuss der Settings, nicht einzelne Felder: die
    // Wiederherstellung darf nicht daran haengen, dass jeder Abschnitt sauber zu Ende laeuft.
    previousSettings = await cdp.evaluate<string>(`
      return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings ?? {});
    `);
    previousClipboard = await cdp
      .evaluate<string>(`try { return await navigator.clipboard.readText(); } catch (e) { return ""; }`)
      .catch(() => "");

    for (const section of sections) {
      console.log(`── ${section.title}`);
      await section.run(cdp);
      console.log("");
    }
  } finally {
    // Aufraeumen haengt nie am Ergebnis: auch ein abgebrochener Lauf gibt den Vault so
    // zurueck, wie er ihn vorgefunden hat.
    if (previousClipboard) {
      await cdp
        .evaluate(`
          try { await navigator.clipboard.writeText(${JSON.stringify(previousClipboard)}); } catch (e) {}
          return true;
        `)
        .catch(() => undefined);
    }
    if (!keep) {
      // Erst die Ansichten SCHLIESSEN, dann die Dateien wegwerfen. Eine schliessende
      // JsonFileView schreibt ihren Collapse-Zustand in `data.json` — geschieht das nach
      // dem Zurueckschreiben der Einstellungen, stehen die Pruefdateien danach wieder
      // drin und der Lauf hinterlaesst Spuren im Vault (gemessen 2026-08-22, zweimal:
      // eine blosse Wartezeit reichte nicht).
      // In den PAPIERKORB, nicht hart loeschen: der Smoke laeuft im produktiven Vault, und
      // ein Fehlgriff beim Pfad waere sonst unwiderruflich.
      await cdp
        .evaluate(`
          const pfade = ${JSON.stringify([...createdFiles])};
          const blaetter = [];
          app.workspace.iterateAllLeaves((l) => blaetter.push(l));
          for (const blatt of blaetter) {
            const datei = blatt.view?.file?.path;
            if (datei && pfade.includes(datei)) blatt.detach();
          }
          // Lange genug, dass der verzoegerte Collapse-State-Schreiber der schliessenden
          // Ansicht durch ist — sonst holt er das Zurueckschreiben spaeter wieder ein.
          await new Promise((r) => setTimeout(r, 2500));
          for (const path of pfade) {
            const file = app.vault.getAbstractFileByPath(path);
            if (file) await app.fileManager.trashFile(file);
          }
          await new Promise((r) => setTimeout(r, 800));
          return true;
        `)
        .catch(() => undefined);
    } else {
      console.log(`(--keep: ${createdFiles.size} Pruefdatei(en) bleiben im Vault stehen)`);
    }
    // Die Einstellungen ZULETZT, wenn nichts mehr in `data.json` schreiben kann — und
    // zweimal mit Abstand: eine schliessende Ansicht schreibt ihren Collapse-Zustand
    // verzoegert nach, und der erste Rueckschreibvorgang wird davon wieder ueberholt
    // (gemessen 2026-08-22: Warten allein reichte nicht, Reihenfolge allein auch nicht).
    // Das ERGEBNIS wird gemeldet, nicht vorausgesetzt: was hier still schiefgeht, laesst
    // eine Testfixtur in den Einstellungen des Maintainers zurueck.
    if (previousSettings !== null) {
      // Gelesen wird die DATEI, nicht das Objekt im Speicher: `saveSettings` schreibt
      // verzoegert, und ein Vergleich gegen `plugin.settings` meldet „byte-gleich",
      // waehrend `data.json` noch etwas anderes enthaelt (gemessen 2026-08-22 — der
      // Treiber log genau so).
      const zurueck = async (): Promise<string> =>
        cdp
          .evaluate<string>(`
            const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            if (!plugin) return "(Plugin weg)";
            for (const key of Object.keys(plugin.settings)) delete plugin.settings[key];
            Object.assign(plugin.settings, JSON.parse(${JSON.stringify(previousSettings)}));
            // Der Schnappschuss allein genuegt nicht — aus zwei Gruenden. Erstens legt das
            // Oeffnen einer Pruefdatei einen Eintrag im per-Datei-Collapse-Zustand an, der
            // nach einem frueheren Lauf BEREITS im Vorwert steht und sonst getreu
            // konserviert wuerde. Zweitens liegt dieser Zustand gar nicht in settings,
            // sondern in einem eigenen Feld collapseStates: persist() schreibt
            // { ...settings, collapseState: collapseStates }, also setzt jedes Speichern
            // die Eintraege aus dem zweiten Feld neu in die Datei. Wer nur settings
            // zurueckschreibt, raeumt sichtbar auf und aendert an data.json nichts
            // (gemessen 2026-08-22 — der Speicher war leer, die Datei nicht).
            for (const pfad of ${JSON.stringify([...createdFiles])}) {
              if (plugin.settings.collapseState) delete plugin.settings.collapseState[pfad];
              if (plugin.collapseStates) delete plugin.collapseStates[pfad];
            }
            await plugin.saveSettings?.();
            await new Promise((r) => setTimeout(r, 600));
            const pfad = app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/data.json";
            return JSON.stringify(JSON.parse(await app.vault.adapter.read(pfad)));
          `)
          .catch(() => "(Fehler)");
      // Herstellen schlaegt melden: es wird so lange zurueckgeschrieben, bis die Datei
      // stehen bleibt. Ein einzelner Versuch wird vom verzoegerten Schreiber der zuletzt
      // geschlossenen Ansicht ueberholt — und eine Abweichungsmeldung bei JEDEM Lauf
      // waere Laerm, den beim dritten Mal niemand mehr liest.
      let endstand = await zurueck();
      for (let runde = 0; runde < 5; runde++) {
        await new Promise((r) => setTimeout(r, 1200));
        const erneut = await zurueck();
        if (erneut === endstand) break;
        endstand = erneut;
      }
      // Das Soll ist der Vorwert OHNE die eigenen Spuren — sonst meldet der Vergleich
      // eine Abweichung genau dann, wenn richtig aufgeraeumt wurde.
      const sollObjekt = JSON.parse(previousSettings) as {
        collapseState?: Record<string, unknown>;
      };
      if (sollObjekt.collapseState) {
        for (const pfad of createdFiles) delete sollObjekt.collapseState[pfad];
      }
      const soll = JSON.stringify(sollObjekt);
      console.log(
        endstand === soll
          ? "Einstellungen zurueckgeschrieben: data.json byte-gleich"
          : `Einstellungen ABWEICHUNG in data.json:\n  vorher:  ${soll}\n  nachher: ${endstand}`,
      );
    }
    await releaseAlwaysOnTop(cdp).catch(() => undefined);
    cdp.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`${results.length - failed.length}/${results.length} gruen`);
  if (failed.length > 0) {
    console.log("Rot:");
    for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
