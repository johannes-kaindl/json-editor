import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: any element toggled via the `hidden` attribute that also
// sets a `display` value on its class needs an explicit `[hidden]` override —
// otherwise the class rule (equal specificity, later source order) wins over the
// UA `[hidden] { display: none }` and the element stays visible. This is exactly
// why the large-file "Load tree anyway" button showed on small files and the
// search-clear (×) showed with an empty query. happy-dom doesn't apply external
// CSS, so JS tests can't catch this — assert on the CSS source instead.

const css = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

const TOGGLED_WITH_DISPLAY = [
  "json-large-file-banner",
  "json-schema-banner",
  "json-search-bar",
  "json-search-count",
  "json-search-clear",
  "json-tooltip",
];

describe("hidden-toggled elements have a [hidden] override", () => {
  for (const cls of TOGGLED_WITH_DISPLAY) {
    it(`.${cls} is forced display:none when [hidden]`, () => {
      expect(css).toMatch(new RegExp(`\\.${cls}\\[hidden\\]`));
    });
  }
});
