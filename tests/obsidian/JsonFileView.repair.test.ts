import type { WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { FileRepairRequest } from "../../src/obsidian/repair-flow";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} }) as WorkspaceLeaf;
const BROKEN = '{"a": 1';

function open(text: string, onRepair?: (r: FileRepairRequest) => void, ext = "json") {
  const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS, undefined, onRepair);
  (v as unknown as { file: { extension: string; path: string } }).file = {
    extension: ext,
    path: `x.${ext}`,
  };
  document.body.appendChild(v.contentEl);
  v.setViewData(text, false);
  return v;
}

describe("JsonFileView — Reparieren im Parse-Fehler-Banner", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("zeigt den Knopf nur bei einem Parse-Fehler und nur mit Handler", () => {
    const onRepair = vi.fn();
    expect(
      open(BROKEN, onRepair).contentEl.querySelector(".json-error-banner .json-codeblock-repair"),
    ).not.toBeNull();
    document.body.innerHTML = "";
    expect(
      open(BROKEN).contentEl.querySelector(".json-error-banner .json-codeblock-repair"),
    ).toBeNull();
    document.body.innerHTML = "";
    expect(open('{"a":1}', onRepair).contentEl.querySelector(".json-codeblock-repair")).toBeNull();
  });

  it("der Klick übergibt Dateitext, Fehler und Sprache", () => {
    const onRepair = vi.fn();
    const v = open(BROKEN, onRepair, "jsonc");
    v.contentEl.querySelector<HTMLButtonElement>(".json-codeblock-repair")!.click();
    expect(onRepair).toHaveBeenCalledTimes(1);
    const req = onRepair.mock.calls[0]![0] as FileRepairRequest;
    expect(req.source).toBe(BROKEN);
    expect(req.lang).toBe("jsonc");
    expect(req.errorMessage.length).toBeGreaterThan(0);
  });

  it("apply schreibt den Vorschlag in die Datei, hebt das Banner und lässt sich zurücknehmen", async () => {
    const onRepair = vi.fn();
    const v = open(BROKEN, onRepair);
    v.contentEl.querySelector<HTMLButtonElement>(".json-codeblock-repair")!.click();
    const req = onRepair.mock.calls[0]![0] as FileRepairRequest;
    expect(await req.apply('{"a": 1}')).toBe("ok");
    expect(v.getViewData()).toBe('{"a": 1}');
    expect(v.contentEl.querySelector(".json-error-banner")).toBeNull();
    v.undo();
    expect(v.getViewData()).toBe(BROKEN);
  });

  it("apply meldet stale, wenn sich der Text seit der Anfrage geändert hat", async () => {
    const onRepair = vi.fn();
    const v = open(BROKEN, onRepair);
    v.contentEl.querySelector<HTMLButtonElement>(".json-codeblock-repair")!.click();
    const req = onRepair.mock.calls[0]![0] as FileRepairRequest;
    v.setViewData('{"a": 2', false);
    expect(await req.apply('{"a": 1}')).toBe("stale");
    expect(v.getViewData()).toBe('{"a": 2');
  });
});
