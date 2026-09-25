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
 * ⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
 * `quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
 * deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
 * fällt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
 * ```
 *
 * Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
 * `vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
 * wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
 * CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.
 *
 * Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.
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
 * Zwei Schalter fuer die Klicks selbst — sie pruefen den PRUEFER, nicht den Prueflings:
 *
 * ```bash
 * npm run smoke:gui -- --klick-gegenprobe   # klickt nicht; jeder Klick-Punkt MUSS rot werden
 * npm run smoke:gui -- --halten 150         # Press/Release mit Haltedauer statt im selben Tick
 * ```
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne Fokus bleibt der DOM
 * der Ansicht leer und man debuggt ein Phantom (CORE-TEST-02).
 */

import { execFileSync } from "node:child_process";
import { type Server, createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";

import {
  type Cdp,
  attachTo,
  clickReal,
  closeExtraLeaves,
  pollUntil,
  releaseAlwaysOnTop,
  requireVisible,
} from "../../tools/obsidian-cdp/cdp.js";
import { capture } from "../../tools/obsidian-cdp/shot.js";
import { buildHerkunft, requireEigenerBuild } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "json-editor";
/** Interner View-Registrierungs-Key — NICHT die Plugin-id (AGENTS.md: nie ändern). */
const VIEW_TYPE = "json-editor-view";

/** Vom Lauf angelegte Dateien — das `finally` wirft sie gebündelt in den Papierkorb. */
const createdFiles = new Set<string>();

/**
 * Klick-Optionen des Laufs — gesetzt aus `--halten` / `--klick-gegenprobe`.
 *
 * **Warum das ein Schalter ist und kein Handgriff:** ein Prüfpunkt hinter einem Klick kann
 * *grün am Falschen* sein — grün, obwohl der Klick nie ankam, weil die Bedingung schon
 * vorher wahr war. Das fällt nur auf, wenn man den Klick wegnimmt und **rot** erwartet.
 * Eine Gegenprobe, die man von Hand herstellt, wird einmal gefahren und danach nie wieder;
 * als Flag ist sie beim nächsten neuen Prüfpunkt einen Aufruf entfernt.
 *
 * `haltenMs` ist die zweite Hälfte derselben Frage: `clickReal` schickt Press und Release
 * ohne Pause. Zeichnet die Ansicht sich dazwischen neu, trifft das Release ein anderes
 * Element und es entsteht **gar kein** `click` — der Punkt wird dann zu Recht rot, aber aus
 * einem Grund, den niemand am Prüfling suchen würde. Die Schwelle, ab der ein Punkt kippt,
 * wird gemessen (`--halten 150`) statt geschätzt.
 */
const klickOptionen = { haltenMs: 0, gegenprobe: false };

/**
 * Einziger Klick-Weg des Treibers — kein Prüfpunkt ruft `clickReal` direkt auf, sonst
 * greift der Schalter nur bei der Hälfte.
 *
 * In der Gegenprobe wird die *Existenz und Sichtbarkeit* des Ziels weiter geprüft (ein
 * fehlendes Ziel bleibt ein Werkzeugfehler und soll nicht als „Klick wirkt nicht"
 * durchgehen) — nur der Klick selbst unterbleibt.
 */
async function klick(cdp: Cdp, ausdruck: string): Promise<boolean> {
  // Zuerst die LAGE des Ziels, dann erst der Klick. `clickReal` gibt bei „nicht im DOM" und
  // bei „da, aber 0x0" dasselbe `false` zurueck — und der Pruefpunkt meldet dann beides als
  // „Knopf nicht gefunden". Genau diese Verwechslung kostete am 2026-09-02 eine
  // Viertelstunde: der Knopf war da, nur im unsichtbaren Zwilling-Container der Ansicht.
  const lage = await cdp.evaluate<{ da: boolean; w: number; h: number }>(`
    const el = ${ausdruck};
    if (!el) return { da: false, w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { da: true, w: r.width, h: r.height };
  `);
  if (!lage.da) {
    console.log("    (Klick-Ziel nicht im DOM)");
    return false;
  }
  if (lage.w === 0 || lage.h === 0) {
    console.log("    (Klick-Ziel liegt im DOM, ist aber 0x0 — unsichtbar. Falscher Scope?)");
    return false;
  }
  if (klickOptionen.gegenprobe) return true;
  return clickReal(cdp, ausdruck, klickOptionen.haltenMs);
}

const SMOKE_JSON = "_json-smoke.json";
const SMOKE_JSONC = "_json-smoke.jsonc";
const SMOKE_BAD = "_json-smoke-bad.json";
const SMOKE_NOTE = "_json-smoke-block.md";
const SMOKE_REPAIR_NOTE = "_json-smoke-repair.md";

/** `--shot <pfad>`: Screenshot des Reparatur-Modals (Abschnitt F) fuer die Abnahme. */
let shotPfad: string | null = null;

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

/** `.jsonc`-Probe fuer den Reorder: jeder Schluessel traegt einen anhaengenden Kommentar,
 *  und „Abschnitt" ist durch eine Leerzeile abgetrennt — die Zeile, die NICHT mitwandern
 *  darf. Ohne sie waere der Pruefpunkt blind fuer die halbe Regel. */
const SMOKE_JSONC_REORDER = [
  "{",
  "  // gehoert zu a",
  '  "a": 1,',
  "",
  "  // Abschnitt",
  "",
  "  // gehoert zu b",
  '  "b": 2',
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

/**
 * Wie `inView`, aber als **Ausdruck** — `klick()` bekommt sein Ziel als Expression, nicht
 * als Statement-Block.
 *
 * Warum das nicht kosmetisch ist: die Messungen liefen laengst ueber `inView`, die KLICKS
 * aber über `document.querySelector`. Fallen beide auseinander, klickt der Treiber auf ein
 * anderes Element als das, an dem er hinterher misst. Eine Markdown-Ansicht haelt
 * Editor- und Lesemodus-Container **gleichzeitig** im DOM — der inaktive ist 0x0, steht im
 * Dokument aber VORNE. `document.querySelector(".json-codeblock-copy")` traf deshalb
 * zuverlaessig den unsichtbaren Zwilling (gemessen 2026-09-02: 4 Karten, 2 Knoepfe, ein
 * einziges Blatt).
 */
const elImView = (body: string): string => `(() => {
  const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
  const root = leaf?.view?.containerEl;
  if (!root) return null;
  ${body}
})()`;

/**
 * Ein ECHTER Tastendruck ueber den Host, nicht `new KeyboardEvent(...)`.
 *
 * Die Brücke kennt bisher nur `clickReal`; fuer Tasten gibt es kein Primitiv, also wird
 * `Input.dispatchKeyEvent` hier direkt gesendet — dieselbe Bauart, vier Zeilen. Wandert in
 * `tools/obsidian-cdp/`, sobald ein zweites Repo es braucht (n=2), nicht vorher.
 *
 * `modifiers: 1` ist Alt. Ein synthetisches Event traegt `isTrusted: false` und liefe an
 * jedem Host-Pfad vorbei, der an echter Eingabe haengt.
 */
async function pressKey(cdp: Cdp, key: string, modifiers = 0): Promise<void> {
  const codes: Record<string, number> = { ArrowDown: 40, ArrowUp: 38 };
  const common = { key, code: key, windowsVirtualKeyCode: codes[key] ?? 0, modifiers };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...common });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
}

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

      // B5 — die A11y-Ansage-Region traegt Text, den NIEMAND sehen soll. Der Unit-Test dazu
      // prueft die CSS-QUELLE (`position: absolute`, `clip-path`, kein `display: none`) und
      // kann nicht sagen, ob das auch WIRKT. Genau diese Haelfte misst hier der echte
      // Browser — und zwar in beide Richtungen, denn beide Fehler sind moeglich: sichtbar
      // (Text steht im Baum) und stumm (`display: none` nimmt das Element aus dem
      // Accessibility-Tree, dann wird nie etwas angesagt).
      const region = await cdp.evaluate<{
        w: number;
        h: number;
        display: string;
        visibility: string;
      } | null>(
        inView(`
          const el = root.querySelector(".json-a11y-announce");
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            w: Math.round(r.width),
            h: Math.round(r.height),
            display: cs.display,
            visibility: cs.visibility,
          };
        `),
      );
      const unsichtbar = Boolean(region && region.w <= 2 && region.h <= 2);
      const hoerbar = Boolean(
        region && region.display !== "none" && region.visibility !== "hidden",
      );
      check(
        "B5 A11y-Ansage-Region ist unsichtbar, aber nicht stumm",
        Boolean(region) && unsichtbar && hoerbar,
        !region
          ? "keine .json-a11y-announce in der Ansicht"
          : `${region.w}x${region.h}px, display: ${region.display}, visibility: ${region.visibility}`,
      );
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
        await klick(cdp, elImView(`return root.querySelector('.json-row[data-path="nested.deep.leaf"] .json-key');`));
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
        const geklickt = await klick(
          cdp,
          elImView(`
            const segs = [...root.querySelectorAll(".bc-seg")];
            return segs.length ? segs[segs.length - 1] : null;
          `),
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
      const geklickt = await klick(
        cdp,
        elImView(`return root.querySelector('.json-row[data-path="marker"] .json-editable');`),
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
      // Die Vorbedingung gehoert MITGEPRUEFT, sonst misst dieser Punkt nichts: stand der
      // Ausgangswert vor dem Undo noch in der Datei (weil die Aenderung aus D2 gar nicht
      // ankam), dann ist „Ausgangswert zurueck" trivial wahr — der Punkt waere gruen, ohne
      // dass Undo irgendetwas getan haette. Gemessen 2026-09-02 mit `--klick-gegenprobe`:
      // ohne Klick fielen C2/D1/D2/D4/E3, D3 blieb als einziger faelschlich gruen.
      check(
        "D3 Undo stellt den Dateiinhalt wieder her",
        Boolean(nachEdit) && undoOk && Boolean(nachUndo),
        !nachEdit
          ? "Szene ungültig: die Änderung aus D2 stand gar nicht in der Datei — Undo hatte nichts rückgängig zu machen"
          : nachUndo
            ? "Ausgangswert zurück"
            : `Ausgangswert nicht zurück (Befehl lief: ${undoOk ? "ja" : "nein"}, canUndo: ${undoLage.kannUndo ? "ja" : "nein"}, aktive Datei: ${undoLage.aktiv})`,
      );

      // D4 — der duale Mutationspfad: eine `.jsonc`-Änderung darf die Kommentare nicht
      // wegwerfen. Auch das ist nur an der geschriebenen Datei zu sehen.
      await openJsonFile(cdp, SMOKE_JSONC, SMOKE_JSONC_TEXT);
      await runCommand(cdp, "expand-all");
      const jsoncGeklickt = await klick(
        cdp,
        elImView(`return root.querySelector('.json-row[data-path="wert"] .json-editable');`),
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

      // D5 — Reorder nimmt den anhaengenden Kommentar mit (seit 2026-09-02). Gefahren wird
      // der Nutzerweg per Tastatur (Alt+Pfeil), nicht die Kernfunktion: gemessen werden soll
      // die ganze Kette Zeile → TreeView → jsonc.ts → Platte, und die Kernfunktion hat ihre
      // eigenen 7 Unit-Tests. Die zweite Haelfte der Regel steht mit in der Szene: der durch
      // eine Leerzeile abgetrennte Kommentar darf NICHT mitwandern.
      const REORDER = "_json-smoke-reorder.jsonc";
      await openJsonFile(cdp, REORDER, SMOKE_JSONC_REORDER);
      await runCommand(cdp, "expand-all");
      const zeileAktiv = await klick(
        cdp,
        elImView(`return root.querySelector('.json-row[data-path="a"] .json-key');`),
      );
      await pressKey(cdp, "ArrowDown", 1);
      // Gewartet wird auf einen Zustand, den es VOR der Bewegung nicht gibt. Die erste
      // Fassung pollte auf `"b"` — das stand schon in der Ausgangsdatei, der Poll kehrte
      // sofort zurueck und mass den Vorzustand. Der Schreibweg ist debounced (~2 s):
      // 500 ms nach der Taste traegt die Ansicht die neue Reihenfolge und die Platte noch
      // die alte (gemessen 2026-09-02).
      const bewegt = await fileContains(cdp, REORDER, "{\n  // gehoert zu b");
      // Gemessen wird die REIHENFOLGE der Marker in der Datei, nicht ihr blosses Vorkommen —
      // „alle vier noch da" war der alte Zustand und waere gruen geblieben.
      const reihenfolge = bewegt
        ? ["// gehoert zu b", '"b"', "// gehoert zu a", '"a"'].map((m) => bewegt.indexOf(m))
        : [];
      const sortiert = reihenfolge.every((v, i) => v >= 0 && (i === 0 || v > reihenfolge[i - 1]));
      const abschnittBlieb = Boolean(
        bewegt && bewegt.indexOf("// Abschnitt") > bewegt.indexOf('"b"'),
      );
      check(
        "D5 Reorder nimmt den anhängenden Kommentar mit, den abgetrennten nicht",
        zeileAktiv && sortiert && abschnittBlieb,
        !bewegt
          ? "Datei nicht lesbar"
          : !sortiert
            ? `Kommentar folgte seinem Element nicht (Marker-Positionen: ${reihenfolge.join(", ")})`
            : abschnittBlieb
              ? "anhängend gewandert, abgetrennt geblieben"
              : "der durch eine Leerzeile abgetrennte Kommentar ist mitgewandert",
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
      // Der Knopf wird im SICHTBAREN Lesemodus-Container gesucht, wie E1/E2 auch. Ohne
      // diesen Scope trifft die Suche den Zwilling im Editor-Container: vorne im Dokument,
      // 0x0 gross, und der Pruefpunkt meldet „Knopf nicht gefunden" fuer einen Knopf, der
      // einwandfrei da ist (gemessen 2026-09-02).
      const kopiert = await klick(
        cdp,
        elImView(`return root.querySelector(".markdown-reading-view .json-codeblock-copy");`),
      );
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
          inView(`
            const b = root.querySelector(".markdown-reading-view .json-codeblock-copy");
            return (b?.textContent ?? "").trim();
          `),
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
  {
    key: "repair",
    title: "F — Reparatur per LLM (Fake-Endpunkt, Diff-Modal, Anwenden)",
    run: async (cdp) => {
      // Ein Fake-Endpunkt im Node-Prozess: die Antwort steuert der Lauf, damit der Pruefpunkt
      // die Reparatur misst und nicht die Laune eines Modells. `letzter` haelt den Request
      // fest, den das Plugin wirklich gesendet hat.
      let modus: "ok" | "kaputt" = "ok";
      let letzter: Record<string, unknown> | null = null;
      const server: Server = createServer((req, res) => {
        const antwort = (code: number, body: unknown): void => {
          res.writeHead(code, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        };
        if (req.method === "GET" && req.url?.startsWith("/v1/models")) {
          antwort(200, { data: [{ id: "qwen/qwen3.8-27b" }] });
          return;
        }
        if (req.method === "POST" && req.url?.startsWith("/v1/chat/completions")) {
          let raw = "";
          req.on("data", (c: Buffer) => { raw += c.toString(); });
          req.on("end", () => {
            letzter = JSON.parse(raw) as Record<string, unknown>;
            const content = modus === "ok" ? '{"a": 1, "b": [1, 2]}' : '{"a": 1,}';
            antwort(200, { model: "qwen/qwen3.8-27b", choices: [{ message: { content }, finish_reason: "stop" }] });
          });
          return;
        }
        antwort(404, {});
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const fakePort = (server.address() as { port: number }).port;
      try {
        await cdp.evaluate(`
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          plugin.settings.endpoints = [{ url: "http://127.0.0.1:${fakePort}", model: "qwen/qwen3.8-27b" }];
          plugin.settings.choice = {};
          plugin.repairService.invalidate();
          return true;
        `);

        const notiz = (block: string): string =>
          ["# Repair", "", `${fence}json`, block, fence, "", "danach steht Text", ""].join("\n");
        const vorher = notiz('{"a": 1, "b": [1, 2,,]');
        createdFiles.add(SMOKE_REPAIR_NOTE);
        await cdp.evaluate(`
          const path = ${JSON.stringify(SMOKE_REPAIR_NOTE)};
          const body = ${JSON.stringify(vorher)};
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
        const knopfSel = `.markdown-reading-view .json-codeblock.is-error .json-codeblock-repair`;
        const knopf = await pollUntil<boolean>(
          cdp,
          inView(`return root.querySelector(${JSON.stringify(knopfSel)}) ? true : null;`),
          15_000,
          400,
        );
        check("F1 Fehlerkarte zeigt den Reparatur-Knopf", Boolean(knopf), knopf ? "Knopf in der Titelzeile" : "kein Knopf");

        const geklickt = await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`));
        const diff = geklickt
          ? await pollUntil<{ links: string; rechts: string; anwenden: boolean }>(
              cdp,
              `
                const cols = document.querySelectorAll(".json-repair-modal .json-repair-col");
                if (cols.length !== 2) return null;
                const apply = document.querySelector(".json-repair-modal .modal-button-container button.mod-cta");
                return { links: cols[0].textContent, rechts: cols[1].textContent, anwenden: Boolean(apply) && !apply.disabled };
              `,
              15_000,
              300,
            )
          : null;
        check(
          "F2 Klick öffnet das Modal mit Diff, Anwenden ist frei",
          Boolean(diff) && diff!.links.includes(",,") && !diff!.rechts.includes(",,") && diff!.anwenden,
          diff ? "Original links, Vorschlag rechts, Anwenden aktiv" : geklickt ? "Modal ohne Diff" : "Knopf nicht klickbar",
        );
        const gesendet = letzter as { model?: string; stream?: boolean; temperature?: number; messages?: { content: string }[] } | null;
        check(
          "F3 Anfrage trägt Modell, Profilwerte und den Parser-Fehler",
          gesendet?.model === "qwen/qwen3.8-27b" && gesendet.stream === false && gesendet.temperature === 0.1
            && (gesendet.messages?.[1]?.content ?? "").includes("Parser error"),
          gesendet ? `model ${gesendet.model}, temperature ${gesendet.temperature}, stream ${gesendet.stream}` : "kein Request angekommen",
        );
        if (shotPfad !== null) {
          writeFileSync(shotPfad, await capture(cdp));
          console.log(`    (Screenshot: ${shotPfad})`);
        }

        // Anwenden: nur der Blockinhalt aendert sich, der Rest der Notiz bleibt byte-gleich.
        const angewendet = await klick(cdp, `document.querySelector(".json-repair-modal .modal-button-container button.mod-cta")`);
        const nachher = angewendet
          ? await pollUntil<string>(
              cdp,
              `
                const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_NOTE)});
                const text = await app.vault.read(file);
                return text.includes('"b": [1, 2]') && !text.includes(",,") ? text : null;
              `,
              8000,
              300,
            )
          : null;
        const soll = vorher.replace('{"a": 1, "b": [1, 2,,]', '{"a": 1, "b": [1, 2]}');
        check(
          "F4 Anwenden ersetzt nur den Blockinhalt, der Rest bleibt byte-gleich",
          nachher === soll,
          nachher === null ? "Datei unverändert" : nachher === soll ? "Datei = Soll" : "Datei weicht ab",
        );
        const zu = await pollUntil<boolean>(cdp, `return document.querySelector(".json-repair-modal") ? null : true;`, 5000, 250);
        // Ohne Klick gab es nie ein Modal, das sich schliessen koennte — „kein Modal da" waere sonst
        // ein falsches Gruen (Klick-Gegenprobe, 2026-09-25).
        check(
          "F5 Modal schließt nach Anwenden",
          angewendet && Boolean(zu),
          !angewendet ? "Anwenden nicht geklickt" : zu ? "geschlossen" : "noch offen",
        );

        // Ungueltige Modellantwort: Anwenden bleibt gesperrt, die Datei unangetastet.
        modus = "kaputt";
        await cdp.evaluate(`
          const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_NOTE)});
          await app.vault.modify(file, ${JSON.stringify(vorher)});
          return true;
        `);
        const wieder = await pollUntil<boolean>(
          cdp,
          inView(`return root.querySelector(${JSON.stringify(knopfSel)}) ? true : null;`),
          15_000,
          400,
        );
        const zweiterKlick = wieder ? await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`)) : false;
        const fehler = zweiterKlick
          ? await pollUntil<{ text: string; gesperrt: boolean }>(
              cdp,
              `
                const st = document.querySelector(".json-repair-modal .json-repair-status.is-error");
                if (!st) return null;
                const apply = document.querySelector(".json-repair-modal .modal-button-container button.mod-cta");
                return { text: st.textContent, gesperrt: Boolean(apply) && apply.disabled };
              `,
              15_000,
              300,
            )
          : null;
        const unveraendert = await cdp.evaluate<boolean>(`
          const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_NOTE)});
          return (await app.vault.read(file)) === ${JSON.stringify(vorher)};
        `);
        check(
          "F6 Ungültige Antwort sperrt Anwenden und lässt die Notiz unberührt",
          Boolean(fehler) && fehler!.gesperrt && unveraendert,
          fehler ? `Fehlertext gezeigt, Anwenden gesperrt, Datei ${unveraendert ? "unberührt" : "GEÄNDERT"}` : "kein Fehlerstatus",
        );
        await cdp.evaluate(`
          const b = document.querySelector(".json-repair-modal .modal-button-container button");
          if (b) b.click();
          return true;
        `);
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
        await cdp
          .evaluate(`
            const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            plugin.repairService.invalidate();
            return true;
          `)
          .catch(() => undefined);
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
  klickOptionen.haltenMs = Number(flag("halten") ?? 0);
  klickOptionen.gegenprobe = argv.includes("--klick-gegenprobe");
  shotPfad = flag("shot") ?? null;

  const sections = sectionArg ? SECTIONS.filter((s) => s.key === sectionArg) : SECTIONS;
  if (sections.length === 0) {
    throw new Error(
      `Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`,
    );
  }

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  if (klickOptionen.gegenprobe) {
    console.log(
      "⚠️  KLICK-GEGENPROBE: es wird nicht geklickt. Jeder klickabhaengige Pruefpunkt MUSS "
        + "rot werden — bleibt einer gruen, misst er etwas, das auch ohne den Klick wahr ist.",
    );
  }
  if (klickOptionen.haltenMs > 0) console.log(`Klick-Haltedauer: ${klickOptionen.haltenMs} ms`);
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
  // Die `ungeklaert`-Warnung gehoert in die Abschlusszeile, nicht nur nach oben ins
  // Protokoll: wer eine Runde faehrt, liest die letzte Zeile — und ein Lauf, dessen
  // Herkunft ungeprueft blieb, darf nicht aussehen wie einer, der belegt ist.
  let herkunftsWarnung: string | null = null;

  // Dieselbe Aufraeumarbeit wie im `finally` unten — als eigene Funktion, damit der
  // SIGINT/SIGTERM-Handler sie aufrufen kann, ohne Code zu duplizieren. Ein Ctrl-C mitten
  // im Lauf ueberspringt das `finally` NICHT (try/catch-Semantik), sondern beendet den
  // Node-Prozess sofort — ohne eigenen Handler blieben Pruefdateien, veraenderte Clipboard-
  // und Settings-Inhalte stehen.
  const cleanupState = async (): Promise<void> => {
    if (previousClipboard) {
      await cdp
        .evaluate(`
          try { await navigator.clipboard.writeText(${JSON.stringify(previousClipboard)}); } catch (e) {}
          return true;
        `)
        .catch(() => undefined);
    }
    if (!keep) {
      await cdp
        .evaluate(`
          const pfade = ${JSON.stringify([...createdFiles])};
          const blaetter = [];
          app.workspace.iterateAllLeaves((l) => blaetter.push(l));
          for (const blatt of blaetter) {
            const datei = blatt.view?.file?.path;
            if (datei && pfade.includes(datei)) blatt.detach();
          }
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
    if (previousSettings !== null) {
      const zurueck = async (): Promise<string> =>
        cdp
          .evaluate<string>(`
            const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            if (!plugin) return "(Plugin weg)";
            for (const key of Object.keys(plugin.settings)) delete plugin.settings[key];
            Object.assign(plugin.settings, JSON.parse(${JSON.stringify(previousSettings)}));
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
      let endstand = await zurueck();
      for (let runde = 0; runde < 5; runde++) {
        await new Promise((r) => setTimeout(r, 1200));
        const erneut = await zurueck();
        if (erneut === endstand) break;
        endstand = erneut;
      }
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
  };

  let signalCleanupRunning = false;
  const onAbortSignal = (signal: NodeJS.Signals) => {
    if (signalCleanupRunning) return;
    signalCleanupRunning = true;
    void (async () => {
      console.log(`\n\nAbbruch durch ${signal} — raeume Smoke-Zustand auf...`);
      await cleanupState();
      cdp.close();
      process.exit(130);
    })();
  };
  process.on("SIGINT", onAbortSignal);
  process.on("SIGTERM", onAbortSignal);

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

    const vaultInfo = await cdp.evaluate<{ name: string; basePath: string; configDir: string }>(`
      if (!window.app) return null;
      return {
        name: app.vault.getName(),
        basePath: app.vault.adapter.basePath,
        configDir: app.vault.configDir,
      };
    `);
    if (!vaultInfo?.name) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    console.log(`Vault: ${vaultInfo.name}`);

    // Laeuft dieser Lauf gegen den eigenen Stand? Die Frage, gegen die die Versionszeile
    // eine Zeile weiter unten strukturell blind ist: Store-Build und Repo-Build tragen
    // dieselbe Nummer. Am 2026-08-30 standen dachweit 69 von 150 gruenen Pruefpunkten auf
    // einem Build, der nicht belegt der Repo-Stand war — dieser Treiber war einer davon
    // (18/18 am 28.08. gegen die Store-Installation vom 23.08.).
    //
    // Der Pfad kommt aus der LAUFENDEN Instanz, nicht aus `stagingVaultDir(...)`: der
    // Treiber dockt per `--vault` an ein beliebiges Fenster an, und genau der Fehllauf
    // lief gegen einen fremden Vault. Ein Check gegen den konventionellen Staging-Pfad
    // haette also eine Datei geprueft, die mit dem Lauf nichts zu tun hat. Geprueft wird,
    // was gemessen wird (Lesson 2026-09-02, kuro-gamification).
    const pluginDir = join(vaultInfo.basePath, vaultInfo.configDir, "plugins", PLUGIN_ID);
    requireEigenerBuild(
      join(pluginDir, "main.js"),
      // Der Vergleichsstand muss FRISCH sein — `npm run deploy` baut ihn direkt davor.
      // Ohne ihn bleibt nur die billige Aussage (Store-Suffix ja/nein), und die belegt
      // den eigenen Stand nicht.
      join(cwd(), "main.js"),
      (meldung) => {
        herkunftsWarnung = meldung;
        console.warn(meldung);
      },
    );

    // Und dieselbe Frage fuer `styles.css`, denn der zentrale Guard kennt nur `main.js` —
    // `npm run deploy` kopiert aber beides. Abschnitt B misst **gerendertes CSS**
    // (Trennkomma-Geometrie, `display` des eingeklappten Teilbaums, Theme-Farben,
    // `[hidden]`-Sichtbarkeit); ein altes Stylesheet neben frischer `main.js` erzeugt dort
    // denselben unbelegten Stand, den der Guard eine Zeile hoeher gerade ausgeschlossen hat
    // — und er erschiene als Plugin-Befund, nicht als Deploy-Fehler.
    // Uebernommen aus local-image-generator (`e6fbb53`, via REGISTRY § Testing).
    const cssHerkunft = buildHerkunft(join(pluginDir, "styles.css"), join(cwd(), "styles.css"));
    if (cssHerkunft.art === "fehlt") {
      throw new Error(`Im Vault liegt kein styles.css: ${cssHerkunft.pfad}\nZuerst deployen.`);
    }
    if (cssHerkunft.art === "fremd") {
      const z = (n: number) => n.toLocaleString("de-DE");
      throw new Error(
        `Das styles.css im Vault ist nicht der gebaute Repo-Stand: ${cssHerkunft.pfad}\n` +
          `  im Vault: ${z(cssHerkunft.bytes)} Bytes\n` +
          `  gebaut:   ${z(cssHerkunft.erwarteteBytes)} Bytes\n` +
          "Abschnitt B misst gerendertes CSS. Zuerst deployen, dann erneut laufen.",
      );
    }

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

    // Alle Namen, die dieser Treiber je anlegt, tragen das Praefix `_json-smoke` (SMOKE_JSON/
    // SMOKE_JSONC/SMOKE_BAD/SMOKE_NOTE oben) — das macht liegen gebliebene Dateien aus einem
    // per SIGINT/SIGTERM abgebrochenen frueheren Lauf erkennbar, BEVOR dieser Lauf selbst
    // welche anlegt. `createdFiles` ist in diesem Lauf noch leer, das `finally` raeumt also
    // nur eigene Spuren weg, nie fremde.
    const leftover = await cdp.evaluate<string[]>(`
      const alle = [];
      app.vault.getAllLoadedFiles().forEach((f) => { if (f.path && f.path.startsWith("_json-smoke")) alle.push(f.path); });
      return alle;
    `);
    check(
      "Keine liegen gebliebenen Smoke-Dateien aus einem abgebrochenen frueheren Lauf",
      leftover.length === 0,
      leftover.length === 0
        ? "kein Rest im Vault"
        : `${leftover.length} Datei(en) gefunden und entfernt: ${leftover.join(", ")} — vermutlich Ctrl-C/Crash im vorigen Lauf vor dessen Aufraeumen; dieser Lauf faehrt normal weiter`,
    );
    if (leftover.length > 0) {
      await cdp.evaluate(`
        for (const path of ${JSON.stringify(leftover)}) {
          const file = app.vault.getAbstractFileByPath(path);
          if (file) await app.fileManager.trashFile(file);
        }
        return true;
      `);
    }

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
    // zurueck, wie er ihn vorgefunden hat. Dieselbe Funktion wie der SIGINT/SIGTERM-Handler
    // oben — kein Doppelcode.
    process.off("SIGINT", onAbortSignal);
    process.off("SIGTERM", onAbortSignal);
    await cleanupState();
    cdp.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`${results.length - failed.length}/${results.length} gruen`);
  if (herkunftsWarnung !== null) {
    console.log("⚠️  Herkunft des gemessenen Builds ungeprueft — s. Warnung oben.");
  }
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
