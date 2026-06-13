// Review findings #5/#13 (race) and #12 (consent coverage): the companion
// schema is loaded fire-and-forget; it must be gated by validateAgainstSchema
// (opt-in, blocker 1.3) and must not apply a stale schema to a different file
// after a fast switch.

import { TFile, type WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const VALIDATING = { ...DEFAULT_SETTINGS, validateAgainstSchema: true };

interface FakeVault {
  getAbstractFileByPath: (p: string) => unknown;
  cachedRead: (f: TFile) => Promise<string>;
}
const leafWith = (vault: FakeVault): WorkspaceLeaf =>
  ({ app: { vault } }) as unknown as WorkspaceLeaf;
const setFile = (v: JsonFileView, path: string) => {
  (v as unknown as { file: TFile }).file = new TFile(path);
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("JsonFileView companion-schema autoload", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does NOT read a sibling schema when validateAgainstSchema is off (consent gate)", async () => {
    const spy = vi.fn((p: string) => new TFile(p));
    const v = new JsonFileView(
      leafWith({ getAbstractFileByPath: spy, cachedRead: () => Promise.resolve("{}") }),
      {
        ...DEFAULT_SETTINGS,
        validateAgainstSchema: false,
      },
    );
    document.body.appendChild(v.contentEl);
    setFile(v, "data.json");
    v.setViewData('{"x":1}', true);
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it("auto-loads the sibling schema once when enabled", async () => {
    const spy = vi.fn((p: string) => new TFile(p));
    const v = new JsonFileView(
      leafWith({
        getAbstractFileByPath: spy,
        cachedRead: () => Promise.resolve('{"type":"object"}'),
      }),
      VALIDATING,
    );
    document.body.appendChild(v.contentEl);
    setFile(v, "data.json");
    v.setViewData('{"x":1}', true);
    await flush();
    expect(spy).toHaveBeenCalledWith("data.schema.json");
  });

  it("normalizes the assembled schema path before lookup (2.20)", async () => {
    const spy = vi.fn((p: string) => new TFile(p));
    const v = new JsonFileView(
      leafWith({ getAbstractFileByPath: spy, cachedRead: () => Promise.resolve('{"type":"object"}') }),
      VALIDATING,
    );
    document.body.appendChild(v.contentEl);
    setFile(v, "dir//data.json"); // a doubled slash that must be collapsed
    v.setViewData('{"x":1}', true);
    await flush();
    expect(spy).toHaveBeenCalledWith("dir/data.schema.json");
  });

  it("does not apply a schema loaded for a previous file after a fast switch", async () => {
    const reads: Array<{ path: string; resolve: (t: string) => void }> = [];
    const vault: FakeVault = {
      getAbstractFileByPath: (p: string) => new TFile(p),
      cachedRead: (f: TFile) =>
        new Promise<string>((resolve) => {
          reads.push({ path: f.path, resolve });
        }),
    };
    const v = new JsonFileView(leafWith(vault), VALIDATING);
    document.body.appendChild(v.contentEl);

    setFile(v, "a.json");
    v.setViewData('{"x":1}', true); // schedules read of a.schema.json
    setFile(v, "b.json");
    v.setViewData('{"y":2}', true); // file switch → generation bumped

    // The stale read for file A now resolves with a schema that would flag B.
    reads.find((r) => r.path === "a.schema.json")!.resolve('{"type":"object","required":["x"]}');
    await flush();

    // B must not be validated against A's schema.
    expect((v as unknown as { currentSchema: unknown }).currentSchema).toBeNull();
  });
});
