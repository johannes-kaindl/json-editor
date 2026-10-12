// vendored from obsidian-kit@0.57.0, src/testing/linear-probe.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
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
import { createContext, runInContext } from "node:vm";

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

/** Misst `re.test(praefix.repeat(n) + suffix)` für n ∈ {1 000, 10 000, 50 000} in einem `node:vm`-Kontext mit
 *  Frist je Lauf (`timeoutMs`, Default 2 000): eine exponentielle Regex hängt sonst den Testlauf, und in einen
 *  Worker ließe sich die Regex nicht schicken (nicht klonbar). Ein Abbruch ist `linear: false`. */
export function pruefeLinearRegex(re: RegExp, praefix: string, suffix = "", opts?: { timeoutMs?: number }): LinearProbeResult {
  const timeout = opts?.timeoutMs ?? 2_000;
  const steps: LinearProbeStep[] = [];
  for (const n of LINEAR_PROBE_SIZES) {
    const ctx = createContext({ re, input: praefix.repeat(n) + suffix });
    try {
      const ms = bestOf(() => { runInContext("re.lastIndex = 0; re.test(input);", ctx, { timeout }); });
      steps.push({ n, ms });
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") return verdict(steps, n);
      throw e;
    }
  }
  return verdict(steps, undefined);
}

/** Misst `fn(eingabe(n))` im Thread für n ∈ {1 000, 10 000, 50 000} — für die quadratische Form in beliebigem
 *  Code. `eingabe` ist ein Text, der n-mal wiederholt wird, oder eine Funktion `n → Argument`. **Ohne Frist:**
 *  eine exponentielle Regex gehört in `pruefeLinearRegex`, sonst hängt der Lauf. */
export function pruefeLinear<T>(fn: (eingabe: T) => unknown, eingabe: string | ((n: number) => T)): LinearProbeResult {
  const make = typeof eingabe === "string" ? (n: number): T => eingabe.repeat(n) as T : eingabe;
  const steps: LinearProbeStep[] = [];
  for (const n of LINEAR_PROBE_SIZES) {
    const arg = make(n);
    steps.push({ n, ms: bestOf(() => { fn(arg); }) });
  }
  return verdict(steps, undefined);
}
