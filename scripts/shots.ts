/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian, statt die Bilder von Hand zu klicken.
 *
 * Warum getrackt: ein Werkzeug, das nur einmal im Scratchpad existiert, ist keine Praxis.
 * Dieselbe Begruendung wie bei `scripts/gui-smoke.ts`, mit dem sich dieser Treiber die
 * zentrale CDP-Bruecke teilt (`tools/obsidian-cdp/` im Dach — importiert, nicht vendoriert).
 *
 * ## Ablauf
 *
 * ```bash
 * export STAGING_VAULTS_DIR="$HOME/StagingVaults"   # einmalig
 * npm run build && npm run shots -- --setup         # Vault aus dem Fixture bauen
 *
 * osascript -e 'quit app "Obsidian"'                # Handarbeit: Debug-Port
 * open -a Obsidian --args --remote-debugging-port=9222
 * #   ... den Aufnahme-Vault oeffnen und einmalig als vertrauenswuerdig markieren
 *
 * npm run shots -- --deploy                         # alles aufnehmen, vorher deployen
 * npm run shots -- --only hero.png                  # ein Bild nachziehen
 * npm run shots -- --list                           # Vertrag anzeigen
 * ```
 *
 * ## Was hier Zeit kostet, wenn man es nicht weiss
 *
 * 1. **Der Treiber nimmt auf, was im Vault liegt — nicht, was im Arbeitsbaum steht.**
 *    Deshalb vergleicht er beides per Hash und bricht bei Abweichung ab; `--deploy`
 *    kopiert und laedt neu. Ohne das bebildert man den vorigen Stand, und der Lauf
 *    meldet dabei Erfolg.
 * 2. **Chromium drosselt nicht-fokussierte Fenster** — ohne Fokus bleibt der Lesebereich
 *    leer und man debuggt ein Phantom.
 * 3. **Die Einstellungen sind ein eigenes Fenster** (URL `about:blank`, Titel lokalisiert).
 *    Gewaehlt wird ueber die Sache: nur das Hauptfenster hat einen Workspace.
 * 4. **Die Aufnahmesprache ist app-weit.** Der Treiber prueft, was GERENDERT ist
 *    (`document.documentElement.lang`), nicht was in `localStorage` fuer den naechsten
 *    Start steht.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, env, exit } from "node:process";

import {
  type Cdp,
  attachTo,
  closeExtraLeaves,
  openExisting,
  pollUntil,
  releaseAlwaysOnTop,
  requireVisible,
  setAppConfig,
  setPluginSetting,
} from "../../tools/obsidian-cdp/cdp.js";
import {
  type Rect,
  type ShotOptions,
  boxOf,
  capture,
  setWindowSize,
  withMetrics,
  writeShot,
} from "../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "json-editor";
const REPO_NAME = "json_viewer";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const PADDING = 12;
const FENSTER_BREITE = 1440;
const FENSTER_HOEHE = 900;

const JSON_DATEI = "trailhead.json";
const JSONC_DATEI = "tsconfig.jsonc";
const NOTIZ = "Release notes.md";
/** Eigene, kurze Datei fuers Schema-Bild: in `trailhead.json` liegt die verletzte Regel
 *  so weit unten, dass entweder das Fehler-Banner oder die markierte Zeile aus dem
 *  Ausschnitt faellt — ein Bild, das seine eigene Aussage nicht mehr traegt. */
const SCHEMA_DATEI = "deploy.json";

// --- Rezept ------------------------------------------------------------------

interface Shot {
  name: string;
  /** Klasse nach dem Bild-Standard — steuert, ob ein Vorschaubild entsteht. */
  klasse: "hero" | "feature" | "detail";
  /** Stellt den Zustand her und liefert den Ausschnitt (null = nicht aufnehmbar). */
  run(cdp: Cdp): Promise<Rect | null>;
  /** Der Zeiger bleibt fuer die Aufnahme stehen — bei Bildern, die einen Hover zeigen. */
  zeigerHalten?: boolean;
}

/** Eine Datei in der Plugin-Ansicht oeffnen und auf den fertig gerenderten Baum warten.
 *
 *  Gewartet wird auf den Baum, nicht auf „Datei ist aktiv": dazwischen liegt Obsidians
 *  asynchrones Oeffnen, und in dieser Luecke fotografiert man ein leeres Blatt. */
async function oeffneJson(cdp: Cdp, pfad: string): Promise<boolean> {
  const ok = await cdp.evaluate<boolean>(`
    const file = app.vault.getAbstractFileByPath(${JSON.stringify(pfad)});
    if (!file) return false;
    // Ist die Datei BEREITS offen, laedt openFile() sie nicht neu — und alles, was am
    // Laden haengt (Companion-Schema, Modus, Zuruecksetzen), passiert dann nicht. Das
    // sah wie ein defektes Rezept aus: Einstellung gesetzt, Datei offen, kein Banner.
    // Der Umweg ueber eine andere Datei erzwingt den Ladeweg.
    const aktiv = app.workspace.getActiveFile();
    if (aktiv && aktiv.path === file.path) {
      const andere = app.vault.getFiles().find((f) => f.path !== file.path && f.extension === "md");
      const blatt = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
      if (andere && blatt) {
        await blatt.openFile(andere);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    let leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    if (!leaf || !leaf.parent) leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    return true;
  `);
  if (!ok) return false;
  const baum = await pollUntil<boolean>(
    cdp,
    `
      const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
      if (!view || view.getViewType() !== ${JSON.stringify(`${PLUGIN_ID}-view`)}) return null;
      const rows = view.containerEl.querySelectorAll(".json-row").length;
      return rows > 0 ? true : null;
    `,
    15_000,
    300,
  );
  return baum === true;
}

/** Ausschnitt eines Elements der Pruefling-Ansicht — der ERSTE SICHTBARE Treffer.
 *
 *  `boxOf` nimmt den ersten im DOM; nach einem Blattwechsel haelt Obsidian den alten
 *  Container kurz als 0x0-Leiche, und jedes Mass daran ist unbrauchbar. */
async function ansichtBox(cdp: Cdp, selektor: string, padding = PADDING): Promise<Rect | null> {
  return cdp.evaluate<Rect | null>(`
    const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
    if (!view) return null;
    const el = [...view.containerEl.querySelectorAll(${JSON.stringify(selektor)})]
      .find((e) => e.getBoundingClientRect().width > 1);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = ${padding};
    return {
      x: Math.max(0, Math.round(r.left - p)),
      y: Math.max(0, Math.round(r.top - p)),
      width: Math.round(r.width + 2 * p),
      height: Math.round(r.height + 2 * p),
    };
  `);
}

/** Das ganze Blatt inklusive Werkzeugleiste — der Ausschnitt fuer Uebersichtsbilder. */
async function blattBox(cdp: Cdp, padding = 0): Promise<Rect | null> {
  return cdp.evaluate<Rect | null>(`
    const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    const el = leaf?.containerEl ?? leaf?.view?.containerEl;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = ${padding};
    return {
      x: Math.max(0, Math.round(r.left - p)),
      y: Math.max(0, Math.round(r.top - p)),
      width: Math.round(r.width + 2 * p),
      height: Math.round(r.height + 2 * p),
    };
  `);
}

/** Auf ein Element WARTEN, das sichtbar ist — dieselbe Sichtbarkeitsregel wie oben. */
async function warteAufSichtbar(cdp: Cdp, selektor: string, frist = 8000): Promise<boolean> {
  const da = await pollUntil<boolean>(
    cdp,
    `
      const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
      if (!view) return null;
      const el = [...view.containerEl.querySelectorAll(${JSON.stringify(selektor)})]
        .find((e) => e.getBoundingClientRect().width > 1);
      return el ? true : null;
    `,
    frist,
    250,
  );
  return da === true;
}

/** Ausschnitt des Blattes, aber nur so hoch wie sein INHALT.
 *
 *  Ein Blatt ist immer fensterhoch; ein kurzer Baum darin fuellt ein Drittel und der
 *  Rest ist Leere, die jede Pruefung besteht. Gemessen wird deshalb die Unterkante des
 *  letzten sichtbaren BLATT-Elements (ohne Element-Kinder) — Container tragen den Text
 *  aller Nachfahren und reichen bis unten, ihre Kante waere wieder die des Blattes.
 */
async function inhaltBox(cdp: Cdp, padding = PADDING): Promise<Rect | null> {
  return cdp.evaluate<Rect | null>(`
    const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    const wurzel = leaf?.containerEl ?? leaf?.view?.containerEl;
    if (!wurzel) return null;
    const r = wurzel.getBoundingClientRect();
    let unten = 0;
    for (const el of wurzel.querySelectorAll("*")) {
      if (el.children.length > 0) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      if (b.bottom > unten && b.bottom <= r.bottom) unten = b.bottom;
    }
    const p = ${padding};
    const hoehe = unten > r.top ? unten - r.top + p : r.height;
    return {
      x: Math.max(0, Math.round(r.left)),
      y: Math.max(0, Math.round(r.top)),
      width: Math.round(r.width),
      height: Math.round(Math.min(hoehe, r.height)),
    };
  `);
}

/** Zustand vor jedem Bild zuruecksetzen. Welcher Zustand zurueckbleibt, darf das
 *  naechste Bild nicht bestimmen: die Suche des Such-Bildes filterte im naechsten Motiv
 *  weiter, und das sah aus wie ein Fehlschlag des Rezepts (gemessen 2026-08-22). */
async function zustandZuruecksetzen(cdp: Cdp): Promise<void> {
  // Der Auslieferungszustand, nicht der zuletzt gesetzte: das Schema-Bild schaltet die
  // Validierung ein, und ohne dieses Zuruecksetzen trugen ALLE folgenden Bilder das
  // Fehler-Banner — korrektes Verhalten, im falschen Motiv (gemessen 2026-08-22).
  await setPluginSetting(cdp, PLUGIN_ID, "validateAgainstSchema", false);
  await cdp
    .evaluate(`
      const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
      const input = view?.containerEl?.querySelector(".json-search-input");
      if (input && input.value !== "") {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
      }
      // Der Brotkrumen zeigt den zuletzt angeklickten Pfad. Innerhalb DERSELBEN Datei
      // ist das richtig; fuers naechste Motiv ist es ein Rest, der wie ein Fehler aussieht.
      view?.breadcrumb?.setPath([]);
      for (const t of document.querySelectorAll(".tooltip")) t.remove();
      return true;
    `)
    .catch(() => undefined);
}

/** Echter Maus-Hover auf ein Element: `Input.dispatchMouseEvent` loest CSS-:hover aus,
 *  ein synthetisches JS-Event in Electron nicht. Der Zeiger bleibt danach dort stehen —
 *  wer ihn wegbewegt, nimmt den Hover-Zustand mit. */
async function zeigerAuf(cdp: Cdp, selektor: string): Promise<boolean> {
  const punkt = await cdp.evaluate<{ x: number; y: number } | null>(`
    const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
    const el = [...(view?.containerEl?.querySelectorAll(${JSON.stringify(selektor)}) ?? [])]
      .find((e) => e.getBoundingClientRect().width > 1);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) };
  `);
  if (!punkt) return false;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: punkt.x, y: punkt.y, buttons: 0 });
  // Lange genug fuer die Einblendung: die Aktionen liegen unter einer CSS-Transition,
  // und ein Bild mitten darin zeigt sie halbtransparent — was wie ein Rendering-Fehler
  // aussieht statt wie ein Hover-Zustand.
  await new Promise((r) => setTimeout(r, 900));
  return true;
}

/** Kappt einen Ausschnitt auf ein Hoechst-Seitenverhaeltnis.
 *
 *  Die Kante gehoert ins Rezept, nicht in einen Nachschnitt: sonst ist das Rezept nicht
 *  mehr die einzige Quelle des Bildes. */
function kappeVerhaeltnis(box: Rect, maxRatio: number): Rect {
  const erlaubt = Math.round(box.width * maxRatio);
  return box.height <= erlaubt ? box : { ...box, height: erlaubt };
}

/** Wie oben, aber die Kante liegt an einer ZEILENGRENZE. Eine harte Kappung endet mitten
 *  in einer Zeile, und ein halb abgeschnittener Wert am Bildrand liest sich als
 *  Schnittfehler statt als „hier geht es weiter". */
async function kappeAnZeile(cdp: Cdp, box: Rect, maxRatio: number): Promise<Rect> {
  const grenze = kappeVerhaeltnis(box, maxRatio);
  const unten = await cdp.evaluate<number>(`
    const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
    if (!view) return 0;
    const grenze = ${box.y + grenze.height};
    let beste = 0;
    for (const row of view.containerEl.querySelectorAll(".json-row")) {
      const b = row.getBoundingClientRect();
      if (b.height < 1) continue;
      if (b.bottom <= grenze && b.bottom > beste) beste = b.bottom;
    }
    return Math.floor(beste);
  `);
  const hoehe = unten > box.y ? Math.round(unten - box.y + 8) : grenze.height;
  return { ...box, height: Math.min(hoehe, grenze.height) };
}

const SHOTS: Shot[] = [
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp) {
      if (!(await oeffneJson(cdp, JSON_DATEI))) return null;
      // Eine Zeile anklicken, damit der Brotkrumen etwas zeigt — er ist sonst leer, und
      // ein leeres Element in der Werkzeugleiste sieht im Bild wie ein Fehler aus.
      await cdp.evaluate(`
        const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
        const row = view.containerEl.querySelector('.json-row[data-path="settings.theme.mode"]');
        if (row) row.querySelector(".json-key")?.click();
        await new Promise((r) => setTimeout(r, 300));
        return true;
      `);
      // Das ganze Fenster: Dateiliste links, Baum rechts. Der Hero soll erklaeren, WO
      // das passiert — ein Ausschnitt allein koennte jede beliebige Anwendung sein.
      return null;
    },
  },
  {
    name: "tree-view.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await oeffneJson(cdp, JSON_DATEI))) return null;
      // Eine Zeile aktiv setzen, damit der Brotkrumen den Pfad zeigt — das ist die
      // halbe Aussage der Zeile darueber.
      await cdp.evaluate(`
        const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
        const row = view.containerEl.querySelector('.json-row[data-path="version"]');
        row?.querySelector(".json-key")?.click();
        await new Promise((r) => setTimeout(r, 300));
        return true;
      `);
      // ECHTER Maus-Hover: die Zeilen-Aktionen haengen an CSS-:hover, das ein
      // synthetisches JS-Event in Electron nicht ausloest. Der Zeiger bleibt fuer die
      // Aufnahme stehen (siehe `zeigerHalten`) — wer ihn wegbewegt, nimmt den Zustand mit.
      // Eine Zeile OHNE verschachtelte Kinder: bei einem Container-Wert hovern Zeile und
      // Container gleichzeitig, und im Bild stehen zwei Aktionsgruppen nebeneinander.
      if (!(await zeigerAuf(cdp, '.json-row[data-path="version"]'))) return null;
      const sichtbar = await cdp.evaluate<number>(`
        const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
        return [...view.containerEl.querySelectorAll(".json-row-action")]
          .filter((e) => e.getBoundingClientRect().width > 1).length;
      `);
      if (!sichtbar) {
        console.log("      · keine sichtbaren Zeilen-Aktionen — Hover-Zustand pruefen");
        return null;
      }
      const box = await inhaltBox(cdp);
      return box ? await kappeAnZeile(cdp, box, 1.55) : null;
    },
    zeigerHalten: true,
  },
  {
    name: "source-view.png",
    klasse: "feature",
    async run(cdp) {
      // Bewusst die .jsonc-Datei: die Kommentare sind das, was diesen Modus interessant
      // macht, und ein Bild von reinem JSON zeigte nur Syntaxfarben.
      if (!(await oeffneJson(cdp, JSONC_DATEI))) return null;
      await cdp.evaluate(`
        const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
        view.toggleMode();
        await new Promise((r) => setTimeout(r, 700));
        return true;
      `);
      if (!(await warteAufSichtbar(cdp, ".cm-content"))) return null;
      const box = await inhaltBox(cdp);
      return box ? kappeVerhaeltnis(box, 1.55) : null;
    },
  },
  {
    name: "search.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await oeffneJson(cdp, JSON_DATEI))) return null;
      const treffer = await cdp.evaluate<number>(`
        const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
        const input = view.containerEl.querySelector(".json-search-input");
        if (!input) return 0;
        input.value = "distanceKm";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 600));
        return view.containerEl.querySelectorAll(".json-match").length;
      `);
      if (!treffer) return null;
      const box = await inhaltBox(cdp);
      return box ? kappeVerhaeltnis(box, 1.55) : null;
    },
  },
  {
    name: "schema-validation.png",
    klasse: "feature",
    async run(cdp) {
      // Opt-in: die Validierung ist im Auslieferungszustand AUS (Audit 1.3). Der Treiber
      // schaltet sie fuer dieses eine Bild ein und im Einstellungs-Bild wieder zurueck —
      // sonst zeigte die Einstellungsseite einen Wert, den der Treiber gesetzt hat.
      await setPluginSetting(cdp, PLUGIN_ID, "validateAgainstSchema", true);
      if (!(await oeffneJson(cdp, SCHEMA_DATEI))) return null;
      const fehler = await pollUntil<number>(
        cdp,
        `
          const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
          if (!view) return null;
          const banner = [...view.containerEl.querySelectorAll(".json-schema-banner")]
            .find((e) => e.getBoundingClientRect().width > 1);
          const marken = view.containerEl.querySelectorAll(".json-row-error").length;
          return banner && marken > 0 ? marken : null;
        `,
        12_000,
        400,
      );
      if (!fehler) return null;
      const box = await inhaltBox(cdp);
      return box ? await kappeAnZeile(cdp, box, 1.2) : null;
    },
  },
  {
    name: "codeblock-in-note.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await openExisting(cdp, NOTIZ, "preview"))) return null;
      const da = await pollUntil<boolean>(
        cdp,
        `
          const preview = document.querySelector(".markdown-reading-view");
          if (!preview) return null;
          return preview.querySelectorAll(".json-codeblock .json-row").length > 0 ? true : null;
        `,
        15_000,
        400,
      );
      if (!da) return null;
      // Der Lesebereich, nicht nur die Karte: dass das INNERHALB einer Notiz passiert,
      // ist die halbe Aussage des Bildes.
      const box = await boxOf(cdp, ".markdown-reading-view", 0);
      return box ? kappeVerhaeltnis(box, 1.55) : null;
    },
  },
];

/** Das Einstellungs-Bild. Eigenes Fenster seit Obsidian 1.13 — und `app` existiert dort
 *  nicht, also wird der Zustand im Workspace-Fenster hergestellt und hier nur gemessen. */
async function settingsBild(cdp: Cdp, port: number, opts: ShotOptions): Promise<string> {
  // Auslieferungszustand: das Schema-Bild hat die Validierung eingeschaltet. Ohne das
  // Zuruecksetzen zeigte die Einstellungsseite einen Wert, den der Treiber gesetzt hat.
  await setPluginSetting(cdp, PLUGIN_ID, "validateAgainstSchema", false);
  await cdp.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 900));
    return true;
  `);
  const fenster = await attachTo("settings", port);
  if (!fenster) return "settings.png — kein Einstellungen-Fenster gefunden";
  try {
    await fenster.send("Page.bringToFront");
    await new Promise((r) => setTimeout(r, 600));
    // Erst die Hoehe MESSEN, dann so hoch simulieren: ein Tab, der laenger ist als das
    // Fenster, wird sonst abgeschnitten und der Rest schwarz gefuellt.
    const hoehe = await fenster.evaluate<number>(`
      const el = document.querySelector(".vertical-tab-content");
      return el ? Math.ceil(el.scrollHeight) + 80 : 0;
    `);
    if (!hoehe) return "settings.png — kein Inhaltsbereich im Einstellungen-Fenster";
    return await withMetrics(fenster, 1000, Math.max(hoehe, 700), async () => {
      await new Promise((r) => setTimeout(r, 500));
      const box = await boxOf(fenster, ".vertical-tab-content", 0);
      if (!box) return "settings.png — Inhaltsbereich nach der Simulation weg";
      // Auch OBEN auf den Inhalt gehen: der Tab-Container traegt einen Vorlauf, der im
      // Bild als leerer Streifen erscheint.
      const oben = await fenster.evaluate<number>(`
        const el = document.querySelector(".vertical-tab-content");
        const erstes = [...el.children].find((k) => k.getBoundingClientRect().height > 0);
        return erstes ? Math.floor(erstes.getBoundingClientRect().top) : 0;
      `);
      // Auf den INHALT kappen, nicht auf den Container: im simulierten hohen Fenster ist
      // der Container so hoch wie die Simulation, und darunter steht schwarze Leere.
      const unten = await fenster.evaluate<number>(`
        const el = document.querySelector(".vertical-tab-content");
        const kinder = [...el.children].filter((k) => k.getBoundingClientRect().height > 0);
        const letztes = kinder[kinder.length - 1];
        return letztes ? Math.ceil(letztes.getBoundingClientRect().bottom) : 0;
      `);
      const y = oben > box.y ? Math.round(oben - 12) : box.y;
      const geschnitten = unten > y ? { x: box.x, y, width: box.width, height: Math.round(unten - y + 16) } : box;
      const png = await capture(fenster, geschnitten, 2);
      return await writeShot(fenster, "settings.png", png, { ...opts, thumb: true });
    });
  } finally {
    await fenster.evaluate("window.close(); return true;").catch(() => undefined);
    fenster.close();
  }
}

// --- Lauf --------------------------------------------------------------------

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

const PLUGIN_DATEIEN = ["main.js", "manifest.json", "styles.css"];

function hash(pfad: string): string {
  return createHash("sha256").update(readFileSync(pfad)).digest("hex").slice(0, 12);
}

/** Vergleicht Arbeitsbaum und Vault. Der Skill nennt „nimmt gegen den ALTEN Code auf"
 *  seine teuerste Falle und ueberlaesst sie der Disziplin — ein Hash macht daraus eine
 *  Zusicherung, und der Lauf kostet Millisekunden. */
function standAbgleich(repoRoot: string, vaultDir: string): string[] {
  const pluginDir = join(vaultDir, ".obsidian", "plugins", PLUGIN_ID);
  const abweichend: string[] = [];
  for (const datei of PLUGIN_DATEIEN) {
    const hier = join(repoRoot, datei);
    const dort = join(pluginDir, datei);
    if (!existsSync(hier)) return [`${datei} fehlt im Arbeitsbaum — erst \`npm run build\``];
    if (!existsSync(dort) || hash(hier) !== hash(dort)) abweichend.push(datei);
  }
  return abweichend;
}

async function main(): Promise<void> {
  // cwd, nicht import.meta.url: der Treiber wird vor dem Lauf nach `.shots.mjs` ins
  // Repo-Root gebundelt — ein Pfad relativ zur Modul-URL zeigte dann daneben.
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    console.log("  detail   settings.png");
    return;
  }

  const vaultDir = stagingVaultDir(REPO_NAME);

  if (argv.includes("--setup")) {
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({
      repoRoot,
      vaultDir,
      fixtureDir: join(repoRoot, "docs/images/fixture"),
      pluginId: PLUGIN_ID,
    })) {
      console.log(`  ${zeile}`);
    }
    console.log(
      "\n⚠️  Lief Obsidian waehrend dieses Setups, muss es JETZT neu starten. --setup hat\n" +
        "   Notizen, Layout und Plugin-Einstellungen ersetzt; ein laufendes Obsidian haelt\n" +
        "   den alten Stand im Speicher und schreibt ihn zurueck.\n" +
        "\nObsidian mit offenem Debug-Port starten und diesen Vault oeffnen:\n" +
        "  osascript -e 'quit app \"Obsidian\"'\n" +
        "  open -a Obsidian --args --remote-debugging-port=9222\n" +
        "Beim ersten Mal fragt Obsidian, ob es dem Vault-Autor vertraut — bestaetigen,\n" +
        "sonst laeuft das Plugin nicht und jedes Bild zeigt eine rohe Textdatei.",
    );
    return;
  }

  const port = Number(flag("--port") ?? env.SHOTS_PORT ?? 9222);
  const nur = flag("--only");
  const deployen = argv.includes("--deploy");

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.\n` +
        "Den Aufnahme-Vault oeffnen (er darf neben anderen Vaults offen sein):\n" +
        `  open -a Obsidian "${vaultDir}"`,
    );
  }
  console.log(`Verbunden auf Port ${port}.`);

  try {
    await requireVisible(cdp);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 500));

    // Aufnahmesprache: geprueft wird, was GERENDERT ist. `localStorage["language"]` ist
    // die Einstellung fuer den naechsten Start — beide weichen genau dann ab, wenn man
    // nach einer Aufnahme zurueckstellt und ohne Neustart weiterarbeitet.
    const sprache = await cdp.evaluate<string>(`return document.documentElement.lang || "en";`);
    if (sprache && !sprache.startsWith("en")) {
      throw new Error(
        `Obsidians Oberflaeche laeuft auf "${sprache}". Die Bilder liegen in der englischen\n` +
          "README (kanonisch) — Sprache auf English stellen und Obsidian neu starten.",
      );
    }

    if (deployen) {
      const pluginDir = join(vaultDir, ".obsidian", "plugins", PLUGIN_ID);
      mkdirSync(pluginDir, { recursive: true });
      const { copyFileSync } = await import("node:fs");
      for (const datei of PLUGIN_DATEIEN) copyFileSync(join(repoRoot, datei), join(pluginDir, datei));
      await cdp.evaluate(`
        await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
        await new Promise((r) => setTimeout(r, 400));
        await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
        await new Promise((r) => setTimeout(r, 1200));
        return true;
      `);
      console.log("Aktueller Build deployt und Plugin neu geladen.");
    }

    const abweichend = standAbgleich(repoRoot, vaultDir);
    if (abweichend.length > 0) {
      throw new Error(
        `Der Vault traegt einen anderen Stand als der Arbeitsbaum: ${abweichend.join(", ")}.\n` +
          "Die Bilder zeigten sonst die vorige Version, und nichts im Protokoll wuerde das sagen.\n" +
          "  npm run build && npm run shots -- --deploy",
      );
    }

    await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));

    // Feste Fenstergroesse — sonst haengt jedes Bild am Display, auf dem es entstand.
    await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
    // Zur Laufzeit, nicht ueber die Fixture-Datei: ein laufendes Obsidian liest sie nicht neu.
    await setAppConfig(cdp, "readableLineLength", false);
    await setAppConfig(cdp, "showInlineTitle", false);
    // Statusleiste und Notices gehoeren der Aufnahme-MASCHINE, nicht dem Produkt: in der
    // Ecke jedes Panel-Bildes klebte sonst der Sync-Status des Rechners.
    await cdp.evaluate(`
      let style = document.getElementById("shots-hide-chrome");
      if (!style) {
        style = document.createElement("style");
        style.id = "shots-hide-chrome";
        style.textContent = ".status-bar { display: none !important } .notice-container { display: none !important }";
        document.head.appendChild(style);
      }
      return true;
    `);
    await closeExtraLeaves(cdp).catch(() => undefined);

    const opts: ShotOptions = { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH };
    let ok = 0;
    let fehlend = 0;

    for (const shot of SHOTS) {
      if (nur && shot.name !== nur) continue;
      try {
        // VOR dem Bild aufraeumen, nicht danach: welcher Zustand zurueckbleibt, darf
        // das naechste Motiv nicht bestimmen.
        await zustandZuruecksetzen(cdp);
        const box = await shot.run(cdp);
        if (!shot.zeigerHalten) {
          // Der Zeiger hinterlaesst Spuren: ein Tooltip, der zufaellig unter der Maus
          // aufgeht, klebt sonst mitten im Bild.
          await cdp
            .send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2, buttons: 0 })
            .catch(() => undefined);
        }
        await cdp
          .evaluate(`for (const t of document.querySelectorAll(".tooltip")) t.remove(); return true;`)
          .catch(() => undefined);
        // hero.png nimmt bewusst das ganze Fenster auf (box === null bedeutet hier NICHT
        // Fehlschlag) — deshalb entscheidet der Name, nicht der Rueckgabewert.
        const ganzesFenster = shot.name === "hero.png";
        if (!box && !ganzesFenster) {
          console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`);
          fehlend++;
          continue;
        }
        const png = await capture(cdp, box ?? undefined);
        console.log(
          `  ✓ ${await writeShot(cdp, shot.name, png, { ...opts, thumb: shot.klasse === "detail" })}`,
        );
        ok++;
      } catch (err) {
        console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
        fehlend++;
      }
    }

    if (!nur || nur === "settings.png") {
      console.log(`  · ${await settingsBild(cdp, port, opts)}`);
    }

    console.log(`\n${ok} Bild(er) geschrieben, ${fehlend} offen.`);
    if (fehlend) exit(1);
  } finally {
    await releaseAlwaysOnTop(cdp).catch(() => undefined);
    cdp.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
