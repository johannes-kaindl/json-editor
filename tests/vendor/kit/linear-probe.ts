// vendored from obsidian-kit@0.111.0, src/testing/linear-probe.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Linearitätsprobe für Tests (ReDoS-Konvention). Nur in Tests (vitest, Node): importiert `node:vm`.
//
// Warum es sie gibt: zweimal wurde eine Regex mit überlinearer Laufzeit veröffentlicht (Welle 15 und 16),
// Welle 17 fand fünf quadratische Think-Regexe. Eine statische Prüfung (`recheck`) fängt die exponentielle
// Form; die **quadratische** fängt nur eine Messung. Die Probe wächst die Eingabe auf n = 1 000, 10 000 und
// 50 000 und prüft, ob die Laufzeit mitwächst.
//
// Die Eingabe: **Präfix = die Eingangsform der Regex, die sie anlaufen lässt, ohne dass sie passt** (bei
// `<think>…</think>` das Präfix `"<think>"`, bei `^(a+)+$` das Präfix `"a"` mit Suffix `"!"`). Eine Eingabe,
// die die Funktion früh verlassen lässt, misst den teuren Teil nie — ein Zweig vor der verdächtigen Stelle
// gehört in die Eingabe (LESSONS 2026-10-11).
//
// Unter Last (Welle 28, gemessen auf 18 Kernen mit `yes`-Prozessen, Load 9 bis 156): Die Zeitgrenze trägt ein Verhältnis t(50 000)/t(10 000) von 12, ein lineares Stück liegt ruhig bei 4,5 bis 7,5, ein
// quadratisches bei etwa 25: der Abstand ist nach beiden Seiten nur etwa Faktor zwei. Gemessen vor der Änderung, je Test 10 Läufe: die Regex- und Format-Proben (daily-notes, plugin-id, anthropicBaseOf, die
// quadratische Funktion von `pruefeLinear`) kippten in 0 von 10 bei Load 11 bis 19 und 0 von 10 bei Load 32 bis 72; `pruefeLinearFuzz` an `llm-json` (lineare Funktion, 150 000 Zeichen) fiel dagegen bei Load
// um 33 in 2 von 10 Läufen mit Verhältnis 12,3 durch (und einmal im Gate bei Load 45). Ursache: `bestOf` wiederholt einen Lauf über 500 ms nicht, t(50 000) ist eine Einzelmessung und fängt den Lastschub allein
// ab. Seit 0.72.0 wird ein überlinearer Befund am großen Lauf einmal nachgemessen (nur unter 4 s, sonst verdoppelten sich die Gegenproben); danach 0 von 15 bei Load 17 und 0 von 15 bei Load 74 bis 156. Eine
// Voraussetzung bleibt: eine dauerhafte Last weit über der Kernzahl hebt t(50 000) in beiden Messungen. Test-Funktionen für eine QUADRATISCHE Einheit laufen auf der Wanduhr (`spin`), nicht mit CPU-Schritten:
// deren Zeit wächst mit der Last und verschiebt das Verhältnis.
//
// Last als Gültigkeitsbedingung (Welle 37, CORE-TEST-22): Welle 36 maß bei Rechnerlast 95 bis 180 auf 18 Kernen Quotienten von 12 bis 20 an Funktionen, die im Direktlauf linear messen; dieselben Tests liefen
// einzeln grün. Eine Messung unter dieser Last ist keine Messung. Die Proben lesen deshalb VOR dem Lauf (und danach) die Last der letzten Minute je Kern; über `maxLastProKern` (Vorgabe {@link LINEAR_PROBE_MAX_LAST_PRO_KERN})
// werfen sie {@link LinearProbeNichtGemessen} statt ein Urteil zu liefern: weder „linear“ noch „überlinear“. Ein Wurf ist laut (kein stilles Grün, auch nicht bei einer Gegenprobe mit `expect(r.linear).toBe(false)`);
// wer den Zustand „nichts gemessen“ als Übersprungen führen will, hüllt den Aufruf in {@link mitLastSchutz} (vitest: `it("…", (ctx) => { … mitLastSchutz(ctx, () => pruefeLinear(…)) })`).
// Die Last drückt nur gegen Fehlalarme: die echten Funde (epub-exporter, Faktor 49 bis 167) liegen weit über der Grenze und kommen im Lauf bei Ruhe wieder.
import { cpus, loadavg } from "node:os";
import { createContext, runInContext } from "node:vm";

/** Die Rechnerlast, an der die Probe ihre Gültigkeit misst: Mittel der letzten Minute und Zahl der Kerne. */
export interface LinearProbeLast { load1: number; kerne: number }

/** Ab dieser Last je Kern (Mittel der letzten Minute geteilt durch die Zahl der Kerne) ist eine Messung ungültig. Vorgabe, keine Messgröße: Welle 28 maß mit `yes`-Prozessen bei 4 bis 8,7 je Kern 0 von 15 Fehlalarmen
 *  (nach der Nachmessung), Welle 36 sah bei 5 bis 10 je Kern wechselnde (echte Arbeitslast: vitest-Arbeiter mit Speicherdruck); 3 liegt darunter, ruhig sind Werte unter 1. Eine Probe mit eigener Schwelle übergibt `maxLastProKern`. */
export const LINEAR_PROBE_MAX_LAST_PRO_KERN = 3;

/** Die Last des Rechners; in Tests durch `last` ersetzbar. */
export function rechnerLast(): LinearProbeLast { return { load1: loadavg()[0] ?? 0, kerne: Math.max(1, cpus().length) }; }

export interface LinearProbeOptions {
  /** Schwelle der Last je Kern, ab der die Messung ungültig ist (`>`). Vorgabe {@link LINEAR_PROBE_MAX_LAST_PRO_KERN}; `Infinity` schaltet die Prüfung ab. */
  maxLastProKern?: number;
  /** Quelle der Last; Vorgabe {@link rechnerLast}. Für Tests mit eingespeister Last. */
  last?: () => LinearProbeLast;
}

/** Wird geworfen, wenn die Rechnerlast eine Messung ungültig macht: der Zustand „nichts gemessen“ (CORE-TEST-19), nicht „linear“ und nicht „überlinear“. */
export class LinearProbeNichtGemessen extends Error {
  constructor(readonly last: LinearProbeLast, readonly schwelle: number, readonly zeitpunkt: "vor" | "nach") {
    super(`Messung ungültig (nichts gemessen): Rechnerlast ${last.load1.toFixed(1)} bei ${last.kerne} Kernen = ${(last.load1 / last.kerne).toFixed(2)} je Kern, Schwelle ${schwelle} (${zeitpunkt} dem Lauf)`);
    this.name = "LinearProbeNichtGemessen";
  }
}

/** Wirft {@link LinearProbeNichtGemessen}, wenn die Last je Kern über der Schwelle liegt. */
export function pruefeLast(opts: LinearProbeOptions | undefined, zeitpunkt: "vor" | "nach"): void {
  const schwelle = opts?.maxLastProKern ?? LINEAR_PROBE_MAX_LAST_PRO_KERN;
  const last = (opts?.last ?? rechnerLast)();
  if (last.load1 / Math.max(1, last.kerne) > schwelle) throw new LinearProbeNichtGemessen(last, schwelle, zeitpunkt);
}

/** Der Teil des vitest-Kontexts (`it("…", (ctx) => …)`), den {@link mitLastSchutz} braucht. */
export interface LinearProbeSkipKontext { skip: (note?: string) => unknown }

/** Führt `messung` aus; ist sie wegen der Last ungültig, wird der Test übersprungen (`ctx.skip`), statt rot zu werden. Jeder andere Fehler läuft durch.
 *  `ctx.skip` wirft in vitest selbst; kehrt ein anderer Kontext zurück, wird die Ausnahme weitergereicht (nie ein stilles Weiterlaufen ohne Messwert). */
export function mitLastSchutz<T>(ctx: LinearProbeSkipKontext, messung: () => T): T {
  try {
    return messung();
  } catch (e) {
    if (e instanceof LinearProbeNichtGemessen) { ctx.skip(e.message); }
    throw e;
  }
}

/** Eingabelängen der Probe. */
export const LINEAR_PROBE_SIZES = [1_000, 10_000, 50_000] as const;

export interface LinearProbeStep { n: number; ms: number }
export interface LinearProbeResult {
  /** `t(50 000)/t(10 000) < 12` oder `t(50 000) < 50 ms`; ein Abbruch durch die Frist ist nie linear. */
  linear: boolean;
  steps: LinearProbeStep[];
  /** `t(50 000)/t(10 000)`; `Infinity` bei Abbruch. */
  ratio: number;
  /** Bei Abbruch: die Länge, bei der die Frist riss. */
  abortedAt?: number;
  /** Lesbarer Befund für `expect(r.linear, r.message)`. */
  message: string;
}

const RATIO_LIMIT = 12;
const FAST_MS = 50;

function verdict(steps: LinearProbeStep[], abortedAt: number | undefined): LinearProbeResult {
  const table = steps.map((s) => `n=${s.n}: ${s.ms.toFixed(1)} ms`).join(", ");
  if (abortedAt !== undefined) {
    return { linear: false, steps, ratio: Infinity, abortedAt, message: `Frist bei n=${abortedAt} gerissen (${table})` };
  }
  const at = (n: number): number => steps.find((s) => s.n === n)?.ms ?? 0;
  const t10 = at(10_000);
  const t50 = at(50_000);
  const ratio = t10 > 0 ? t50 / t10 : t50 > 0 ? Infinity : 0;
  const linear = t50 < FAST_MS || ratio < RATIO_LIMIT;
  return { linear, steps, ratio, message: `${linear ? "linear" : "überlinear"}: ${table}, t(50 000)/t(10 000) = ${ratio.toFixed(1)}` };
}

/** Bester von bis zu drei Läufen (Rauschen drücken); ein Lauf über 500 ms wird nicht wiederholt. */
function bestOf(run: () => void): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    run();
    const ms = performance.now() - t0;
    best = Math.min(best, ms);
    if (ms > 500) break;
  }
  return best;
}

/** Ab dieser Laufzeit bei n = 50 000 wird ein überlinearer Befund nicht nachgemessen: eine echt quadratische Funktion braucht dort sechs bis vierzehn Sekunden, das Nachmessen verdoppelte die Gegenproben. */
const RETRY_MAX_MS = 4_000;

/** Zweite Nachmessung: bleibt der Befund nach der ersten überlinear, aber mit Quotient unter {@link ZWEITE_NACHMESSUNG_RATIO} und t(50 000) unter {@link ZWEITE_NACHMESSUNG_MS}, wird der große Lauf noch einmal wiederholt.
 *  Welle 36 (Last 95 bis 180): Fehlalarme mit Quotient 12 bis 20 bei 60 bis 120 ms; ein echter Fund liegt weit darüber (epub-exporter: 1 233 ms bei 50 000, Faktor 49), eine quadratische Funktion erreicht den Quotienten 25. */
const ZWEITE_NACHMESSUNG_RATIO = 25;
const ZWEITE_NACHMESSUNG_MS = 200;

/** Das Urteil, mit Nachmessung des GROSSEN Laufs: `bestOf` wiederholt einen Lauf über 500 ms nicht, t(50 000) ist also eine Einzelmessung, t(10 000) dagegen der Beste von drei. Unter Last
 *  (gemessen Welle 28, Load über 30 auf 18 Kernen) verschiebt das das Verhältnis nach oben: eine lineare Funktion (`llm-json`, 150 000 Zeichen) fiel in 2 von 10 Läufen mit 12,3 über die Grenze 12 (ruhig 4,5 bis 7,5).
 *  Ist das Urteil überlinear und der große Lauf kürzer als {@link RETRY_MAX_MS}, wird er einmal wiederholt und der bessere zählt; eine echt quadratische Funktion bleibt beim zweiten Lauf überlinear.
 *  Seit Welle 37 ein zweites Mal, wenn der Befund knapp bleibt (Quotient unter 25 und t(50 000) unter 200 ms): drei Läufe bei 50 000, der beste zählt. Ein Quotient ab 25 oder ein langer Lauf wird nicht noch einmal gefahren.
 *  Exportiert, damit sich das Verfahren mit Zahlen statt Uhren prüfen lässt (`nachmessen` liefert die Zeit eines weiteren Laufs bei 50 000). */
export function verdictMitNachmessung(steps: LinearProbeStep[], nachmessen: () => number): LinearProbeResult {
  let aktuell = steps;
  let v = verdict(aktuell, undefined);
  for (let versuch = 0; versuch < 2; versuch++) {
    const t50 = aktuell.find((s) => s.n === 50_000)?.ms ?? 0;
    if (v.linear || t50 >= RETRY_MAX_MS) return v;
    // Der erste Wiederholungslauf gilt für jeden überlinearen Befund unter 4 s; der zweite nur für den knappen.
    if (versuch === 1 && (v.ratio >= ZWEITE_NACHMESSUNG_RATIO || t50 >= ZWEITE_NACHMESSUNG_MS)) return v;
    const nochmal = nachmessen();
    if (nochmal >= t50) continue;
    aktuell = aktuell.map((s) => (s.n === 50_000 ? { n: s.n, ms: nochmal } : s));
    v = verdict(aktuell, undefined);
  }
  return v;
}

/** Misst `re.test(praefix.repeat(n) + suffix)` für n ∈ {1 000, 10 000, 50 000} in einem `node:vm`-Kontext mit
 *  Frist je Lauf (`timeoutMs`, Default 2 000): eine exponentielle Regex hängt sonst den Testlauf, und in einen
 *  Worker ließe sich die Regex nicht schicken (nicht klonbar). Ein Abbruch ist `linear: false`. Über der Lastschwelle wirft sie {@link LinearProbeNichtGemessen}. */
export function pruefeLinearRegex(re: RegExp, praefix: string, suffix = "", opts?: { timeoutMs?: number } & LinearProbeOptions): LinearProbeResult {
  pruefeLast(opts, "vor");
  const timeout = opts?.timeoutMs ?? 2_000;
  const steps: LinearProbeStep[] = [];
  for (const n of LINEAR_PROBE_SIZES) {
    const ctx = createContext({ re, input: praefix.repeat(n) + suffix });
    try {
      const ms = bestOf(() => { runInContext("re.lastIndex = 0; re.test(input);", ctx, { timeout }); });
      steps.push({ n, ms });
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") { pruefeLast(opts, "nach"); return verdict(steps, n); }
      throw e;
    }
  }
  pruefeLast(opts, "nach");
  return verdict(steps, undefined);
}

/** Misst `fn(eingabe(n))` im Thread für n ∈ {1 000, 10 000, 50 000} — für die quadratische Form in beliebigem
 *  Code. `eingabe` ist ein Text, der n-mal wiederholt wird, oder eine Funktion `n → Argument`. **Ohne Frist:**
 *  eine exponentielle Regex gehört in `pruefeLinearRegex`, sonst hängt der Lauf. Über der Lastschwelle wirft sie {@link LinearProbeNichtGemessen}. */
export function pruefeLinear<T>(fn: (eingabe: T) => unknown, eingabe: string | ((n: number) => T), opts?: LinearProbeOptions): LinearProbeResult {
  pruefeLast(opts, "vor");
  const make = typeof eingabe === "string" ? (n: number): T => eingabe.repeat(n) as T : eingabe;
  const steps: LinearProbeStep[] = [];
  let groß: T | undefined;
  for (const n of LINEAR_PROBE_SIZES) {
    const arg = make(n);
    if (n === 50_000) groß = arg;
    steps.push({ n, ms: bestOf(() => { fn(arg); }) });
  }
  const v = verdictMitNachmessung(steps, () => bestOf(() => { fn(groß as T); }));
  pruefeLast(opts, "nach");
  return v;
}

/** Ein Befund von {@link pruefeLinearFuzz}. */
export interface LinearFuzzSuspect {
  /** Die Einheit, die `n`-mal wiederholt wurde — bei `"verschachtelt"` die Anzeigeform `öffner…mitte…schließer`. */
  einheit: string;
  form: "wiederholt" | "verschachtelt";
  /** Lesbarer Befund mit den Messwerten, für `expect(…, message)`. */
  message: string;
}

export interface LinearFuzzOptions {
  /** Die Zeichen, aus denen die Einheiten gebaut werden: ein Text (zerlegt nach Codepunkten) oder eine Liste (ein Eintrag darf mehrere
   *  Zeichen haben, etwa `"<think>"`). */
  alphabet: string | readonly string[];
  /** Längste Einheit in Alphabet-Einträgen. Default 3. Die Zahl der Einheiten wächst mit `alphabet.length ** maxLaenge`. */
  maxLaenge?: number;
  /** Zusätzlich je Paar (öffner, schließer) die Form `öffner.repeat(n) + mitte + schließer.repeat(n)` — die verschachtelte Familie, die
   *  eine wiederholte Einheit nie erzeugt. Default `true`. */
  verschachtelt?: boolean;
  /** Einen Verdacht vor der Meldung einmal frisch nachmessen (Leiter von vorn) und nur melden, wenn er bleibt. Default `true`. */
  nachmessen?: boolean;
  /** Das Zeichen zwischen Öffner und Schließer. Default `"x"`. */
  mitte?: string;
  /** Schwelle der Rechnerlast je Kern ({@link LinearProbeOptions.maxLastProKern}). Der Fuzz prüft sie vor JEDER Eingabe und am Ende: ein Lastschub mitten im Lauf macht ihn ungültig. */
  maxLastProKern?: number;
  /** Quelle der Last ({@link LinearProbeOptions.last}); für Tests. */
  last?: () => LinearProbeLast;
}

export interface LinearFuzzResult {
  /** `true`, wenn kein Verdacht übrig blieb. */
  linear: boolean;
  verdaechtig: LinearFuzzSuspect[];
  /** Wie viele Eingaben gemessen wurden (Einheiten plus Paare). */
  gemessen: number;
}

/** Ab dieser Zeit bei n = 10 000 UND dem Faktor gegen n = 1 000 gilt eine Einheit schon als überlinear — 50 000 wird dann nie gefahren. */
const FUZZ_EARLY_MS = 150;
const FUZZ_EARLY_FACTOR = 30;

/** Die Leiter für EINE Eingabeform: 1 000 und 10 000 zuerst; reißt t(10 000) die Grenze von {@link FUZZ_EARLY_MS} und ist der Faktor gegen
 *  t(1 000) größer als {@link FUZZ_EARLY_FACTOR}, ist es überlinear und 50 000 entfällt (eine quadratische Funktion hängt dort 6–14 s).
 *  Sonst das Urteil von {@link pruefeLinear}. Ein Wurf der Funktion beendet den gemessenen Lauf und zählt als dessen Zeit. */
function leiter(fn: (eingabe: string) => unknown, make: (n: number) => string, label: string): { linear: boolean; message: string } {
  const lauf = (n: number): LinearProbeStep => {
    const arg = make(n);
    return { n, ms: bestOf(() => { try { fn(arg); } catch { /* gemessen wird die Zeit, nicht die Gültigkeit der Eingabe */ } }) };
  };
  const s1 = lauf(1_000);
  const s10 = lauf(10_000);
  if (s10.ms > FUZZ_EARLY_MS && s10.ms / Math.max(s1.ms, 0.05) > FUZZ_EARLY_FACTOR) {
    return {
      linear: false,
      message: `${label}: überlinear — n=1000: ${s1.ms.toFixed(1)} ms, n=10000: ${s10.ms.toFixed(1)} ms (Faktor ${(s10.ms / Math.max(s1.ms, 0.05)).toFixed(0)}), 50 000 nicht gefahren`,
    };
  }
  const v = verdictMitNachmessung([s1, s10, lauf(50_000)], () => lauf(50_000).ms);
  return { linear: v.linear, message: `${label}: ${v.message}` };
}

/** Erschöpfender Fuzz für die Linearität (CORE-TEST-26 (b)): misst `fn` für JEDE Einheit aus `alphabet` bis `maxLaenge` Zeichen,
 *  `n`-mal wiederholt, und — mit `verschachtelt` — für jedes Paar `öffner.repeat(n) + mitte + schließer.repeat(n)`. Handgewählte Eingaben
 *  erreichen nur die Stellen, die ihr Autor schon verdächtigt; dieser Lauf findet den Rest (am JSON-Leser aus 3d-codeblocks fand er zwei
 *  quadratische Familien, die kein handgeschriebener Test hatte).
 *
 *  Je Eingabe die Leiter von {@link pruefeLinear}, aber mit Abkürzung: 1 000 und 10 000 zuerst, **50 000 nur ohne Verdacht**. Ein Verdacht
 *  wird vor der Meldung **einmal frisch nachgemessen** (`nachmessen`): Rauschen bei großen Eingaben meldete der erste Prototyp als Befund
 *  (`{]x` am JSON-Leser — alt und neu linear, Quotient 4,9 und 5,8).
 *
 *  Ein Wurf von `fn` bricht den Fuzz nicht ab: gemessen wird die Laufzeit, nicht die Gültigkeit der Eingabe.
 *
 *  ⚠️ **Testlaufzeit.** Rund 110 ms je Eingabe (Zeichenketten bis 150 kB aufbauen, Bester von drei). Ein Alphabet von 8 Zeichen mit
 *  `maxLaenge` 3 sind 584 Einheiten plus 64 Paare und kostet je Funktion 72–90 s; 6 Zeichen etwa 30 s. Das sprengt vitests 5-s-Standard:
 *  `it(…, 180_000)` setzen und im Kit-Test ein kleines Alphabet wählen. Ein Lauf unter hoher Last wird langsamer und, seit Welle 37, **ungültig**: über der Lastschwelle (vor jeder Eingabe und am Ende geprüft) wirft er
 *  {@link LinearProbeNichtGemessen}, statt Fehlalarme zu melden; `mitLastSchutz(ctx, …)` macht daraus ein Übersprungen.
 *
 *  @example
 *  const r = pruefeLinearFuzz((s) => extractJson(s), { alphabet: ["[", "]", '"', "\\", "x"] }); // it(…, 180_000)
 *  expect(r.verdaechtig, JSON.stringify(r.verdaechtig)).toEqual([]);
 */
export function pruefeLinearFuzz(fn: (eingabe: string) => unknown, opts: LinearFuzzOptions): LinearFuzzResult {
  const alphabet = typeof opts.alphabet === "string" ? Array.from(opts.alphabet) : [...opts.alphabet];
  if (alphabet.length === 0) throw new Error("pruefeLinearFuzz: alphabet ist leer");
  const maxLaenge = opts.maxLaenge ?? 3;
  if (!Number.isInteger(maxLaenge) || maxLaenge < 1) throw new Error(`pruefeLinearFuzz: maxLaenge muss eine ganze Zahl ≥ 1 sein, ist ${String(maxLaenge)}`);
  const verschachtelt = opts.verschachtelt ?? true;
  const nachmessen = opts.nachmessen ?? true;
  const mitte = opts.mitte ?? "x";

  const verdaechtig: LinearFuzzSuspect[] = [];
  let gemessen = 0;
  const pruefe = (einheit: string, form: LinearFuzzSuspect["form"], make: (n: number) => string): void => {
    pruefeLast(opts, "vor");
    gemessen += 1;
    let r = leiter(fn, make, einheit);
    if (!r.linear && nachmessen) r = leiter(fn, make, einheit);
    if (!r.linear) verdaechtig.push({ einheit, form, message: r.message });
  };

  // Einheiten nach Länge: erst alle einzelnen Zeichen, dann alle Paare, … — ein Befund kurzer Einheiten steht vorn.
  let stufe: string[] = [""];
  for (let laenge = 1; laenge <= maxLaenge; laenge++) {
    const naechste: string[] = [];
    for (const vorn of stufe) for (const z of alphabet) naechste.push(vorn + z);
    for (const einheit of naechste) pruefe(einheit, "wiederholt", (n) => einheit.repeat(n));
    stufe = naechste;
  }
  if (verschachtelt) {
    for (const o of alphabet) for (const c of alphabet) pruefe(`${o}…${mitte}…${c}`, "verschachtelt", (n) => o.repeat(n) + mitte + c.repeat(n));
  }
  pruefeLast(opts, "nach");
  return { linear: verdaechtig.length === 0, verdaechtig, gemessen };
}

/** Die drei Proben, an den vitest-Kontext gebunden: jede übersetzt „nichts gemessen“ in ein Übersprungen ({@link mitLastSchutz}). Für Tests mit mehreren Aufrufen:
 *  `it("…", (ctx) => { const p = lastGeschuetzt(ctx); const r = p.pruefeLinear(fn, eingabe); … })`. */
export function lastGeschuetzt(ctx: LinearProbeSkipKontext): {
  pruefeLinear: <T>(fn: (eingabe: T) => unknown, eingabe: string | ((n: number) => T), opts?: LinearProbeOptions) => LinearProbeResult;
  pruefeLinearRegex: (re: RegExp, praefix: string, suffix?: string, opts?: { timeoutMs?: number } & LinearProbeOptions) => LinearProbeResult;
  pruefeLinearFuzz: (fn: (eingabe: string) => unknown, opts: LinearFuzzOptions) => LinearFuzzResult;
} {
  return {
    pruefeLinear: (fn, eingabe, opts) => mitLastSchutz(ctx, () => pruefeLinear(fn, eingabe, opts)),
    pruefeLinearRegex: (re, praefix, suffix, opts) => mitLastSchutz(ctx, () => pruefeLinearRegex(re, praefix, suffix, opts)),
    pruefeLinearFuzz: (fn, opts) => mitLastSchutz(ctx, () => pruefeLinearFuzz(fn, opts)),
  };
}
