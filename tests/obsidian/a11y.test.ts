import { beforeEach, describe, expect, it, vi } from "vitest";
import { LargeFileBanner } from "../../src/obsidian/LargeFileBanner";
import { LossBanner } from "../../src/obsidian/LossBanner";
import { SchemaBanner } from "../../src/obsidian/SchemaBanner";
import { SearchBar } from "../../src/obsidian/SearchBar";
import { TreeView } from "../../src/obsidian/TreeView";

/**
 * Gap-Audit §5.2 + §5.3: was ein Screenreader nicht angesagt bekommt, existiert fuer
 * ihn nicht. Die Werte hier sind Zusagen an eine Hilfstechnologie, keine Kosmetik —
 * deshalb stehen sie als Test und nicht als Kommentar.
 */
describe("a11y — accessible names on inputs (§5.3)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("names the inline value editor after the path it edits", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ name: "jay" });
    (container.querySelector(".json-string") as HTMLElement).click();
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("Edit value at name");
  });

  it("names the rename input after the key it renames", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ name: "jay" });
    (container.querySelector(".json-row-rename") as HTMLElement).click();
    const input = container.querySelector(".json-key-rename") as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("Rename key name");
  });

  it("names the search input", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const bar = new SearchBar({ onQueryChange: () => undefined });
    host.appendChild(bar.getElement());
    const input = host.querySelector(".json-search-input") as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("Search JSON");
  });
});

describe("a11y — live regions (§5.2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("announces the schema error count", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const banner = new SchemaBanner();
    host.appendChild(banner.getElement());
    banner.setErrors(3);
    const el = host.querySelector(".json-schema-banner") as HTMLElement;
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.textContent).toContain("3 schema");
  });

  it("announces the match count", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const bar = new SearchBar({ onQueryChange: () => undefined });
    host.appendChild(bar.getElement());
    bar.setMatchInfo({ matchCount: 2 });
    const el = host.querySelector(".json-search-count") as HTMLElement;
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("announces a copy, which otherwise only changes a CSS class", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ name: "jay" });
    const region = container.querySelector(".json-a11y-announce") as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.getAttribute("aria-live")).toBe("polite");
    view.announce("Value copied");
    expect(region.textContent).toBe("Value copied");
  });
});

describe("a11y — the copy button announces its success (§5.2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("announces a copied value", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ name: "jay" });
    (container.querySelector(".json-copy-btn") as HTMLElement).click();
    await vi.waitFor(() => {
      const region = container.querySelector(".json-a11y-announce") as HTMLElement;
      expect(region.textContent).toBe("Value copied");
    });
  });

  it("announces a copied path on alt-click", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ name: "jay" });
    (container.querySelector(".json-copy-btn") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { altKey: true, bubbles: true }),
    );
    await vi.waitFor(() => {
      const region = container.querySelector(".json-a11y-announce") as HTMLElement;
      expect(region.textContent).toBe("Path copied");
    });
  });
});

describe("a11y — every banner that appears unbidden is a live region (§5.2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // Alle vier erscheinen, ohne dass der Nutzer etwas angefasst hat: beim Oeffnen einer
  // Datei oder beim Laden eines Schemas. Wer nicht hinsieht, erfaehrt sonst nichts davon.
  it.each([
    ["LossBanner", () => new LossBanner().getElement(), "json-lossy-banner"],
    [
      "LargeFileBanner",
      () => new LargeFileBanner(() => undefined).getElement(),
      "json-large-file-banner",
    ],
  ])("%s announces itself", (_name, make, cls) => {
    const el = make();
    expect(el.className).toContain(cls);
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });
});
