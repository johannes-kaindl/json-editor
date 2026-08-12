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
//
// TWO WAYS THIS GUARD WENT BLIND ONCE — both fixed, both worth remembering:
//  1. eslint exits 0 on warnings. The script therefore carries `--max-warnings 0`;
//     without it a green exit code says nothing about what the reviewer sees.
//  2. The guard mirrors whatever version of eslint-plugin-obsidianmd is installed,
//     not the one the portal runs. It sat on 0.3.0 while the reviewer had 0.4.1 and
//     reported 66 warnings we could not see. Keep the dependency current; a stale
//     mirror is worse than no mirror, because it manufactures false confidence.
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
