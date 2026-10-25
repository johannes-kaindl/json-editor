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
 * ## Lauf (Zweitinstanz, eigenes Profil, eigener Port — die reguläre Instanz wird nie angefasst)
 *
 * `--port` ist Pflicht (kein Standardport; 9222 gehört der regulären Instanz). Vertrauensdialog und Restricted
 * Mode eines frischen Profils erledigt `bereiteInstanzVor` (zentrale Brücke) vor der ersten Messung.
 *
 * ```bash
 * echo "$STAGING_VAULTS_DIR"                                       # muss gesetzt sein (~/.zshenv)
 * D="$STAGING_VAULTS_DIR/json-editor/.obsidian/plugins/json-editor"; mkdir -p "$D"
 * OBSIDIAN_PLUGIN_DIR="$D" npm run deploy                          # Vault von Hand eingerichtet (kein buildVault)
 * UD=/tmp/obs-test-json-editor; mkdir -p "$UD"
 * lsof -nP -iTCP:9398 -sTCP:LISTEN && echo "Port belegt — anderen nehmen"
 * pgrep -f "user-data-dir=$UD" && echo "Profil belegt — $UD-w19 nehmen, nie beenden"
 * cp ~/Library/Application\ Support/obsidian/obsidian-*.asar "$UD"/   # aktuelle Version statt gebündelter
 * node -e 'const p=process.env.STAGING_VAULTS_DIR+"/json-editor";require("fs").writeFileSync(process.argv[1]+"/obsidian.json",JSON.stringify({vaults:{"json-editor":{path:p,ts:Date.now(),open:true}},language:"en"}))' "$UD"
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9398 &   # je Messlauf frischer Prozess, PID merken
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label json-editor --intent "Smoke :9398" --exclusive focus --port 9398 --ttl 300
 * npm run smoke:gui -- --port 9398 --vault json-editor
 * npm run smoke:gui -- --port 9398 --vault json-editor --section layout --keep
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release            # danach nur die eigene PID beenden
 * ```
 *
 * Der erste Lauf nach der Profilanlage ist ein Aufwärmlauf und zählt nicht.
 *
 * Bilanz in vier Zuständen (CORE-TEST-19, `createBilanz`): grün · rot · übersprungen · nichts gemessen. Der
 * Nenner ist die Soll-Liste der gewählten Abschnitte (`PUNKTE_JE_SECTION`, ohne `--section` alle) plus der
 * Vorlauf-Punkt; ein nie aufgezeichneter Punkt zählt als „nichts gemessen“ (Exit 1), ein Abbruch ist Exit 2.
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

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";

import {
  type Cdp,
  attachTo,
  beimAbbruch,
  bereiteInstanzVor,
  closeExtraLeaves,
  entferneFakeManager,
  installFakeManager,
  istAbgebrochen,
  klicke,
  pollUntil,
  releaseAlwaysOnTop,
  requireVisible,
} from "../../tools/obsidian-cdp/cdp.js";
import { echoText, startLlmStub } from "../../tools/obsidian-cdp/llm-stub.js";
import { type Bilanz, createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import { capture } from "../../tools/obsidian-cdp/shot.js";
import { buildHerkunft, requireEigenerBuild } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "json-editor";
/** Interner View-Registrierungs-Key — NICHT die Plugin-id (`.claude/rules/ansicht-und-start.md`: nie ändern). */
const VIEW_TYPE = "json-editor-view";

/** Vom Lauf angelegte Dateien — das `finally` wirft sie gebündelt in den Papierkorb. */
const createdFiles = new Set<string>();

/**
 * Klick-Modus des Laufs — gesetzt aus `--halten` / `--klick-gegenprobe` (`parseArgs(...).klickModus()`).
 *
 * **Warum das ein Schalter ist und kein Handgriff:** ein Prüfpunkt hinter einem Klick kann
 * *grün am Falschen* sein — grün, obwohl der Klick nie ankam, weil die Bedingung schon
 * vorher wahr war. Das fällt nur auf, wenn man den Klick wegnimmt und **rot** erwartet.
 * Die Gegenprobe ist ein Flag, damit sie beim nächsten neuen Prüfpunkt einen Aufruf entfernt ist;
 * `--halten 150` misst die Schwelle, ab der ein Punkt kippt, statt sie zu schätzen. Der Klick-Weg
 * selbst (Lage vor dem Klick, Gegenprobe, Haltedauer) liegt zentral: `klicke` in `tools/obsidian-cdp/cdp.ts`.
 */
let klickModus: { haltenMs: number; gegenprobe: boolean } = { haltenMs: 0, gegenprobe: false };

/** Einziger Klick-Weg des Treibers — kein Prüfpunkt ruft `clickReal` direkt auf, sonst greift der Schalter nur bei der Hälfte. */
async function klick(cdp: Cdp, ausdruck: string): Promise<boolean> {
  return (await klicke(cdp, ausdruck, klickModus)).ok;
}

const SMOKE_JSON = "_json-smoke.json";
const SMOKE_JSONC = "_json-smoke.jsonc";
const SMOKE_BAD = "_json-smoke-bad.json";
const SMOKE_NOTE = "_json-smoke-block.md";
const SMOKE_EMBED_NOTE = "_json-smoke-embed.md";
const SMOKE_EMBED_FILE = "_json-smoke-embed.json";
const SMOKE_REPAIR_NOTE = "_json-smoke-repair.md";
const SMOKE_REPAIR_FILE = "_json-smoke-repair.json";

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

/** Soll-Liste je Abschnitt (der Nenner der Bilanz). `--section` fuehrt je Lauf nur einen Abschnitt aus; der Nenner
 *  ist dann dessen Liste plus der Vorlauf-Punkt, der in jedem Lauf misst. */
const PUNKTE_VORLAUF = ["Keine liegen gebliebenen Smoke-Dateien aus einem abgebrochenen frueheren Lauf"] as const;
const PUNKTE_JE_SECTION: Record<string, readonly string[]> = {
  ansicht: [
    "A1 .json öffnet in der Plugin-Ansicht",
    "A2 Tree rendert mit den erwarteten Schlüsseln",
    "A3 .jsonc mit Kommentar bleibt editierbar (kein Lossy-Banner)",
    "A4 Kaputtes JSON erzwingt Source-Modus + Fehler-Banner",
    "A5 Tree/Source-Pillen tragen aria-pressed und wechseln mit dem Modus",
  ],
  layout: [
    "B1 Trennkomma dockt am eingeklappten Wert an",
    "B2 Eingeklappter Teilbaum beansprucht keine Breite",
    "B3 Theme-Farben greifen (Key ≠ String, beide gesetzt)",
    "B4 [hidden]-Elemente sind wirklich unsichtbar",
    "B5 A11y-Ansage-Region ist unsichtbar, aber nicht stumm",
  ],
  navigation: [
    "C1 collapse-all / expand-all wirken auf alle Container",
    "C2 Sprung in einen eingeklappten Ast macht die Zeile sichtbar",
    "C3 Suche markiert Treffer und zählt sie",
  ],
  editieren: [
    "D1 Echter Klick auf einen Wert öffnet das Inline-Feld",
    "D2 Geänderter Wert landet auf der Platte",
    "D3 Undo stellt den Dateiinhalt wieder her",
    "D4 .jsonc-Edit erhält die Kommentare",
    "D5 Reorder nimmt den anhängenden Kommentar mit, den abgetrennten nicht",
    "D6 Löschen eines Objekts mit Kindern: keine Rückfrage, Meldung mit Rückgängig, der Knopf stellt es wieder her",
  ],
  codeblock: [
    "E1 Gültiger ```json-Block rendert als Tree",
    "E2 Kaputter Block fällt auf die Fehler-Karte zurück",
    "E3 Copy-Knopf schreibt in die Zwischenablage",
    "E4 ![[Datei.json]] zeigt im Lesemodus den eingeklappten Baum statt des Datei-Chips",
    "E5 Der Embed-Baum klappt auf Klick auf, und die Kopfzeile trägt den Dateinamen",
    "E6 Im Embed steht die Wurzel-Klammer links, nicht zentriert",
  ],
  repair: [
    "F1 Fehlerkarte zeigt den Reparatur-Knopf",
    "F2 Klick öffnet das Modal mit Diff, Anwenden ist frei",
    "F3 Anfrage trägt Modell, Profilwerte und den Parser-Fehler",
    "F4 Anwenden ersetzt nur den Blockinhalt, der Rest bleibt byte-gleich",
    "F5 Modal schließt nach Anwenden",
    "F6 Ungültige Antwort sperrt Anwenden und lässt die Notiz unberührt",
    "F7 Große Datei: die Anfrage trägt nur das Fenster, der Vorschlag die ganze Datei, Anwenden schreibt byte-genau",
    "G1 Bearer-Token geht geschwärzt raus, der Vorschlag trägt das Original zurück",
    "G2 PEM als JSON-String (\\n escaped) geht geschwärzt raus und kommt wertgleich zurück",
    "G3 PEM mit echten Zeilenumbrüchen (kaputtes JSON) kommt als gültiges JSON zurück",
    "G4 Kein apiKey in data.json — der Schlüssel liegt im Schlüsselbund",
    "CL1 Claude im Manager: der Endpunkt kommt nur mit Opt-in, das Plugin wählt ihn",
    "CL2 Reparatur gegen den Claude-Stub: Messages-API mit Schlüssel, ohne temperature, Vorschlag im Modal",
    "CL3 Fehler der API (529): das Modal zeigt ihn, Anwenden bleibt gesperrt, die Notiz unberührt",
  ],
  "repair-datei": [
    "H1 Das Fehler-Banner der Datei-Ansicht trägt den Reparatur-Knopf",
    "H2 Klick öffnet das Modal mit Diff, Anwenden ist frei",
    "H3 Anwenden schreibt den Vorschlag in die Datei, das Banner verschwindet",
    "H4 Rückgängig holt den kaputten Text zurück",
    "H5 Gemma 4 ohne Öffner: der Vorschlag ist das JSON, der Denktext steht nicht darin",
  ],
  einstellungen: [
    "I1 Der Einstellungs-Tab baut bei jedem Öffnen neu auf, nicht nur beim ersten",
  ],
};
/** Wird in `main` mit der Soll-Liste der gewaehlten Abschnitte neu gebildet; bis dahin ohne Nenner. */
let bilanz: Bilanz = createBilanz();
const check = (name: string, passed: boolean, detail = ""): void => bilanz.record(name, passed, detail);
/** „Bewusst nicht gemessen“ = der Gegenstand wurde nicht erreicht (hier: die Szene stellt ihn nicht her) — nichts gemessen, nie gruen. */
const unmeasured = (name: string, reason: string): void => bilanz.unmeasured(name, reason);

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

/** CL1–CL3 — Claude (Anthropic API) ueber den LLM Endpoint Manager (Kit 0.62.0, Opt-in `transports.anthropic` in
 *  `repair-service.ts`). Gegenstelle ist der zentrale LLM-Stub im Anthropic-Modus (Messages-API, streng bei Pfad,
 *  `x-api-key`, `anthropic-version`, Pflichtfeldern); kein Aufruf an api.anthropic.com. Der Fake-Manager der Bruecke
 *  liefert den Endpunkt nur, wenn der Aufrufer `anthropic` unter den Transporten verlangt — das ist die Kontrolle in CL1. */
async function pruefeClaude(cdp: Cdp, notiz: (block: string) => string): Promise<void> {
  const [CL1, CL2, CL3] = PUNKTE_JE_SECTION.repair!.filter((n) => n.startsWith("CL"));
  const MODELL = "claude-haiku-5-5";
  const SCHLUESSEL = "sk-ant-smoke-json-editor";
  const MANAGER = "llm-endpoint-manager";
  const knopfSel = `.markdown-reading-view .json-codeblock.is-error .json-codeblock-repair`;
  const kaputt = '{"a": 1, "b": [1, 2,,]';
  let fehlerModus = false;
  let manager = false;
  const stub = await startLlmStub({
    cors: false,
    anbieter: "anthropic",
    schluessel: SCHLUESSEL,
    models: [{ id: MODELL, capabilities: { effort: { supported: true }, thinking: { types: { adaptive: { supported: true } } } } }],
    antwort: () => (fehlerModus ? { status: 529, fehler: "Overloaded", model: MODELL } : { text: '{"a": 1, "b": [1, 2]}', model: MODELL }),
  });
  try {
    await installFakeManager(cdp, {
      pluginId: MANAGER,
      endpunkte: [{
        id: "fake-claude", label: "Claude API", url: stub.url, models: [MODELL], defaultModel: MODELL, configModel: "default",
        provider: "anthropic", backend: "anthropic", apiKey: SCHLUESSEL, hasSecret: true, transport: "anthropic",
      }],
      invalidiere: [PLUGIN_ID],
    });
    manager = true;
    const sicht = await cdp.evaluate<{ ohne: number; mit: number; quelle: string; modell: string; familie: string | null; backend: string }>(`
      const api = app.plugins.plugins[${JSON.stringify(MANAGER)}].api;
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.choice = {};
      p.llm.invalidate();
      await p.llm.resolve({ force: true });
      const src = p.llm.source();
      return {
        ohne: api.list({ capability: "chat" }).length,
        mit: api.list({ capability: "chat", transports: ["http", "anthropic"] }).length,
        quelle: src.backendSource, modell: src.model, familie: src.family, backend: src.backend,
      };
    `);
    check(
      CL1!,
      sicht.ohne === 0 && sicht.mit === 1 && sicht.quelle === "manager" && sicht.modell === MODELL && sicht.backend === "anthropic" && sicht.familie === "claude",
      `Kontrolle am Fake: list() ohne transports ${sicht.ohne}, mit ["http","anthropic"] ${sicht.mit}; Plugin: Backend ${sicht.backend} (Quelle ${sicht.quelle}), Familie ${String(sicht.familie)}, Modell ${sicht.modell}`,
    );

    const knopfDa = (): Promise<boolean | null> =>
      pollUntil<boolean>(cdp, inView(`return root.querySelector(${JSON.stringify(knopfSel)}) ? true : null;`), 15_000, 400);
    const schreibe = (block: string): Promise<unknown> =>
      cdp.evaluate(`
        const path = ${JSON.stringify(SMOKE_REPAIR_NOTE)};
        const body = ${JSON.stringify(notiz(block))};
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
    const schliesse = (): Promise<unknown> =>
      cdp.evaluate(`
        const b = document.querySelector(".json-repair-modal .modal-button-container button");
        if (b) b.click();
        return true;
      `);

    // CL2 — ein Lauf bis ins Diff-Modal
    createdFiles.add(SMOKE_REPAIR_NOTE);
    stub.loescheMitschnitt();
    await schreibe(kaputt);
    const da = await knopfDa();
    const geklickt = da ? await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`)) : false;
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
    const anfragen = stub.anfragen().filter((a) => a.route === "messages");
    const letzte = anfragen.at(-1);
    const body = (letzte?.json ?? {}) as Record<string, unknown>;
    const kopf = letzte?.header ?? {};
    const verbotene = ["temperature", "top_p", "top_k", "min_p", "presence_penalty"].filter((k) => k in body);
    // Untergrenze des Antwortbudgets (`repairMaxTokens`, `src/core/repair/client.ts`): der Block ist kurz. Nicht importiert, weil der
    // Kern `jsonc-parser` mitzieht, den der Node-Bundle des Treibers nicht aufloest.
    const budget = 2048;
    const drahtOk = anfragen.length > 0 && body.model === MODELL && kopf["x-api-key"] === SCHLUESSEL
      && typeof kopf["anthropic-version"] === "string" && body.max_tokens === budget && body.stream !== true && verbotene.length === 0
      && stub.anfragen().every((a) => a.route !== "chat");
    check(
      CL2!,
      drahtOk && Boolean(diff) && diff!.links.includes(",,") && !diff!.rechts.includes(",,") && diff!.anwenden,
      `Anfragen ${anfragen.length}, x-api-key ${kopf["x-api-key"] === SCHLUESSEL ? "ok" : "FALSCH"}, anthropic-version ${String(kopf["anthropic-version"])}, max_tokens ${String(body.max_tokens)} (Budget ${budget}), stream ${String(body.stream)} (Messages-API: fehlt = aus), verbotene Felder: ${verbotene.length === 0 ? "keine" : verbotene.join(",")}; Modal ${diff ? "mit Diff, Anwenden aktiv" : geklickt ? "ohne Diff" : "nicht geoeffnet"}`,
    );
    await schliesse();
    await pollUntil<boolean>(cdp, `return document.querySelector(".json-repair-modal") ? null : true;`, 5000, 250);

    // CL3 — die API antwortet 529
    fehlerModus = true;
    await schreibe('{"a": 1, "b": [1, 2,,], "c": 3');
    const wieder = await knopfDa();
    const zweiter = wieder ? await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`)) : false;
    const fehler = zweiter
      ? await pollUntil<{ text: string; gesperrt: boolean }>(
          cdp,
          `
            const st = document.querySelector(".json-repair-modal .json-repair-status.is-error");
            if (!st) return null;
            const apply = document.querySelector(".json-repair-modal .modal-button-container button.mod-cta");
            return { text: st.textContent, gesperrt: !apply || apply.disabled };
          `,
          15_000,
          300,
        )
      : null;
    const unveraendert = await cdp.evaluate<boolean>(`
      const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_NOTE)});
      return (await app.vault.read(file)) === ${JSON.stringify(notiz('{"a": 1, "b": [1, 2,,], "c": 3'))};
    `);
    check(
      CL3!,
      Boolean(fehler) && /529|overload/i.test(fehler!.text) && fehler!.gesperrt && unveraendert,
      fehler ? `Meldung ${JSON.stringify(fehler.text.slice(0, 90))}, Anwenden ${fehler.gesperrt ? "gesperrt" : "FREI"}, Datei ${unveraendert ? "unberuehrt" : "GEAENDERT"}` : zweiter ? "kein Fehlerstatus im Modal" : "Knopf nicht klickbar",
    );
    await schliesse();
  } catch (e) {
    const schon = new Set(bilanz.eintraege().map((x) => x.name));
    for (const n of [CL1, CL2, CL3]) if (n !== undefined && !schon.has(n)) unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    if (manager) await entferneFakeManager(cdp, { pluginId: MANAGER, invalidiere: [PLUGIN_ID] }).catch(() => undefined);
    await stub.stop();
  }
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

      // A5 — Tree/Source-Pillen sind Zustands-Knoepfe (UI-STANDARD §8): aria-pressed folgt dem Modus.
      const pillen = `[...root.querySelectorAll(".json-mode-pill")].map((b) => b.getAttribute("aria-pressed"))`;
      const offen5 = await openJsonFile(cdp, SMOKE_JSON, JSON.stringify(SMOKE_DATA, null, 2));
      const vorherPillen = offen5 ? await cdp.evaluate<Array<string | null>>(inView(`return ${pillen};`)) : [];
      const geklickt5 = offen5 && (await klick(cdp, elImView(`return root.querySelectorAll(".json-mode-pill")[1] ?? null;`)));
      const nachherPillen = geklickt5
        ? await pollUntil<Array<string | null>>(
            cdp,
            inView(`const a = ${pillen}; return a[1] === "true" ? a : null;`),
            5000,
            250,
          )
        : null;
      // Zustand zurueck: die folgenden Abschnitte setzen den Tree-Modus voraus (die Ansicht behaelt ihn beim Wiederoeffnen).
      if (geklickt5) {
        await klick(cdp, elImView(`return root.querySelectorAll(".json-mode-pill")[0] ?? null;`));
        await pollUntil<boolean>(cdp, inView(`return root.querySelector(".json-tree-root") ? true : null;`), 5000, 250);
      }
      check(
        "A5 Tree/Source-Pillen tragen aria-pressed und wechseln mit dem Modus",
        JSON.stringify(vorherPillen) === '["true","false"]' && JSON.stringify(nachherPillen) === '["false","true"]',
        `vorher ${JSON.stringify(vorherPillen)}, nach Klick auf Source ${JSON.stringify(nachherPillen)}`,
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
        unmeasured("B4 [hidden]-Elemente sind wirklich unsichtbar", "kein [hidden]-Element in dieser Szene");
      } else {
        check(
          "B4 [hidden]-Elemente sind wirklich unsichtbar",
          versteckt.sichtbar.length === 0,
          `${versteckt.gefunden} geprüft${versteckt.sichtbar.length ? `, sichtbar trotz hidden: ${versteckt.sichtbar.join(", ")}` : ""}`,
        );
      }

      // B5 — die A11y-Ansage-Region traegt Text, den NIEMAND sehen soll. Der Unit-Test dazu
      // prueft die CSS-QUELLE (`position: absolute`, 1 px, `overflow: hidden`, kein `display: none`) und
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
        unmeasured("C2 Sprung in einen eingeklappten Ast macht die Zeile sichtbar", "Zielzeile nicht im Baum");
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

      // D6 — Löschen mit Inhalt (Welle 23, Entscheidung Johannes 2026-10-15): keine Rückfrage, die Zeile ist sofort weg, die Meldung
      // nennt sie und trägt „Undo“. Gemessen werden beide Hälften an der Datei auf der Platte: weg nach dem Löschen, zurück nach dem
      // Klick auf den Knopf der Meldung. Die Meldung ist Obsidians geteilter Toast; gesucht wird nach dem eigenen Knopf.
      await openJsonFile(cdp, SMOKE_JSON, JSON.stringify(SMOKE_DATA, null, 2));
      await runCommand(cdp, "expand-all");
      const geloescht = await klick(
        cdp,
        elImView(`return [...root.querySelectorAll('.json-row[data-path="liste"] .json-row-delete')].at(-1) ?? null;`),
      );
      const weg = geloescht ? await pollUntil<boolean>(cdp, `
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_JSON)});
        const t = await app.vault.read(f);
        return t.includes("alpha") ? null : true;
      `, 8000, 300) : null;
      const meldung = weg
        ? await pollUntil<string>(cdp, `
            const k = [...(typeof activeDocument !== "undefined" ? activeDocument : document).querySelectorAll(".notice .json-delete-undo")][0];
            return k ? (k.parentElement?.textContent ?? "") : null;
          `, 4000, 200)
        : null;
      if (shotPfad !== null && meldung) writeFileSync(shotPfad.replace(/(\.png)?$/, "-loeschen.png"), await capture(cdp));
      const zurueck = meldung
        ? await klick(cdp, `[...(typeof activeDocument !== "undefined" ? activeDocument : document).querySelectorAll(".notice .json-delete-undo")][0] ?? null`)
        : false;
      const wieder = zurueck ? await fileContains(cdp, SMOKE_JSON, "alpha") : null;
      check(
        "D6 Löschen eines Objekts mit Kindern: keine Rückfrage, Meldung mit Rückgängig, der Knopf stellt es wieder her",
        Boolean(weg) && Boolean(meldung) && Boolean(wieder),
        !geloescht ? "Löschen-Knopf nicht klickbar" : !weg ? "Zeile blieb in der Datei" : !meldung ? "keine Meldung mit Rückgängig-Knopf" : wieder ? `weg, Meldung „${meldung.trim()}“, per Knopf zurück` : "Knopf stellte die Zeile nicht wieder her",
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
        unmeasured("E3 Copy-Knopf schreibt in die Zwischenablage", "Knopf nicht gefunden");
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

      // E4/E5 — Datei-Embed im Lesemodus (Welle 23): `![[x.json]]` zeigt den Inhalt als eingeklappten Baum statt des Datei-Chips.
      // Gemessen am sichtbaren Lesemodus-Container wie E1/E2. Der Chip ist Obsidians Standard fuer ein Embed ohne eigene Darstellung;
      // Gegenprobe ist die Abwesenheit des Posters (Registrierung entfernen: kein `.json-file-embed`, E4 rot).
      createdFiles.add(SMOKE_EMBED_NOTE);
      createdFiles.add(SMOKE_EMBED_FILE);
      const embedDaten = JSON.stringify({ name: "embed-probe", settings: { depth: { deep: 1 } }, list: [1, 2, 3] }, null, 2);
      await cdp.evaluate(`
        const schreibe = async (path, body) => {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) await app.vault.modify(existing, body);
          else await app.vault.create(path, body);
        };
        await schreibe(${JSON.stringify(SMOKE_EMBED_FILE)}, ${JSON.stringify(embedDaten)});
        await schreibe(${JSON.stringify(SMOKE_EMBED_NOTE)}, ${JSON.stringify(`# Embed\n\nVorher.\n\n![[${SMOKE_EMBED_FILE}]]\n\nNachher.\n`)});
        const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_EMBED_NOTE)});
        let leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
        if (!leaf || !leaf.parent) leaf = app.workspace.getLeaf(true);
        await leaf.openFile(file, { state: { mode: "preview" } });
        app.workspace.setActiveLeaf(leaf, { focus: true });
        return true;
      `);
      const embed = await pollUntil<{ baum: boolean; zeilen: number; eingeklappt: number; chip: boolean; label: string }>(
        cdp,
        `
          const preview = document.querySelector(".markdown-reading-view");
          const el = preview?.querySelector(".json-file-embed");
          if (!el || !el.querySelector(".json-tree-root")) return null;
          return {
            baum: true,
            zeilen: el.querySelectorAll(".json-row").length,
            eingeklappt: el.querySelectorAll(".json-content.collapsed").length,
            chip: Boolean(preview.querySelector(".file-embed-title")),
            label: (el.querySelector(".json-codeblock-label")?.textContent ?? "").trim(),
          };
        `,
        15_000,
        400,
      );
      check(
        "E4 ![[Datei.json]] zeigt im Lesemodus den eingeklappten Baum statt des Datei-Chips",
        Boolean(embed) && embed!.eingeklappt > 0 && embed!.zeilen > 0,
        embed ? `${embed.zeilen} Zeile(n), ${embed.eingeklappt} eingeklappte(r) Teilbaum/-bäume, Datei-Chip ${embed.chip ? "DA" : "weg"}` : "kein Baum im Embed (Standard-Chip?)",
      );
      if (shotPfad !== null && embed) writeFileSync(shotPfad.replace(/(\.png)?$/, "-embed.png"), await capture(cdp));
      const aufgeklappt = embed
        ? await klick(cdp, `document.querySelector(".markdown-reading-view .json-file-embed .json-container.is-collapsed .json-collapse-toggle")`)
        : false;
      const nachKlick = aufgeklappt
        ? await pollUntil<number>(
            cdp,
            `
              const n = document.querySelectorAll(".markdown-reading-view .json-file-embed .json-content.collapsed").length;
              return n < ${embed ? embed.eingeklappt : 0} ? n : null;
            `,
            6000,
            300,
          )
        : null;
      check(
        "E5 Der Embed-Baum klappt auf Klick auf, und die Kopfzeile trägt den Dateinamen",
        embed !== null && embed.label === SMOKE_EMBED_FILE && nachKlick !== null,
        embed ? `Kopfzeile „${embed.label}“, ${aufgeklappt ? (nachKlick !== null ? `nach Klick ${nachKlick} eingeklappt` : "Klick ohne Wirkung") : "Toggle nicht klickbar"}` : "nicht messbar (E4 fehlt)",
      );

      // E6 — der Datei-Embed ist Obsidians `.internal-embed.file-embed`; sein Theme setzt `text-align: center`, und die
      // Wurzelzeile erbte es (Klammern mitten im Block, Abnahme des Masters am Screenshot, Welle 23). Gemessen wird die Lage
      // der oeffnenden Wurzel-Klammer im Embed: links, also nahe dem linken Rand des Baums, und `text-align` nicht `center`.
      const lage = await cdp.evaluate<{ align: string; links: number; breite: number } | null>(`
        const el = document.querySelector(".markdown-reading-view .json-file-embed");
        const klammer = el?.querySelector(".json-tree-root > .json-container > .json-bracket");
        if (!el || !klammer) return null;
        const root = el.querySelector(".json-tree-root").getBoundingClientRect();
        return { align: getComputedStyle(klammer).textAlign, links: klammer.getBoundingClientRect().left - root.left, breite: root.width };
      `);
      check(
        "E6 Im Embed steht die Wurzel-Klammer links, nicht zentriert",
        lage !== null && lage.align !== "center" && lage.links < lage.breite * 0.25,
        lage ? `text-align ${lage.align}, Klammer ${Math.round(lage.links)} px vom linken Rand bei ${Math.round(lage.breite)} px Breite` : "Klammer nicht gefunden",
      );
    },
  },
  {
    key: "repair",
    title: "F — Reparatur per LLM (Fake-Endpunkt, Diff-Modal, Anwenden)",
    run: async (cdp) => {
      // Ein Fake-Endpunkt im Node-Prozess (zentraler LLM-Stub): die Antwort steuert der Lauf, damit der Pruefpunkt
      // die Reparatur misst und nicht die Laune eines Modells. Der Mitschnitt haelt den Request fest, den das
      // Plugin wirklich gesendet hat. Bewusst OHNE CORS (`cors: false`): die Reparatur fragt mit `stream: false`
      // ueber den Obsidian-Transport (`src/obsidian/repair-service.ts`), nicht ueber den Browser.
      let modus: "ok" | "kaputt" | "echo" | "fenster" = "ok";
      const stub = await startLlmStub({
        cors: false,
        models: ["qwen/qwen3.8-27b"],
        antwort: (a) => {
          // „echo": das Modell gibt das gesendete Dokument zurueck, ein Trennkomma vor `}` weniger —
          // so misst der Lauf, was von der Schwaerzung auf dem Draht ankommt und was zurueckkehrt.
          const frage = echoText(a.json) ?? "";
          const doc = frage.split("Document:\n")[1] ?? "";
          // „fenster": auf einen Ausschnitt (Kopfwort `Excerpt:`) antwortet das Modell mit dessen Zeilen, ein fehlendes Komma ergaenzt;
          // eine Anfrage mit dem GANZEN Dokument beantwortet es unveraendert — und damit falsch, F7 wuerde rot.
          const ausschnitt = frage.split("Excerpt:\n")[1];
          const text =
            modus === "fenster"
              ? ausschnitt !== undefined
                ? ausschnitt.replace(/("x{40}\d+")\n/, "$1,\n")
                : doc
              : modus === "echo"
                ? doc.replace(/,(\s*)}/, "$1}")
                : modus === "ok"
                  ? '{"a": 1, "b": [1, 2]}'
                  : '{"a": 1,}';
          return { text, model: "qwen/qwen3.8-27b" };
        },
      });
      const fakePort = stub.port;
      const letzter = (): Record<string, unknown> | null => (stub.letzte("chat")?.json as Record<string, unknown> | null | undefined) ?? null;
      const letzterRoh = (): string => stub.letzte("chat")?.body ?? "";
      try {
        await cdp.evaluate(`
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          plugin.settings.endpoints = [{ url: "http://127.0.0.1:${fakePort}", model: "qwen/qwen3.8-27b" }];
          plugin.settings.choice = {};
          plugin.llm.invalidate();
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
        const gesendet = letzter() as { model?: string; stream?: boolean; temperature?: number; messages?: { content: string }[] } | null;
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

        // F7 — grosse Datei (Welle 27): ueber der Schwelle geht nur das Fenster um die Fehlerstelle an das Modell, der Vorschlag im
        // Modal traegt trotzdem die GANZE Datei, und Anwenden schreibt sie byte-genau. 400 Eintraege mit je 40 Fuellzeichen sind ein
        // Block von rund 24.000 Zeichen und 402 Zeilen, die Schwelle liegt bei 200 Zeilen; das Komma fehlt mitten im Block.
        // Gemessen wird die Laenge des Anfragekoerpers am Draht (der Stub haelt ihn fest) gegen die Laenge des Blocks, dazu, dass
        // weder der erste noch der letzte Eintrag darin steht. Gegenprobe: die Schwelle auf „nie Fenster" stellen — die Anfrage traegt
        // dann das ganze Dokument, der Stub antwortet unveraendert, F7 wird rot.
        modus = "fenster";
        stub.loescheMitschnitt();
        const eintrag = (i: number): string => `  "k${i}": "${"x".repeat(40)}${i}"`;
        const FEHLER_BEI = 200;
        const gut7 = `{\n${Array.from({ length: 400 }, (_, i) => `${eintrag(i)}${i < 399 ? "," : ""}`).join("\n")}\n}`;
        const kaputt7 = gut7.replace(`${eintrag(FEHLER_BEI)},`, eintrag(FEHLER_BEI));
        // Die Notiz wird in der Leaf neu geöffnet und aktiviert wie am Anfang des Abschnitts.
        await cdp.evaluate(`
          const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_NOTE)});
          await app.vault.modify(file, ${JSON.stringify(notiz(kaputt7))});
          let leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
          if (!leaf || !leaf.parent) leaf = app.workspace.getLeaf(true);
          await leaf.openFile(file, { state: { mode: "preview" } });
          app.workspace.setActiveLeaf(leaf, { focus: true });
          return true;
        `);
        // Warten auf die Karte des NEUEN Blocks in der LESEANSICHT: der alte Knopf steht, bis sie neu rendert, und neben ihr steht in
        // derselben Leaf der unsichtbare Live-Preview-Editor mit der alten Karte (`root.querySelector` ohne `.markdown-reading-view`
        // trifft zuerst ihn: erste Läufe, F7 rot). Der neue Fehler steht an einer Position ab 1000, der alte weit darunter.
        const da7 = await pollUntil<boolean>(
          cdp,
          inView(
            `const k = root.querySelector(".markdown-reading-view .json-codeblock.is-error .json-codeblock-error"); return k && /position \\d{4,}/.test(k.textContent) ? true : null;`,
          ),
          20_000,
          400,
        );
        const geklickt7 = Boolean(da7) && (await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`)));
        const diff7 = geklickt7
          ? await pollUntil<{ rechts: string; anwenden: boolean }>(
              cdp,
              `
                const cols = document.querySelectorAll(".json-repair-modal .json-repair-col");
                if (cols.length !== 2) return null;
                const apply = document.querySelector(".json-repair-modal .modal-button-container button.mod-cta");
                return { rechts: cols[1].textContent, anwenden: Boolean(apply) && !apply.disabled };
              `,
              20_000,
              300,
            )
          : null;
        const draht7 = letzterRoh();
        const angewendet7 = Boolean(diff7?.anwenden) && (await klick(cdp, `document.querySelector(".json-repair-modal .modal-button-container button.mod-cta")`));
        const soll7 = notiz(gut7);
        const platte7 = angewendet7
          ? await pollUntil<string>(
              cdp,
              `
                const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_NOTE)});
                const text = await app.vault.read(file);
                return text === ${JSON.stringify(soll7)} ? text : null;
              `,
              8000,
              300,
            )
          : null;
        const nurFenster =
          draht7.includes("Excerpt:") && !draht7.includes("Document:") && !draht7.includes(eintrag(0)) && !draht7.includes(eintrag(399)) && draht7.length < kaputt7.length / 4;
        const ganzerVorschlag = Boolean(diff7) && diff7!.rechts.includes(eintrag(0)) && diff7!.rechts.includes(eintrag(399)) && diff7!.rechts.includes(`${eintrag(FEHLER_BEI)},`);
        check(
          "F7 Große Datei: die Anfrage trägt nur das Fenster, der Vorschlag die ganze Datei, Anwenden schreibt byte-genau",
          nurFenster && ganzerVorschlag && platte7 === soll7,
          draht7 === ""
            ? da7
              ? `keine Anfrage angekommen (Knopf ${geklickt7 ? "geklickt" : "NICHT geklickt"}, Modal ${diff7 ? "mit Diff" : "ohne Diff"})`
              : `Karte des neuen Blocks nicht erschienen (Leseansicht zeigt weiter den alten Fehler)`
            : `Anfrage ${draht7.length} Zeichen bei ${kaputt7.length} im Block (${draht7.includes("Excerpt:") ? "Ausschnitt" : "GANZES Dokument"}), Vorschlag ${ganzerVorschlag ? "mit der ganzen Datei" : "OHNE die ganze Datei"}, Datei ${platte7 === soll7 ? "= Soll" : angewendet7 ? "weicht ab" : "nicht angewendet"}`,
        );
        await cdp.evaluate(`document.querySelector(".json-repair-modal .modal-button-container button:not(.mod-cta)")?.click(); return true;`).catch(() => undefined);

        // --- Verbindung (Kit): Schwaerzung, Schluesselbund -------------------------------
        // Ein Block mit Geheimnis durch das Modal schicken und die Spalten lesen.
        modus = "echo";
        const durchsModal = async (block: string): Promise<{ links: string; rechts: string } | null> => {
          stub.loescheMitschnitt();
          await cdp.evaluate(`
            const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_NOTE)});
            await app.vault.modify(file, ${JSON.stringify(notiz(block))});
            return true;
          `);
          const da = await pollUntil<boolean>(
            cdp,
            inView(`return root.querySelector(${JSON.stringify(knopfSel)}) ? true : null;`),
            15_000,
            400,
          );
          if (!da) return null;
          if (!(await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`)))) return null;
          const spalten = await pollUntil<{ links: string; rechts: string }>(
            cdp,
            `
              const cols = document.querySelectorAll(".json-repair-modal .json-repair-col");
              if (cols.length !== 2) return null;
              return { links: cols[0].textContent, rechts: cols[1].textContent };
            `,
            15_000,
            300,
          );
          await cdp.evaluate(`
            const b = document.querySelector(".json-repair-modal .modal-button-container button");
            if (b) b.click();
            return true;
          `);
          await pollUntil<boolean>(cdp, `return document.querySelector(".json-repair-modal") ? null : true;`, 5000, 250);
          return spalten;
        };
        const gueltig = (text: string): boolean => {
          try {
            JSON.parse(text);
            return true;
          } catch {
            return false;
          }
        };

        const bearer = "Bearer sk-live-abcdef0123456789ABCDEF";
        const v1 = await durchsModal(`{"auth": "${bearer}", "a": 1,}`);
        check(
          "G1 Bearer-Token geht geschwärzt raus, der Vorschlag trägt das Original zurück",
          Boolean(v1) && letzterRoh() !== "" && !letzterRoh().includes("sk-live-abcdef0123456789ABCDEF")
            && v1!.rechts.includes(bearer) && gueltig(v1!.rechts),
          v1
            ? `Draht ${letzterRoh().includes("sk-live-") ? "TRÄGT den Token" : "ohne Token"}, Vorschlag ${v1.rechts.includes(bearer) ? "mit Original" : "OHNE Original"}, JSON ${gueltig(v1.rechts) ? "gültig" : "UNGÜLTIG"}`
            : "kein Vorschlag",
        );

        const pemKoerper = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7";
        const pemEsc = `-----BEGIN PRIVATE KEY-----\\n${pemKoerper}\\n-----END PRIVATE KEY-----`;
        // „Gültig“ und „enthält den Körper“ sah eine verdoppelte Maskierung nicht (Kit vor 0.70.0: doppelter Backslash vor dem n, gültiges JSON mit
        // anderem Schlüsselwert): geprüft wird der WERT, so wie ihn der Parser aus der Originaldatei liest.
        const pemWert = (JSON.parse(`{"key": "${pemEsc}"}`) as { key: string }).key;
        const wertGleich = (text: string, soll: string): boolean => {
          try {
            return (JSON.parse(text) as { key?: unknown }).key === soll;
          } catch {
            return false;
          }
        };
        const v2 = await durchsModal(`{"key": "${pemEsc}", "a": 1,}`);
        check(
          "G2 PEM als JSON-String (\\n escaped) geht geschwärzt raus und kommt wertgleich zurück",
          Boolean(v2) && letzterRoh() !== "" && !letzterRoh().includes(pemKoerper)
            && gueltig(v2!.rechts) && wertGleich(v2!.rechts, pemWert),
          v2
            ? `Draht ${letzterRoh().includes(pemKoerper) ? "TRÄGT den Schlüssel" : "ohne Schlüssel"}, JSON ${gueltig(v2.rechts) ? "gültig" : "UNGÜLTIG"}, Wert ${wertGleich(v2.rechts, pemWert) ? "gleich dem Original" : "WEICHT AB (Backslash verdoppelt?)"}`
            : "kein Vorschlag",
        );

        const pemEcht = `-----BEGIN PRIVATE KEY-----\n${pemKoerper}\n-----END PRIVATE KEY-----`;
        const v3 = await durchsModal(`{"key": "${pemEcht}", "a": 1}`);
        check(
          "G3 PEM mit echten Zeilenumbrüchen (kaputtes JSON) kommt als gültiges JSON zurück",
          Boolean(v3) && letzterRoh() !== "" && !letzterRoh().includes(pemKoerper) && gueltig(v3!.rechts),
          v3
            ? `Draht ${letzterRoh().includes(pemKoerper) ? "TRÄGT den Schlüssel" : "ohne Schlüssel"}, JSON ${gueltig(v3.rechts) ? "gültig" : "UNGÜLTIG"}`
            : "kein Vorschlag",
        );

        // Schluesselbund: ein Endpunkt MIT Schluessel, dann die Aufloesung erzwingen und data.json lesen.
        const schluessel = await cdp.evaluate<{ apiKeyInData: boolean; secretId: boolean; hydrated: boolean }>(`
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          plugin.settings.endpoints = [{ url: "http://127.0.0.1:${fakePort}", model: "qwen/qwen3.8-27b", apiKey: "sk-smoke-keychain-0123456789" }];
          plugin.llm.invalidate();
          const src = await plugin.llm.resolve({ force: true });
          await new Promise((r) => setTimeout(r, 800));
          const pfad = app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/data.json";
          const data = JSON.parse(await app.vault.adapter.read(pfad));
          const eps = data.endpoints ?? [];
          return {
            apiKeyInData: JSON.stringify(data).includes("sk-smoke-keychain") || eps.some((e) => "apiKey" in e),
            secretId: eps.some((e) => typeof e.secretId === "string" && e.secretId !== ""),
            hydrated: src.config?.apiKey === "sk-smoke-keychain-0123456789",
          };
        `);
        check(
          "G4 Kein apiKey in data.json — der Schlüssel liegt im Schlüsselbund",
          !schluessel.apiKeyInData && schluessel.secretId && schluessel.hydrated,
          `apiKey in data.json: ${schluessel.apiKeyInData ? "JA" : "nein"}, secretId: ${schluessel.secretId ? "ja" : "NEIN"}, Aufloesung traegt den Schlüssel: ${schluessel.hydrated ? "ja" : "NEIN"}`,
        );

        await pruefeClaude(cdp, notiz);
      } finally {
        await stub.stop();
        await cdp
          .evaluate(`
            const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            plugin.llm.invalidate();
            return true;
          `)
          .catch(() => undefined);
      }
    },
  },
  {
    key: "repair-datei",
    title: "H — Reparatur in der Datei-Ansicht (Banner-Knopf, Fake-Endpunkt)",
    run: async (cdp) => {
      const stub = await startLlmStub({
        cors: false,
        models: ["qwen/qwen3.8-27b"],
        antwort: () => ({ text: '{"a": 1, "b": 2}', model: "qwen/qwen3.8-27b" }),
      });
      const kaputt = '{"a": 1, "b": 2';
      try {
        await cdp.evaluate(`
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          plugin.settings.endpoints = [{ url: "http://127.0.0.1:${stub.port}", model: "qwen/qwen3.8-27b" }];
          plugin.settings.choice = {};
          plugin.llm.invalidate();
          return true;
        `);
        const offen = await openJsonFile(cdp, SMOKE_REPAIR_FILE, kaputt);
        const knopfSel = ".json-error-banner .json-codeblock-repair";
        const knopf = offen
          ? await pollUntil<boolean>(cdp, inView(`return root.querySelector(${JSON.stringify(knopfSel)}) ? true : null;`), 8000, 250)
          : null;
        check("H1 Das Fehler-Banner der Datei-Ansicht trägt den Reparatur-Knopf", Boolean(knopf), knopf ? "Knopf im Banner" : "kein Knopf");

        const geklickt = Boolean(knopf) && (await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`)));
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
          "H2 Klick öffnet das Modal mit Diff, Anwenden ist frei",
          Boolean(diff) && diff!.anwenden && diff!.rechts.includes("}") && !diff!.links.includes('2}'),
          diff ? "Original links, Vorschlag rechts, Anwenden aktiv" : geklickt ? "Modal ohne Diff" : "Knopf nicht klickbar",
        );
        if (shotPfad !== null && diff) {
          writeFileSync(shotPfad.replace(/(\.png)?$/, "-datei.png"), await capture(cdp));
        }

        const angewendet = Boolean(diff) && (await klick(cdp, `document.querySelector(".json-repair-modal .modal-button-container button.mod-cta")`));
        const danach = angewendet
          ? await pollUntil<{ platte: string; banner: boolean }>(
              cdp,
              `
                const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_FILE)});
                const platte = await app.vault.read(file);
                if (platte !== '{"a": 1, "b": 2}') return null;
                const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
                return { platte, banner: Boolean(leaf?.view?.containerEl?.querySelector(".json-error-banner")) };
              `,
              10_000,
              300,
            )
          : null;
        check(
          "H3 Anwenden schreibt den Vorschlag in die Datei, das Banner verschwindet",
          Boolean(danach) && !danach!.banner,
          danach ? `Datei = Vorschlag, Banner ${danach.banner ? "DA" : "weg"}` : angewendet ? "Datei unverändert" : "Anwenden nicht geklickt",
        );

        const rueck = danach
          ? await cdp.evaluate<boolean>(`
              const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
              leaf.view.undo();
              return true;
            `)
          : false;
        const zurueck = rueck
          ? await pollUntil<string>(
              cdp,
              `
                const file = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_REPAIR_FILE)});
                const platte = await app.vault.read(file);
                return platte === ${JSON.stringify(kaputt)} ? platte : null;
              `,
              10_000,
              300,
            )
          : null;
        check("H4 Rückgängig holt den kaputten Text zurück", zurueck === kaputt, zurueck === kaputt ? "Datei = Original" : rueck ? "Datei weicht ab" : "kein Rückgängig (H3 fehlt)");

        // H5 — Gemma 4 auf LM Studio schreibt das Denken OHNE Öffner in `content` und beendet es mit `<channel|>`; das JSON folgt.
        // Der Stub antwortet so (Modell `google/gemma-4-e4b`). Ohne die Kit-Behandlung (obsidian-kit ab 0.60.3) stünde der Denktext samt
        // `<channel|>` im Vorschlag — die Reparatur zeigte Müll als „Vorschlag“ oder verwürfe ihn als ungültig.
        const denken = "Ich prüfe, welche Klammer fehlt.";
        await stub.stop();
        const gemmaStub = await startLlmStub({
          cors: false,
          models: ["google/gemma-4-e4b"],
          antwort: () => ({ text: `${denken}<channel|>{"a": 1, "b": 2}`, model: "google/gemma-4-e4b" }),
        });
        try {
          await cdp.evaluate(`
            const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            plugin.settings.endpoints = [{ url: "http://127.0.0.1:${gemmaStub.port}", model: "google/gemma-4-e4b" }];
            plugin.settings.choice = {};
            plugin.llm.invalidate();
            return true;
          `);
          const offen5 = await openJsonFile(cdp, SMOKE_REPAIR_FILE, kaputt);
          const knopf5 = offen5
            ? await pollUntil<boolean>(cdp, inView(`return root.querySelector(${JSON.stringify(knopfSel)}) ? true : null;`), 8000, 250)
            : null;
          const geklickt5 = Boolean(knopf5) && (await klick(cdp, elImView(`return root.querySelector(${JSON.stringify(knopfSel)});`)));
          const diff5 = geklickt5
            ? await pollUntil<{ rechts: string; anwenden: boolean }>(
                cdp,
                `
                  const cols = document.querySelectorAll(".json-repair-modal .json-repair-col");
                  if (cols.length !== 2) return null;
                  const apply = document.querySelector(".json-repair-modal .modal-button-container button.mod-cta");
                  return { rechts: cols[1].textContent, anwenden: Boolean(apply) && !apply.disabled };
                `,
                15_000,
                300,
              )
            : null;
          check(
            "H5 Gemma 4 ohne Öffner: der Vorschlag ist das JSON, der Denktext steht nicht darin",
            Boolean(diff5) && diff5!.anwenden && diff5!.rechts.includes('"b": 2') && !diff5!.rechts.includes("channel") && !diff5!.rechts.includes("Klammer"),
            diff5 ? `Vorschlag „${diff5.rechts.slice(0, 60).replace(/\s+/g, " ")}“, Anwenden ${diff5.anwenden ? "aktiv" : "gesperrt"}` : geklickt5 ? "Modal ohne Diff" : "Knopf nicht klickbar",
          );
          await cdp.evaluate(`document.querySelector(".json-repair-modal .modal-button-container button:not(.mod-cta)")?.click(); return true;`).catch(() => undefined);
        } finally {
          await gemmaStub.stop();
        }
      } finally {
        await stub.stop();
        await cdp
          .evaluate(`
            const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            plugin.llm.invalidate();
            return true;
          `)
          .catch(() => undefined);
      }
    },
  },
  {
    key: "einstellungen",
    title: "I — Einstellungs-Tab (Aufbau beim Öffnen)",
    run: async (cdp) => {
      // Der Haken des Kits (`installTabRefreshOnOpen`) wirkt nur, solange er installiert bleibt: baute `hide()` ihn ab, zeichnete der Tab nur
      // beim ersten Öffnen und danach nie wieder (gemessen vor dem Fix: Aufbauten 1, 1, 1, 1; danach 1, 3, 5, 7). Gemessen wird der Aufbau
      // selbst: `renderImperative` zählt mit, der Tab wird dreimal geöffnet und geschlossen.
      const zaehler = await cdp.evaluate<number[]>(`
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const tab = (app.setting.pluginTabs ?? []).find((t) => t.plugin === plugin);
        if (!tab) return [];
        const original = tab.renderImperative;
        let n = 0;
        tab.renderImperative = function (...a) { n++; return original.apply(this, a); };
        const stand = [];
        try {
          for (let i = 0; i < 3; i++) {
            app.setting.open();
            app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
            await new Promise((r) => setTimeout(r, 1200));
            stand.push(n);
            app.setting.close();
            await new Promise((r) => setTimeout(r, 500));
          }
        } finally {
          tab.renderImperative = original;
        }
        return stand;
      `);
      const waechst = zaehler.length === 3 && zaehler[0] >= 1 && zaehler[1] > zaehler[0] && zaehler[2] > zaehler[1];
      check(
        "I1 Der Einstellungs-Tab baut bei jedem Öffnen neu auf, nicht nur beim ersten",
        waechst,
        zaehler.length === 0
          ? "Tab des Plugins nicht gefunden"
          : `Aufbauten nach dem 1., 2., 3. Öffnen (kumuliert): ${zaehler.join(", ")}${waechst ? "" : " — ein späteres Öffnen baut nicht neu auf"}`,
      );
    },
  },
];

// --- Lauf --------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const flag = (name: string): string | undefined => args.value(name);
  const port = Number(flag("port"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("--port <1024-65535> ist Pflicht (kein Standardport: 9222 gehoert der regulaeren Instanz). Beispiel: npm run smoke:gui -- --port 9398 --vault json-editor");
  }
  const vault = flag("vault") ?? PLUGIN_ID;
  const keep = args.has("keep");
  const sectionArg = flag("section");
  klickModus = args.klickModus();
  shotPfad = flag("shot") ?? null;

  const sections = sectionArg ? SECTIONS.filter((s) => s.key === sectionArg) : SECTIONS;
  if (sections.length === 0) {
    throw new Error(
      `Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`,
    );
  }

  // Soll-Liste der gewaehlten Abschnitte (plus Vorlauf-Punkt) = Nenner der Bilanz.
  const fehlt = sections.filter((s) => PUNKTE_JE_SECTION[s.key] === undefined).map((s) => s.key);
  if (fehlt.length > 0) throw new Error(`Abschnitt ohne Soll-Liste in PUNKTE_JE_SECTION: ${fehlt.join(", ")}`);
  bilanz = createBilanz({ punkte: [...PUNKTE_VORLAUF, ...sections.flatMap((s) => PUNKTE_JE_SECTION[s.key] ?? [])] });

  console.log(`Smoke json-editor — Obsidian auf Port ${port}`);
  if (klickModus.gegenprobe) {
    console.log(
      "⚠️  KLICK-GEGENPROBE: es wird nicht geklickt. Jeder klickabhaengige Pruefpunkt MUSS "
        + "rot werden — bleibt einer gruen, misst er etwas, das auch ohne den Klick wahr ist.",
    );
  }
  if (klickModus.haltenMs > 0) console.log(`Klick-Haltedauer: ${klickModus.haltenMs} ms`);
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Workspace-Fenster auf Port ${port}${vault ? ` fuer Vault „${vault}"` : ""}. `
        + `Laeuft Obsidian mit --remote-debugging-port=${port}?`,
    );
  }

  // Ausserhalb des `try`, damit das `finally` sie auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben kann.
  let vaultBasis: string | null = null;
  let previousSettings: string | null = null;
  let previousClipboard: string | null = null;
  // Die `ungeklaert`-Warnung gehoert in die Abschlusszeile, nicht nur nach oben ins
  // Protokoll: wer eine Runde faehrt, liest die letzte Zeile — und ein Lauf, dessen
  // Herkunft ungeprueft blieb, darf nicht aussehen wie einer, der belegt ist.
  let herkunftsWarnung: string | null = null;

  // EIN Schritt raeumt zurueck, was dieser Lauf am Wirt aendert: der Normalweg im `finally` (`zustand.schliesse()`),
  // Ctrl-C/SIGTERM ueber das Abbruch-Modul der Bruecke (Hauptzweig gesperrt, der Schritt darf noch senden, danach
  // Bilanz, Exit 130). Idempotent, im Abbruch ohne Warten. Angelegt wird: Pruefdateien im Vault, Clipboard- und
  // Settings-Inhalt, Always-on-top des Fensters.
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
          await new Promise((r) => setTimeout(r, ${istAbgebrochen() ? 300 : 2500}));
          for (const path of pfade) {
            const file = app.vault.getAbstractFileByPath(path);
            if (file) await app.fileManager.trashFile(file);
          }
          await new Promise((r) => setTimeout(r, ${istAbgebrochen() ? 0 : 800}));
          return true;
        `)
        .catch(() => undefined);
    } else {
      console.log(`(--keep: ${createdFiles.size} Pruefdatei(en) bleiben im Vault stehen)`);
    }
    if (!keep && vaultBasis !== null) {
      // Gegen den Abbruch: die kurze Wartezeit oben genuegt nicht immer, damit das Plugin beim Schliessen nichts mehr
      // schreibt — was dann noch liegt, nimmt der Node-Prozess weg (idempotent, `force` ohne Fehler bei fehlender Datei).
      for (const pfad of createdFiles) rmSync(join(vaultBasis, pfad), { force: true });
    }
  };

  // Zweiter Schritt: Settings zurueck. Getrennt, weil jeder Schritt im Abbruch hoechstens eine Sekunde hat.
  const einstellungenZurueck = async (): Promise<void> => {
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
            await new Promise((r) => setTimeout(r, ${istAbgebrochen() ? 0 : 600}));
            const pfad = app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/data.json";
            return JSON.stringify(JSON.parse(await app.vault.adapter.read(pfad)));
          `)
          .catch(() => "(Fehler)");
      let endstand = await zurueck();
      // Im Abbruch nicht warten: der Schritt hat hoechstens eine Sekunde (Abbruch-Modul der Bruecke).
      for (let runde = 0; runde < 5 && !istAbgebrochen(); runde++) {
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

  // Vor der ersten Mutation anmelden.
  // Rueckwaerts abgearbeitet: erst die Dateien, dann die Einstellungen (das Plugin schreibt beim Schliessen eines
  // Blatts seinen Zustand, die Einstellungen kommen danach).
  const einstellungen = beimAbbruch(einstellungenZurueck, "Einstellungen zuruecksetzen");
  const zustand = beimAbbruch(cleanupState, "Pruefdateien und Clipboard zuruecksetzen");

  try {
    // Ohne Fokus drosselt Chromium den Renderer: der DOM der Ansicht bleibt leer, waehrend
    // die App-API den Zustand korrekt meldet — man debuggt ein Phantom. `Page.bringToFront`
    // allein genuegt auf macOS NICHT (es holt das Fenster in der App nach vorn, nicht die
    // App nach vorn), `requireVisible` erledigt den Rest (KEIN `osascript activate`: das aktiviert die regulaere Instanz statt der Zweitinstanz).
    await requireVisible(cdp);
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
    vaultBasis = vaultInfo.basePath;
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
    const instanz = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: PLUGIN_ID, sprache: "en" });
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
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv — ${instanz.hinweis}. Ggf. erst \`npm run deploy\`.`);
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
    // zurueck, wie er ihn vorgefunden hat. Derselbe Schritt wie beim Abbruch (`beimAbbruch` oben).
    await zustand.schliesse();
    await einstellungen.schliesse();
    if (istAbgebrochen()) return;   // das Modul druckt die Bilanz und beendet den Prozess selbst
    cdp.close();
    // Auch nach einem Abbruch: nie aufgezeichnete Punkte zaehlen als „nichts gemessen“.
    if (herkunftsWarnung !== null) {
      console.log("⚠️  Herkunft des gemessenen Builds ungeprueft — s. Warnung oben.");
    }
    bilanz.abschluss();
  }
}

runDriver(main);
