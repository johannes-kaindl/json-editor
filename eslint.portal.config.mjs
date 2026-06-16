// Regression guard that mirrors the community.obsidian.md plugin reviewer's
// SOURCE CODE eslint pass. The reviewer runs `eslint-plugin-obsidianmd`'s
// `configs.recommended` (which spreads typescript-eslint recommended-type-checked)
// and wires type info via the repo's OWN `tsconfig.json` — NOT our eslint.config.mjs.
//
// This config reproduces that exactly: recommended rules, no rule disables, type
// info from ./tsconfig.json. If tsconfig.json ever resolves `obsidian` to the
// loosely-typed Vitest mock again (or any genuinely unsafe code / unnecessary
// assertion creeps in), this run goes non-zero and CI catches it before the
// portal flips the public Review badge to "Caution".
//
// Run: npm run lint:portal   (expected: 0 problems)
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    ignores: [
      "main.js",
      "coverage/**",
      "node_modules/**",
      "tests/**",
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
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
