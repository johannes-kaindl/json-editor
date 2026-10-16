import { Notice, type WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import "../../src/i18n/strings";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as unknown as WorkspaceLeaf;
/** Die Kinder des Meldungs-Fragments (das Fragment des Test-DOMs kennt weder `querySelector` noch `textContent`). */
const parts = (n: { message: unknown }): HTMLElement[] =>
  Array.from((n.message as DocumentFragment).childNodes) as HTMLElement[];
const notices = (): { message: unknown }[] =>
  (Notice as unknown as { instances: { message: unknown }[] }).instances;

function viewWith(json: string): JsonFileView {
  const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
  document.body.appendChild(v.contentEl);
  v.setViewData(json, false);
  return v;
}

// Der eigene Loesch-Knopf einer Zeile steht NACH den Knoepfen ihrer Kinder-Zeilen im selben Teilbaum, also ist es der letzte.
const del = (v: JsonFileView, path: string): void =>
  [
    ...v.contentEl.querySelectorAll<HTMLButtonElement>(
      `.json-row[data-path="${path}"] .json-row-delete`,
    ),
  ]
    .at(-1)
    ?.click();

describe("deleting a container row", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    notices().length = 0;
  });

  it("asks nothing, deletes at once, and names what is gone with an Undo button", () => {
    const v = viewWith('{"a":{"x":1,"y":2},"b":2}');
    del(v, "a");
    expect(JSON.parse(v.getViewData())).toEqual({ b: 2 });
    expect(notices()).toHaveLength(1);
    const text = parts(notices()[0]!)
      .map((p) => p.textContent)
      .join("");
    expect(text).toContain('"a"');
    expect(text).toContain("2 entries");
    expect(parts(notices()[0]!).some((p) => p.className === "json-delete-undo")).toBe(true);
  });

  it("the Undo button brings the object back", () => {
    const v = viewWith('{"a":[1,2,3],"b":2}');
    del(v, "a");
    expect(JSON.parse(v.getViewData())).toEqual({ b: 2 });
    parts(notices()[0]!)
      .find((p) => p.className === "json-delete-undo")!
      .click();
    expect(JSON.parse(v.getViewData())).toEqual({ a: [1, 2, 3], b: 2 });
  });

  it("says nothing for a scalar or an empty container", () => {
    const v = viewWith('{"a":1,"e":{},"l":[]}');
    del(v, "a");
    del(v, "e");
    del(v, "l");
    expect(JSON.parse(v.getViewData())).toEqual({});
    expect(notices()).toHaveLength(0);
  });
});
