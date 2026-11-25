// vendored from obsidian-kit@0.111.0, src/pure/note-edit.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Herkunft: vault-rag `src/note_edit.ts` (Welle 34, Minion rag2; Wunsch ans Kit über das Bibliothek-Gate), aufgenommen in Welle 35. Gegenüber der Vorlage geändert, jeweils mit Grund:
// (1) Ergebnis mit `changed`, `via`, `persisted` und dem gefangenen Fehler (Z5), (2) ein Wurf von `decide` lehnt das Promise ab, auf beiden Wegen (Z6; die Vorlage meldete ihn auf dem
// Vault-Weg als `not-found`), (3) Optionen statt einer Zahl, mit einsetzbarem Zeitgeber, (4) `swapNote` vergleicht ohne BOM und mit `\r\n` als `\n` und schreibt in den Zeilenenden der Notiz
// zurück (S1, S2; die Vorlage meldete jede im Quellmodus offene CRLF-Notiz als geändert), (5) `swapNote` wirft nie und trennt `same` von `swapped` (S3), (6) die Differenzspanne trennt kein
// Surrogatpaar, (7) `readNoteText` wohnt hier statt privat in `panel-accept`.
//
// ## Was das Modul tut
//
// Eine Nutzernotiz atomar ändern, ohne Fenster zwischen Lesen und Schreiben. Kein `obsidian`-Import; die Ports (`WritePorts`, `EditorHandle` aus `block-writer`) liefert
// `obsidianWritePorts(app)`. Die Domänen-Annahme ist die Notiz in einem Vault mit möglichem Quell-Editor, deshalb liegt das Modul hier und nicht in code-kit.
//
// `editAtomic(ports, path, decide, opts?)`: Entscheidung UND neuer Text entstehen aus dem Stand, über den geschrieben wird.
// - **Quelle und Ziel sind dasselbe (Z2).** Ist die Notiz in einem Blatt im Quellmodus offen (`ports.editorFor(path)`), liest und schreibt `editAtomic` den Editor: ein ungespeicherter Stand zählt,
//   Strg+Z wirkt. Sonst geht es über `vault.process`. Enthält der Editortext ein `\r`, stimmen Editor-Offsets und Rohtext nicht sicher überein; dann bleibt es beim Weg über `vault.process`. (Im echten Obsidian ist der Zweig nicht erreicht: `getValue()` liefert LF, siehe „Gemessen“.)
// - **Ein Zug (Z1).** Auf dem Editorweg laufen `getValue`, `decide` und `replaceRange` ohne `await` hintereinander, auf dem Vault-Weg läuft `decide` im Callback von `vault.process`. Das
//   Gegenteil, Lesen, `await`, Schreiben, überschreibt, was in der Lücke getippt oder synchronisiert wurde.
// - **Entscheidung (Z3).** `decide(text)` liefert `{ outcome, next }`; `next: null` oder `next === text` schreibt nichts, `outcome` geht unverändert an den Aufrufer. `vault.process` darf den
//   Callback wiederholen: es zählt der letzte Aufruf, `decide` muss rein sein.
// - **Editorweg (Z4).** Ersetzt wird nur die Spanne, in der sich alter und neuer Text unterscheiden, mit einem `replaceRange` (ein Undo-Schritt; Schreibmarke und Auswahl außerhalb bleiben).
//   Die Spanne reißt kein Surrogatpaar auseinander.
// - **Ergebnis (Z5).** `{ kind: "done", outcome, changed, via, persisted }` oder `{ kind: "error", reason: "not-found" | "write-failed", error }`. `not-found`: `process` warf, bevor `decide` lief.
//   `write-failed`: `decide` lief, das Schreiben warf.
// - **Wurf in `decide` (Z6)** ist ein Programmierfehler: Das Promise wird abgelehnt, nichts geschrieben, auf beiden Wegen gleich. **Sonst wirft `editAtomic` nie (Z8).**
// - **Warten auf die Platte (Z7).** Nach einem Schreiben über den Editor wartet `editAtomic` bis zu `persistWaitMs` (Standard 3000), dass `ports.vault.read(path)` `next` liefert; Obsidian speichert den
//   Editor erst nach rund 2 s, und wer danach von der Platte liest (Plugin-API, Smoke), sähe sonst den alten Stand. `persisted` sagt, ob das, was dieser Aufruf
//   geschrieben hat, auf der Platte steht; ohne Schreiben gibt es nichts zu warten. Reißt die Frist, bleibt es bei `done` (der Text steht im Editor). `persistWaitMs: 0` wartet nicht und liest nicht
//   (`persisted` falsch). Verglichen wird ohne BOM und mit `\r\n` als `\n`. Auf dem Vault-Weg und wenn nichts zu schreiben war, ist `persisted` wahr; bei einem Editor mit ungespeichertem Text und
//   `decide` ohne Schreiben also auch dann, wenn die Platte den Editortext (noch) nicht trägt.
//   Die Frist zählt die Wartezeit in Schritten zu 50 ms (die Lesezeit kommt dazu); der Zeitgeber ist über `opts.sleep` einsetzbar, damit kein Test echte Zeit braucht.
//
// `swapNote(ports, path, expected, next, opts?)`: Vergleichen und Tauschen. `next` wird nur geschrieben, wenn die Notiz im Zug des Schreibens noch `expected` trägt.
// - **Gleicher Stand (S1)** heißt: gleich nach Abzug eines führenden BOM und mit `\r\n` als `\n`. Adapter, Vault und Editor führen BOM und Zeilenenden verschieden; ein Editor liefert LF, die Platte
//   einer CRLF-Notiz nicht.
// - **Zeilenenden bleiben (S2).** Auf dem Vault-Weg wird `next` in den Zeilenenden des aktuellen Texts geschrieben (`detectEol`: kommt irgendwo `\r\n` vor, ist es CRLF), ein BOM der Notiz bleibt.
//   Auf dem Editorweg geht `next` mit LF und ohne BOM in den Editor, der beim Speichern entscheidet.
//   **Benannte Grenze:** Eine Notiz mit gemischten Zeilenenden (`a\r\nb\nc\n`) kommt auf dem Vault-Weg einheitlich als CRLF zurück, weil `detectEol` bei irgendeinem `\r\n` CRLF meldet. Unberührte
//   LF-Zeilen ändern dabei ihr Zeilenende, Text geht nicht verloren (`tests/note-edit.test.ts`, „benannte Grenze von S2“: erwartet `a\r\nb\r\nC\r\n`). Eine spätere Änderung daran wird dort sichtbar.
// - **Ergebnis (S3).** `swapped` (mit `via`, `persisted`), `same` (die Notiz trägt schon `next`, nichts geschrieben), `stale` (die Notiz hat sich geändert, nichts geschrieben) oder `error`. Wirft nie.
//
// `readNoteText(ports, path)`: liest aus der Quelle, über die `editAtomic` schreiben würde (offener Quell-Editor zuerst, sonst `vault.read`). **Regel für Aufrufer:** Wer einen Stand als `expected`
// festhält und später mit `swapNote` tauscht, liest ihn mit `readNoteText`, nicht mit `app.vault.read`; sonst vergleicht er die Platte mit dem Editor.
//
// ## Gemessen im echten Obsidian (Pilot `note-edit`, Welle 35; Obsidian 1.15.1, macOS, Desktop; zwei Läufe mit je 9 von 9 Punkten grün, die Werte zu Zeilenenden und zu Undo und Schreibmarke stammen aus dem zweiten, weil der erste dort eine Treiberlücke hatte; ungemessen: iOS, Windows, Linux, andere Obsidian-Versionen)
//
// - **Zeit bis zur Platte (P2):** Nach einem Schreiben über den Editor steht der Text nach 2036, 2038 und 2030 ms auf der Platte (Lauf davor: 2015, 2042, 2026 ms): Obsidian speichert den Editor nach rund 2 s, die Frist von 3000 ms trägt. `editor.undo()` stellt
//   den alten Text her (3 von 3 in beiden Läufen).
// - **Ungespeicherter Text (P3):** `decide` sieht den getippten, noch nicht gespeicherten Text, er bleibt erhalten, die Schreibmarke bleibt. **Gegenprobe ohne Kit-Code (P3 und P9):** `app.vault.process` auf eine Notiz mit ungespeichertem Editortext arbeitet auf dem Text der PLATTE; Obsidian
//   führt die ungespeicherte Eingabe danach nach Position in den neuen Stand ein. Hängt der Callback seinen Zusatz an die Stelle an, an der der Nutzer eben getippt hat (Ende der Notiz), hängt der Ausgang vom Takt ab: in P3 (Aufruf wenige Dutzend Millisekunden nach dem Tippen) stand das Getippte
//   vor dem Zusatz (`Anfang\nGETIPPT\nPROCESS`), in P9 (Lücke 100 ms und 600 ms, je 7 von 7 Läufen) dahinter: Zusatz `\nAnhang` an `Anfang\n` ergab `Anfang\n\nAnhangGETIPPT`. Der Text ging nie verloren, aber seine Reihenfolge ist verdreht, und `vault.process` hat den ungespeicherten Stand nie gesehen. Wo
//   `vault.process` an einer ANDEREN Stelle ändert, ist ungemessen. Das ist die Begründung des Editorwegs: Quelle und Ziel sind der Editorstand, nicht die Platte, die rund zwei Sekunden hinterherhinkt. Der Wert bleibt gemessen an einer Version (Obsidian 1.15.1), das Verhalten von `vault.process` ist undokumentiert.
//   Schreibmarke: bei `vault.process` und bei `editAtomic` gleich geblieben (P3).
// - **Undo-Abstand (P9):** `editor.undo()` nach `editAtomic` nimmt bei 100 ms Abstand zur Tastatureingabe die Änderung des Kits UND das Getippte zurück (3 von 3: Editor danach `Anfang\n` statt `Anfang\nGETIPPT`; die Änderung des Kits hängt sich an die Gruppe des Tippens), bei 600 ms (2 von 2) und 2000 ms (2 von 2)
//   nur die Änderung des Kits (Lücke gestempelt im Seitenkontext, 101 bis 102, 602 und 2002 ms). Wo zwischen 100 und 600 ms die Grenze liegt, ist nicht gemessen (die Gruppierung des Editorverlaufs, vermutlich eine Gruppenfrist von 500 ms, ist nicht untersucht). Ein Klick im Panel liegt in der Regel darüber. Bei
//   `vault.process` war der Zusatz in beiden Abständen ein eigener Schritt (7 von 7 und 2 von 2, Strg+Z nahm nur den Zusatz).
// - **Lesemodus (P4):** `editorFor` liefert dort `null`, der Vault-Weg schreibt, die Ansicht zeigt `next`.
// - **Zeilenenden (P5):** `getValue()` einer CRLF-Notiz liefert LF, nie ein `\r`: der `\r`-Zweig in `editAtomic` wird im echten Obsidian nicht erreicht. `swapNote` mit `expected` von der Platte (CRLF) und LF im Editor ergibt `swapped` über den Editor (der Fehler der vault-rag-Fassung
//   tritt nicht auf). **Obsidian speichert eine im Quellmodus offene CRLF-Notiz als LF, gleich ob der Nutzer tippt (gemessen: Tastatureingabe ohne Kit-Code, Platte danach LF) oder das Kit schreibt; geschlossene Notizen (Vault-Weg) behalten CRLF** (gemessen: `a\r\nB\r\nc\r\n`).
// - **Zwei Blätter (P6):** `editorFor` liefert das erste passende Blatt im Quellmodus; nach 1,5 s tragen beide Editoren und die Platte `next`.
// - **Änderung von außen (P7):** eine Notiz, die zwischen `readNoteText` und `swapNote` auf der Platte geändert wurde, ergibt `stale`, die Platte bleibt unverändert.
// - **Zwei Aufrufe ohne `await` dazwischen (P8):** beide Änderungen bleiben erhalten, auf dem Vault- und auf dem Editorweg. Auf dem Editorweg meldet der erste Aufruf `persisted: false` (die Platte trägt nie nur seinen Text, das spätere Schreiben überholt ihn, er wartet die volle Frist), der zweite `true`;
//   das ist gewollt: `persisted` sagt, ob das, was dieser Aufruf geschrieben hat, auf der Platte steht (Z7).
import { detectEol } from "./text-window";
import type { EditorHandle, WritePorts } from "./block-writer";

const BOM = "\uFEFF";
const POLL_MS = 50;
const DEFAULT_PERSIST_WAIT_MS = 3000;

/** Was `decide` aus dem aktuellen Text macht: `next` = neuer Text oder `null` (nichts schreiben), `outcome` = was der Aufrufer zurückbekommt. */
export interface EditDecision<T> { outcome: T; next: string | null }

export interface EditOptions {
  /** Wie lange nach einem Schreiben über den Editor auf die Platte gewartet wird (Standard 3000 ms); 0 wartet und liest nicht. */
  persistWaitMs?: number;
  /** Zeitgeber für das Warten (Standard: ein `window`-Timer). Tests setzen einen ein, der keine echte Zeit braucht. */
  sleep?: (ms: number) => Promise<void>;
}

export type EditResult<T> =
  | { kind: "done"; outcome: T; changed: boolean; via: "editor" | "vault"; persisted: boolean }
  | { kind: "error"; reason: "not-found" | "write-failed"; error: unknown };

export type SwapResult =
  | { kind: "swapped"; via: "editor" | "vault"; persisted: boolean }
  | { kind: "same" }
  | { kind: "stale" }
  | { kind: "error"; reason: "not-found" | "write-failed"; error: unknown };

/** Position `offset` im Text als Zeile/Zeichen (UTF-16, wie CodeMirror/Obsidian). */
function posAt(text: string, offset: number): { line: number; ch: number } {
  let line = 0;
  let last = -1;
  for (let i = text.indexOf("\n"); i !== -1 && i < offset; i = text.indexOf("\n", i + 1)) { line++; last = i; }
  return { line, ch: offset - (last + 1) };
}

const isHigh = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** Ersetzt im Editor nur die Spanne, in der `cur` und `next` sich unterscheiden: Cursor, Auswahl und Undo-Verlauf der übrigen Notiz bleiben. Die Grenzen
 *  liegen nie mitten in einem Surrogatpaar (ein `replaceRange` dorthin zerrisse das Zeichen). */
function replaceDiff(editor: EditorHandle, cur: string, next: string): void {
  let a = 0;
  const max = Math.min(cur.length, next.length);
  while (a < max && cur.charCodeAt(a) === next.charCodeAt(a)) a++;
  // Der gemeinsame Anfang endet zwischen hohem und niedrigem Teil eines Paars: das Paar gehört ganz in die Spanne.
  if (a > 0 && isHigh(cur.charCodeAt(a - 1))) a--;
  let b = 0;
  while (b < max - a && cur.charCodeAt(cur.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++;
  // Der gemeinsame Schluss beginnt mit dem niedrigen Teil eines Paars, dessen hoher Teil in der Spanne liegt.
  if (b > 0 && isLow(cur.charCodeAt(cur.length - b))) b--;
  editor.replaceRange(next.slice(a, next.length - b), posAt(cur, a), posAt(cur, cur.length - b));
}

/** Vergleichsform zweier Notiztexte: ohne führendes BOM, `\r\n` als `\n`. */
function plain(text: string): string { return (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r\n/g, "\n"); }

const defaultSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

/** Wartet, bis die Datei auf der Platte `next` trägt, höchstens `maxMs`. `true` = sie trägt es. */
async function waitPersisted(ports: WritePorts, path: string, next: string, maxMs: number, sleep: (ms: number) => Promise<void>): Promise<boolean> {
  if (!(maxMs > 0)) return false;
  const want = plain(next);
  let waited = 0;
  for (;;) {
    try { if (plain(await ports.vault.read(path)) === want) return true; } catch { return false; }
    if (waited >= maxMs) return false;
    const step = Math.min(POLL_MS, maxMs - waited);
    try { await sleep(step); } catch { return false; }
    waited += step;
  }
}

/** Der Editor, über den geschrieben würde, samt seinem Text; `null`, wenn die Notiz nicht im Quellmodus offen ist oder der Text ein `\r` enthält (dann geht es über `vault.process`). */
function sourceEditor(ports: WritePorts, path: string): { editor: EditorHandle; text: string } | null {
  try {
    const editor = ports.editorFor(path);
    if (!editor) return null;
    const text = editor.getValue();
    return text.includes("\r") ? null : { editor, text };
  } catch {
    return null;
  }
}

/** Notiztext aus derselben Quelle, über die `editAtomic` schreiben würde: offener Quell-Editor (ungespeicherter Stand, LF), sonst die Platte. */
export async function readNoteText(ports: WritePorts, path: string): Promise<string> {
  return sourceEditor(ports, path)?.text ?? (await ports.vault.read(path));
}

/** Ändert die Notiz `path` aus ihrem aktuellen Text, in einem Zug. Wirft nur, wenn `decide` wirft (Programmierfehler); jedes andere Scheitern ist ein `error`-Ergebnis. */
export async function editAtomic<T>(
  ports: WritePorts,
  path: string,
  decide: (text: string) => EditDecision<T>,
  opts: EditOptions = {},
): Promise<EditResult<T>> {
  const source = sourceEditor(ports, path);
  if (source) {
    // Ab hier bis `replaceRange` kein `await`: getValue (oben), decide und der Schreibzug sind ein Zug.
    const d = decide(source.text);
    if (d.next === null || d.next === source.text) return { kind: "done", outcome: d.outcome, changed: false, via: "editor", persisted: true };
    try { replaceDiff(source.editor, source.text, d.next); } catch (error) { return { kind: "error", reason: "write-failed", error }; }
    const persisted = await waitPersisted(ports, path, d.next, opts.persistWaitMs ?? DEFAULT_PERSIST_WAIT_MS, opts.sleep ?? defaultSleep);
    return { kind: "done", outcome: d.outcome, changed: true, via: "editor", persisted };
  }
  // `vault.process` darf den Callback wiederholen: jeder Aufruf beginnt von vorn, es zählt der letzte.
  let decision: EditDecision<T> | null = null;
  let changed = false;
  let thrown: { error: unknown } | null = null;
  try {
    await ports.vault.process(path, (current) => {
      decision = null;
      thrown = null;
      try {
        decision = decide(current);
      } catch (error) {
        thrown = { error };
        throw error;
      }
      changed = decision.next !== null && decision.next !== current;
      return decision.next ?? current;
    });
  } catch (error) {
    if (thrown !== null) throw (thrown as { error: unknown }).error;
    return { kind: "error", reason: decision === null ? "not-found" : "write-failed", error };
  }
  const last = decision as EditDecision<T> | null;
  // `process` kehrte zurück, ohne den Callback je zu rufen: die Notiz war nicht zu lesen.
  if (last === null) return { kind: "error", reason: "not-found", error: new Error("vault.process did not run") };
  return { kind: "done", outcome: last.outcome, changed, via: "vault", persisted: true };
}

type Swap = "swap" | "same" | "stale";

/** Tauscht den Notiztext `expected` gegen `next` — nur, wenn die Notiz im Augenblick des Schreibens noch `expected` trägt (Vergleich ohne BOM, `\r\n` als `\n`). Wirft nie. */
export async function swapNote(ports: WritePorts, path: string, expected: string, next: string, opts: EditOptions = {}): Promise<SwapResult> {
  const want = plain(expected);
  const target = plain(next);
  const r = await editAtomic<Swap>(
    ports, path,
    (current) => {
      const now = plain(current);
      if (now === target) return { outcome: "same", next: null };
      if (now !== want) return { outcome: "stale", next: null };
      // In den Zeilenenden und mit dem BOM des Texts, der gerade dasteht; ein Editortext ist LF ohne BOM, dann kommt LF ohne BOM heraus.
      const eol = detectEol(current);
      const written = (current.startsWith(BOM) ? BOM : "") + (eol === "\n" ? target : target.replace(/\n/g, eol));
      return { outcome: "swap", next: written };
    },
    opts,
  ).catch((error: unknown): EditResult<Swap> => ({ kind: "error", reason: "write-failed", error }));
  if (r.kind === "error") return r;
  if (r.outcome === "stale") return { kind: "stale" };
  if (r.outcome === "same" || !r.changed) return { kind: "same" };
  return { kind: "swapped", via: r.via, persisted: r.persisted };
}
