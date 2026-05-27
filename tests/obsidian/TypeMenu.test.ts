import { describe, it, expect, beforeEach } from "vitest";
import { openTypeMenu } from "../../src/obsidian/TypeMenu";
import type { JsonType } from "../../src/core/edit";

const ALL_TYPES: JsonType[] = ["string", "number", "boolean", "null", "object", "array"];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("openTypeMenu", () => {
  it("opens and renders a button for each of the 6 JSON types", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    openTypeMenu(anchor, { currentType: "string", onPick: () => {} });
    const menu = document.querySelector(".json-type-menu");
    expect(menu).not.toBeNull();
    expect(menu!.querySelectorAll(".json-type-option").length).toBe(6);
  });

  it("disables the option matching the current type", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    openTypeMenu(anchor, { currentType: "number", onPick: () => {} });
    const numOption = document.querySelector<HTMLButtonElement>(
      '.json-type-option[data-type="number"]'
    );
    expect(numOption?.disabled).toBe(true);
  });

  it("clicking an enabled option invokes onPick and closes the menu", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    let picked: JsonType | null = null;
    openTypeMenu(anchor, {
      currentType: "string",
      onPick: (t) => {
        picked = t;
      },
    });
    const opt = document.querySelector<HTMLButtonElement>(
      '.json-type-option[data-type="boolean"]'
    )!;
    opt.click();
    expect(picked).toBe("boolean");
    expect(document.querySelector(".json-type-menu")).toBeNull();
  });

  it("clicking the disabled current-type option does nothing", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    let picked: JsonType | null = null;
    openTypeMenu(anchor, {
      currentType: "string",
      onPick: (t) => {
        picked = t;
      },
    });
    const opt = document.querySelector<HTMLButtonElement>(
      '.json-type-option[data-type="string"]'
    )!;
    opt.click();
    expect(picked).toBeNull();
    expect(document.querySelector(".json-type-menu")).not.toBeNull();
  });

  it("Escape key closes the menu", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    openTypeMenu(anchor, { currentType: "string", onPick: () => {} });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".json-type-menu")).toBeNull();
  });

  it("click outside closes the menu", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const elsewhere = document.createElement("div");
    document.body.appendChild(elsewhere);
    openTypeMenu(anchor, { currentType: "string", onPick: () => {} });
    elsewhere.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.querySelector(".json-type-menu")).toBeNull();
  });

  it("only one menu is visible at a time (opening a second closes the first)", () => {
    const anchorA = document.createElement("button");
    const anchorB = document.createElement("button");
    document.body.append(anchorA, anchorB);
    openTypeMenu(anchorA, { currentType: "string", onPick: () => {} });
    openTypeMenu(anchorB, { currentType: "number", onPick: () => {} });
    expect(document.querySelectorAll(".json-type-menu").length).toBe(1);
  });

  it("options are labeled with the type name", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    openTypeMenu(anchor, { currentType: "null", onPick: () => {} });
    for (const t of ALL_TYPES) {
      const opt = document.querySelector<HTMLButtonElement>(
        `.json-type-option[data-type="${t}"]`
      );
      expect(opt?.textContent?.toLowerCase()).toContain(t);
    }
  });
});
