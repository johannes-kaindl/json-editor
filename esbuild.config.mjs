import process from "node:process";
import builtins from "builtin-modules";
import esbuild from "esbuild";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  banner: {
    js: "/* json-editor — built with esbuild. Bundles ajv (MIT), fast-uri (BSD-3-Clause), fast-deep-equal (MIT), json-schema-traverse (MIT), @codemirror/lang-json (MIT), @lezer/json (MIT). See THIRD-PARTY-NOTICES.md. */",
  },
  // Preserve upstream @license / SPDX comments in the bundle for attribution.
  legalComments: "inline",
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
  process.exit(0);
} else {
  await ctx.watch();
}
