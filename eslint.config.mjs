import obsidianmd from "eslint-plugin-obsidianmd";

// ESLint v9 flat config — runs ONLY the official Obsidian plugin guideline
// rules over the production source. Biome remains the formatter/general linter
// (npm run lint); this is an additive guideline gate (npm run lint:obsidian).
export default [
  {
    ignores: [
      "main.js",
      "coverage/**",
      "node_modules/**",
      "tests/**",
      "src/__mocks__/**",
      ".remember/**",
      "_archiv/**",
      "design/**",
      "*.config.mjs",
      "*.config.ts",
      "*.config.js",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        // Type-check against the REAL obsidian types (build config, no mock
        // alias) — otherwise the mock's `App = Record<string, unknown>` makes
        // every app.* access report as no-unsafe-*.
        project: ["./tsconfig.build.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // General TS-quality rule, not an Obsidian guideline — already covered
      // by Biome + the strict production tsc build.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      // The suggested `.instanceOf()` is an Obsidian HTMLElement augmentation
      // that does not exist in the happy-dom test runtime (would throw), and
      // the tree's nodes all live in a single document/realm, so standard
      // `instanceof` is safe here.
      "obsidianmd/prefer-instanceof": "off",
    },
  },
];
