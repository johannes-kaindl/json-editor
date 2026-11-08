import { describe, expect, it } from "vitest";
import { renderTree } from "../../src/core/render";

const mk = (rootPath?: (string | number)[], onValueClick?: (p: (string | number)[]) => void) =>
  renderTree(
    { x: { y: 1 }, z: [true] },
    {
      doc: document,
      makeEl: <K extends keyof HTMLElementTagNameMap>(tag: K) => document.createElement(tag),
      rootPath,
      onValueClick,
    },
  );

describe("renderTree rootPath (focus on a subtree)", () => {
  it("keeps paths relative to the whole document when the tree starts deeper", () => {
    const el = mk(["cfg", "net"]);
    const paths = [...el.querySelectorAll(".json-row")].map((r) => r.getAttribute("data-path"));
    expect(paths).toEqual(["cfg.net.x", "cfg.net.x.y", "cfg.net.z", "cfg.net.z[0]"]);
  });

  it("without a rootPath the paths are unchanged", () => {
    const el = mk();
    const paths = [...el.querySelectorAll(".json-row")].map((r) => r.getAttribute("data-path"));
    expect(paths).toEqual(["x", "x.y", "z", "z[0]"]);
  });

  it("the focused root container sits at depth 0", () => {
    const el = mk(["cfg"]);
    const depths = [...el.querySelectorAll<HTMLElement>(".json-container")].map(
      (c) => c.dataset.depth,
    );
    expect(depths).toEqual(["0", "1", "1"]);
  });

  it("passes the full path to the value-click callback", () => {
    let got: (string | number)[] | null = null;
    const el = mk(["cfg"], (p) => {
      got = p;
    });
    el.querySelector<HTMLElement>('.json-row[data-path="cfg.x.y"] .json-number')?.click();
    expect(got).toEqual(["cfg", "x", "y"]);
  });
});
