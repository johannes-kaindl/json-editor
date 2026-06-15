import { describe, expect, it } from "vitest";
import { LargeFileBanner } from "../../src/obsidian/LargeFileBanner";

describe("LargeFileBanner", () => {
  it("starts hidden", () => {
    expect(new LargeFileBanner(() => {}).getElement().hidden).toBe(true);
  });

  it("show reveals a message and a 'Load tree anyway' button", () => {
    const b = new LargeFileBanner(() => {});
    b.show("Large file");
    expect(b.getElement().hidden).toBe(false);
    expect(b.getElement().textContent).toContain("Large file");
    const btn = b.getElement().querySelector("button");
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toMatch(/load tree anyway/i);
    // tooltip explains what the button does (clarity fix)
    expect(btn?.title).toMatch(/tree/i);
  });

  it("clicking the button fires onLoadAnyway", () => {
    let fired = 0;
    const b = new LargeFileBanner(() => {
      fired++;
    });
    b.show("x");
    b.getElement().querySelector("button")?.click();
    expect(fired).toBe(1);
  });

  it("hide clears and hides", () => {
    const b = new LargeFileBanner(() => {});
    b.show("x");
    b.hide();
    expect(b.getElement().hidden).toBe(true);
  });
});
