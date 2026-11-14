// vendored from obsidian-kit@0.88.0, src/obsidian/redline.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/**
 * Redline (Diff-Ansicht auf Wortebene): ein Text mit durchgestrichener Löschung und unterstrichener Einfügung in EINER Spalte, damit es
 * auf dem iPhone trägt. Gebaut für Diachronic (Prüfkarten und Vergleichsansicht), containerunabhängig: der Baustein füllt einen
 * Elternknoten, ein Modal, eine Karte oder eine Seitenleiste entscheiden selbst, wo er steht.
 *
 * ## Herkunft und Abgrenzung (Dach-AGENTS Kit-first, „Bibliothek ab Eins“)
 *
 * Vier Diff-Modale bauen eigene Zeilen-Darstellungen ohne gemeinsames Modul: image-to-markdown `src/diff_modal.ts`, koda-agent
 * `src/obsidian/confirm-write.ts:35`, json-editor `src/obsidian/RepairModal.ts:134-155` (Zwei-Spalten, `diff-view.ts:13` `sideBySide`),
 * wikijs-maintainer `src/obsidian/conflict-modal.ts`. Sie rechnen **Zeilen** (`code-kit` `diffLines`, Klassen `ctx`/`add`/`del`) und
 * färben die Zeile; dieses Modul zeigt **Segmente innerhalb des Textes**. Sie können darauf umsteigen, indem sie ihre Zeilen als
 * Segmente übergeben (`ctx` → `same`, `add` → `ins`, `del` → `del`, die Zeilenenden bleiben erhalten); das ist eine Folge-Task beim
 * Master, hier wird kein Konsument umgestellt. Die Darstellungsregel (alt durchgestrichen, neu hervorgehoben, Farbe nie allein)
 * stammt aus obsidian-transmute `styles.css:131-180`, dort mit Hintergrundfarben; hier trägt die **Form** die Art der Änderung
 * (Durchstreichen, Unterstreichen), die Farbe ist nur Zugabe (WCAG 1.4.1, Rot-Grün-Schwäche).
 *
 * ## Verhalten
 *
 * - **Eingabe sind Segmente**, nicht Texte: `{ kind: "same" | "del" | "ins", text, author? }`. `code-kit` `word-diff`
 *   (`wordDiffSegments`) liefert `DiffSegment` (`kind`, `text`) und passt ohne Umbau (`author` ist optional).
 * - **Aufbau:** `<div class="okit-redline">` mit `<span>` (gleich), `<del class="okit-redline-del">` und `<ins class="okit-redline-ins">`.
 *   Zeilenumbrüche im Text bleiben erhalten (`white-space: pre-wrap`).
 * - **`colorByAuthor`** (Default `false`): aus → alle Löschungen und alle Einfügungen tragen dieselbe Farbe nach Art (Einfügung
 *   `--color-blue`, Löschung `--color-orange`); an → `del`/`ins` bekommen `data-author="<Platz>"` und die Farbe des Platzes
 *   (`--color-blue`, `--color-orange`, `--color-purple`, `--color-cyan`, `--color-yellow`, `--color-pink`; kein Rot-Grün-Paar). Die Form bleibt in
 *   beiden Fällen dieselbe. Ein Segment ohne `author` (oder außerhalb 0–5) behält die Farbe nach Art.
 * - **`labels`** für Screenreader: `del`/`ins` bekommen `aria-label="<Beschriftung>: <Text>"`. Ohne `labels` kein `aria-label`
 *   (`<del>`/`<ins>` tragen ihre Rolle selbst, die Beschriftung kommt vom Aufrufer, nie vom Kit — kein `t()` im Kit).
 * - **Das Modul zeichnet nicht neu:** wer die Segmente ändert, leert den Elternknoten und ruft `renderRedline` erneut.
 *
 * ## Fallen beim Übernehmen
 *
 * 1. **Das Kit injiziert kein CSS.** `REDLINE_CSS` gehört in die `styles.css` des Consumers.
 * 2. **Leere Segmente** (`text: ""`) werden übersprungen: ein leeres `<del>` wäre ein unsichtbares Element mit `aria-label`.
 */

export interface RedlineSegment {
  kind: "same" | "del" | "ins";
  text: string;
  /** Autoren-Platz 0–5, nur mit `colorByAuthor` wirksam. */
  author?: number;
}

export interface RedlineOptions {
  /** Weitere Klasse am Wurzelknoten. */
  cls?: string;
  colorByAuthor?: boolean;
  /** Screenreader-Beschriftung je Art; ohne sie kein `aria-label`. */
  labels?: { del: string; ins: string };
}

/** Anzahl der Autoren-Plätze in `REDLINE_CSS`. */
const AUTHOR_SLOTS = 6;

/** Baut `<div class="okit-redline">` in `parent` und gibt ihn zurück. */
export function renderRedline(parent: HTMLElement, segments: readonly RedlineSegment[], opts: RedlineOptions = {}): HTMLElement {
  const root = parent.createDiv({ cls: opts.cls ? `okit-redline ${opts.cls}` : "okit-redline" });
  for (const seg of segments) {
    if (seg.text === "") continue;
    if (seg.kind === "same") {
      root.createSpan({ text: seg.text });
      continue;
    }
    const isDel = seg.kind === "del";
    const el = root.createEl(isDel ? "del" : "ins", { text: seg.text, cls: isDel ? "okit-redline-del" : "okit-redline-ins" });
    if (opts.colorByAuthor && seg.author !== undefined && Number.isInteger(seg.author) && seg.author >= 0 && seg.author < AUTHOR_SLOTS) {
      el.setAttribute("data-author", String(seg.author));
    }
    if (opts.labels) el.setAttribute("aria-label", `${isDel ? opts.labels.del : opts.labels.ins}: ${seg.text}`);
  }
  return root;
}

/** Gehört in die `styles.css` des Consumers — das Kit injiziert kein CSS. Nur Theme-Variablen; die Art trägt die Form, nicht die Farbe. */
export const REDLINE_CSS = `
.okit-redline {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: var(--line-height-normal);
}

.okit-redline-del {
  text-decoration: line-through;
  color: var(--color-orange);
}

.okit-redline-ins {
  text-decoration: underline;
  color: var(--color-blue);
}

/* Kontrast 4,5 zu 1: die rohen Akzentfarben der Themes unterschreiten ihn (Orange hell, Blau dunkel, beide in Kuro hell); gegen den Text gemischt halten sie ihn in Standard, Field Report und Kuro, auf dem Grund des Editors und auf dem der Seitenleiste (dunkel Standard: Einfügung 75 Prozent, gemessen 2026-11-12 mit 4,41 bei 80). */
.theme-light .okit-redline-del { color: color-mix(in srgb, var(--color-orange) 60%, var(--text-normal)); }
.theme-light .okit-redline-ins { color: color-mix(in srgb, var(--color-blue) 60%, var(--text-normal)); }
.theme-dark .okit-redline-del { color: color-mix(in srgb, var(--color-orange) 80%, var(--text-normal)); }
.theme-dark .okit-redline-ins { color: color-mix(in srgb, var(--color-blue) 75%, var(--text-normal)); }

.okit-redline-del[data-author="0"],
.okit-redline-ins[data-author="0"] { color: var(--color-blue); }
.okit-redline-del[data-author="1"],
.okit-redline-ins[data-author="1"] { color: var(--color-orange); }
.okit-redline-del[data-author="2"],
.okit-redline-ins[data-author="2"] { color: var(--color-purple); }
.okit-redline-del[data-author="3"],
.okit-redline-ins[data-author="3"] { color: var(--color-cyan); }
.okit-redline-del[data-author="4"],
.okit-redline-ins[data-author="4"] { color: var(--color-yellow); }
.okit-redline-del[data-author="5"],
.okit-redline-ins[data-author="5"] { color: var(--color-pink); }

/* Autorenplätze gegen den Text gemischt, je Modus (Spezifität größer als die Moduszeilen oben, die Reihenfolge ist egal). Hell brauchen alle sechs Plätze den Anteil, dunkel nur Blau und Pink.
   Je größer der Anteil Text, desto näher rücken die Plätze zusammen: Kontrast und Unterscheidbarkeit gehen hier gegeneinander, die gemessenen Abstände stehen im CHANGELOG. */
.theme-light .okit-redline-del[data-author="0"], .theme-light .okit-redline-ins[data-author="0"] { color: color-mix(in srgb, var(--color-blue) 60%, var(--text-normal)); }
.theme-light .okit-redline-del[data-author="1"], .theme-light .okit-redline-ins[data-author="1"] { color: color-mix(in srgb, var(--color-orange) 60%, var(--text-normal)); }
.theme-light .okit-redline-del[data-author="2"], .theme-light .okit-redline-ins[data-author="2"] { color: color-mix(in srgb, var(--color-purple) 60%, var(--text-normal)); }
.theme-light .okit-redline-del[data-author="3"], .theme-light .okit-redline-ins[data-author="3"] { color: color-mix(in srgb, var(--color-cyan) 45%, var(--text-normal)); }
.theme-light .okit-redline-del[data-author="4"], .theme-light .okit-redline-ins[data-author="4"] { color: color-mix(in srgb, var(--color-yellow) 40%, var(--text-normal)); }
.theme-light .okit-redline-del[data-author="5"], .theme-light .okit-redline-ins[data-author="5"] { color: color-mix(in srgb, var(--color-pink) 50%, var(--text-normal)); }
.theme-dark .okit-redline-del[data-author="0"], .theme-dark .okit-redline-ins[data-author="0"] { color: color-mix(in srgb, var(--color-blue) 75%, var(--text-normal)); }
.theme-dark .okit-redline-del[data-author="5"], .theme-dark .okit-redline-ins[data-author="5"] { color: color-mix(in srgb, var(--color-pink) 90%, var(--text-normal)); }
`;
