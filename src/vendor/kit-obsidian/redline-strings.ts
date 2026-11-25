// vendored from obsidian-kit@0.111.0, src/obsidian/redline-strings.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Default-Texte (EN/DE) für die zweite Spur der Redline (`RedlineSegment.authorLabel`) — nach dem Muster von `model-bar-strings.ts`: das Kit formuliert nichts fest, aber „Gelöscht von …“ und „Eingefügt von …“ soll
 *  kein Plugin selbst erfinden. Eigene Formulierung, in keiner Fassung belegt (Welle 36, k9c Teil B; Befund: im Field Report sind die Autorenplätze 0, 2 und 3 farblich nicht sicher zu trennen).
 *
 *  Überschreiben: `strings: { lang: "de", deletedBy: (name) => `von ${name} gestrichen` }` — Teil-Merge über dem Default der Sprache. */

export interface RedlineStrings {
  /** `title` einer Löschung mit Autor (Tooltip und Beschreibung für Screenreader). */
  deletedBy: (author: string) => string;
  /** `title` einer Einfügung mit Autor. */
  insertedBy: (author: string) => string;
}

export interface RedlineStringsOverride extends Partial<RedlineStrings> {
  lang?: "en" | "de";
}

export const REDLINE_STRINGS_EN: RedlineStrings = {
  deletedBy: (author) => `Deleted by ${author}`,
  insertedBy: (author) => `Inserted by ${author}`,
};

export const REDLINE_STRINGS_DE: RedlineStrings = {
  deletedBy: (author) => `Gelöscht von ${author}`,
  insertedBy: (author) => `Eingefügt von ${author}`,
};

export function resolveRedlineStrings(override?: RedlineStringsOverride): RedlineStrings {
  const base = override?.lang === "de" ? REDLINE_STRINGS_DE : REDLINE_STRINGS_EN;
  if (!override) return base;
  const out: RedlineStrings = { ...base };
  if (override.deletedBy) out.deletedBy = override.deletedBy;
  if (override.insertedBy) out.insertedBy = override.insertedBy;
  return out;
}
