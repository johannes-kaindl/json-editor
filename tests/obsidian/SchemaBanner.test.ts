import { describe, it, expect, beforeEach } from "vitest";
import { SchemaBanner } from "../../src/obsidian/SchemaBanner";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("SchemaBanner", () => {
  it("starts hidden", () => {
    const b = new SchemaBanner();
    document.body.appendChild(b.getElement());
    expect(b.getElement().hidden).toBe(true);
  });

  it("setErrors(0) keeps it hidden", () => {
    const b = new SchemaBanner();
    document.body.appendChild(b.getElement());
    b.setErrors(0);
    expect(b.getElement().hidden).toBe(true);
  });

  it("setErrors(>0) shows the banner with the count", () => {
    const b = new SchemaBanner();
    document.body.appendChild(b.getElement());
    b.setErrors(3);
    expect(b.getElement().hidden).toBe(false);
    expect(b.getElement().textContent).toMatch(/3/);
  });

  it("singular vs plural wording", () => {
    const b = new SchemaBanner();
    document.body.appendChild(b.getElement());
    b.setErrors(1);
    expect(b.getElement().textContent?.toLowerCase()).toMatch(/error\b/);
    b.setErrors(2);
    expect(b.getElement().textContent?.toLowerCase()).toMatch(/errors\b/);
  });

  it("setErrors() flipping back to 0 hides again", () => {
    const b = new SchemaBanner();
    document.body.appendChild(b.getElement());
    b.setErrors(2);
    b.setErrors(0);
    expect(b.getElement().hidden).toBe(true);
  });

  it("setMode('parse') shows a parse-error specific message", () => {
    const b = new SchemaBanner();
    document.body.appendChild(b.getElement());
    b.setSchemaParseError('Schema is malformed: token "{"');
    expect(b.getElement().hidden).toBe(false);
    expect(b.getElement().textContent?.toLowerCase()).toMatch(/schema/);
    expect(b.getElement().textContent).toMatch(/malformed/);
  });
});
