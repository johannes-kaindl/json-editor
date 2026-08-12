// Repo-eigene ESLint-Abweichungen — der EINZIGE Ort dafuer. Der Kern
// (eslint.config.mjs) ist template-verwaltet, Inline-disables blockt das Lint-Gate.
// Jeder Override braucht eine Begruendung im Kommentar.
//
// Zwei Klassen, zwei Preise (Details: _docs/docs/obsidian-plugin-publishing.md):
// - Kosmetik-/Benennungsregeln (z. B. ui/sentence-case bei Eigennamen/API-Namen):
//   Override ist die richtige Antwort und kostet nichts — der Scanner hat keinen
//   Mangel gefunden, sondern eine Konvention falsch angelegt.
// - Faehigkeitsregeln (z. B. settings-tab/prefer-setting-definitions): der Scanner
//   bewertet den Mangel, nicht die Begruendung — ein Override hier ist gestundete
//   Schuld und kostet die Store-Wertung ("Satisfactory" statt "Passed").
//   Marker fuer solche Faelle: `// STORE-SCHULD:` + wo die Abloesung geplant ist.
export default [
  {
    // Type-check gegen die ECHTEN obsidian-Typen (Build-Config, kein Mock-Alias) —
    // sonst macht der Mock (`App = Record<string, unknown>`) jeden app.*-Zugriff
    // zu no-unsafe-*. tsconfig.build.json statt tsconfig.json, weil dessen
    // "exclude" zusaetzlich src/__mocks__ ausklammert (historische Mock-Alias-Falle,
    // gefixt im Portal-eslint-Root-Fix 1.9.0 — siehe AGENTS.md).
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.build.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Der vorgeschlagene `.instanceOf()` ist eine Obsidian-HTMLElement-Erweiterung,
      // die es in der happy-dom-Testumgebung nicht gibt (wuerde werfen), und alle
      // Baum-Knoten leben in einem einzigen Document/Realm, also ist Standard-
      // `instanceof` hier sicher.
      "obsidianmd/prefer-instanceof": "off",
    },
  },
];
