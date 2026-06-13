import { describe, expect, it } from "vitest";
import { LossBanner } from "../../src/obsidian/LossBanner";

describe("LossBanner", () => {
  it("starts hidden with no text", () => {
    const b = new LossBanner();
    expect(b.getElement().hidden).toBe(true);
    expect(b.getElement().textContent).toBe("");
  });

  it("show() reveals the element with the given message", () => {
    const b = new LossBanner();
    b.show("numbers lose precision");
    expect(b.getElement().hidden).toBe(false);
    expect(b.getElement().textContent).toBe("numbers lose precision");
    expect(b.getElement().classList.contains("json-lossy-banner")).toBe(true);
  });

  it("hide() clears and hides", () => {
    const b = new LossBanner();
    b.show("x");
    b.hide();
    expect(b.getElement().hidden).toBe(true);
    expect(b.getElement().textContent).toBe("");
  });
});
