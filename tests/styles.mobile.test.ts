import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// happy-dom has no CSS cascade for external stylesheets, so these assert on the
// CSS source (same approach as styles.maxHeight.test.ts). Mobile interaction
// model: copy button must be revealable without hover (audit 4.3.1), and the
// collapse toggle — the primary touch navigation target — must meet a ~44px
// tap target under body.is-mobile (audit 4.4).

const css = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

describe("mobile styles", () => {
  it("reveals the copy button on :focus-within (4.3.1)", () => {
    expect(css).toMatch(/\.json-row:focus-within\s+\.json-copy-btn/);
  });

  it("has a body.is-mobile rule enlarging the collapse toggle tap target (4.4)", () => {
    expect(css).toMatch(/body\.is-mobile[\s\S]{0,200}\.json-collapse-toggle/);
  });
});
