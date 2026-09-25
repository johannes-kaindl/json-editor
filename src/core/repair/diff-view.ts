import type { DiffLine } from "../../vendor/kit/diff";

export type RowKind = "ctx" | "add" | "del" | "chg";
export interface SideRow {
  kind: RowKind;
  left: string | null;
  right: string | null;
}

/** Ordnet den flachen Zeilen-Diff zu Zeilenpaaren fuer die Zwei-Spalten-Ansicht: Kontext steht
 *  auf beiden Seiten, ein Loesch-Block und der folgende Einfuege-Block werden Zeile fuer Zeile
 *  nebeneinandergelegt (`chg`), der Rest bleibt einseitig. */
export function sideBySide(diff: DiffLine[]): SideRow[] {
  const rows: SideRow[] = [];
  let i = 0;
  while (i < diff.length) {
    const d = diff[i];
    if (d.kind === "ctx") {
      rows.push({ kind: "ctx", left: d.text, right: d.text });
      i++;
      continue;
    }
    const dels: string[] = [];
    const adds: string[] = [];
    while (i < diff.length && diff[i].kind === "del") dels.push(diff[i++].text);
    while (i < diff.length && diff[i].kind === "add") adds.push(diff[i++].text);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const l = dels[k] ?? null;
      const r = adds[k] ?? null;
      rows.push({
        kind: l !== null && r !== null ? "chg" : l !== null ? "del" : "add",
        left: l,
        right: r,
      });
    }
  }
  return rows;
}
