import { type App, type Editor, type MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RepairModalOptions } from "../../src/obsidian/RepairModal";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import { repairAtCursor, repairFromBlock } from "../../src/obsidian/repair-flow";
import type { RepairService } from "../../src/obsidian/repair-service";

let captured: RepairModalOptions | null = null;
vi.mock("../../src/obsidian/RepairModal", () => ({
  RepairModal: class {
    constructor(_app: unknown, opts: RepairModalOptions) {
      captured = opts;
    }
    open(): void {}
  },
}));

const NOTE = ["# T", "", "```json", '{"a": 1,}', "```", "", "after", ""].join("\n");
const service = {
  run: vi.fn(async () => ({ ok: true, text: "{}", facts: null })),
} as unknown as RepairService;

function deps(data: { text: string }) {
  const file = new TFile("n.md");
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (p === "n.md" ? file : null),
      process: async (_f: TFile, fn: (d: string) => string) => {
        data.text = fn(data.text);
        return data.text;
      },
    },
  } as unknown as App;
  return { app, service, settings: () => DEFAULT_SETTINGS };
}
const ctxFor = (over: Partial<MarkdownPostProcessorContext> = {}): MarkdownPostProcessorContext =>
  ({
    sourcePath: "n.md",
    getSectionInfo: () => ({ lineStart: 2, lineEnd: 4, text: NOTE }),
    ...over,
  }) as MarkdownPostProcessorContext;

describe("repairFromBlock", () => {
  beforeEach(() => {
    captured = null;
    Notice.instances = [];
  });

  it("hands the modal the block's source and error, and runs against the service", async () => {
    repairFromBlock(deps({ text: NOTE }), {
      source: '{"a": 1,}',
      errorMessage: "E",
      lang: "json",
      el: document.createElement("div"),
      ctx: ctxFor(),
    });
    expect(captured).toMatchObject({
      source: '{"a": 1,}',
      errorMessage: "E",
      lang: "json",
      timeoutSec: 60,
    });
    await captured?.run(new AbortController().signal);
    expect(service.run).toHaveBeenCalledWith('{"a": 1,}', "E", "json", expect.any(AbortSignal));
  });

  it("apply replaces only the block content; the rest of the note stays byte-identical", async () => {
    const data = { text: NOTE };
    repairFromBlock(deps(data), {
      source: '{"a": 1,}',
      errorMessage: "E",
      lang: "json",
      el: document.createElement("div"),
      ctx: ctxFor(),
    });
    expect(await captured?.apply('{"a": 1}')).toBe("ok");
    expect(data.text).toBe(NOTE.replace('{"a": 1,}', '{"a": 1}'));
  });

  it("apply refuses and writes nothing when the note changed since the request", async () => {
    const data = { text: NOTE.replace('{"a": 1,}', '{"a": 2,}') };
    const before = data.text;
    repairFromBlock(deps(data), {
      source: '{"a": 1,}',
      errorMessage: "E",
      lang: "json",
      el: document.createElement("div"),
      ctx: ctxFor(),
    });
    expect(await captured?.apply("{}")).toBe("stale");
    expect(data.text).toBe(before);
  });

  it("apply reports a missing file and a block without section info", async () => {
    repairFromBlock(deps({ text: NOTE }), {
      source: "x",
      errorMessage: "E",
      lang: "json",
      el: document.createElement("div"),
      ctx: ctxFor({ sourcePath: "gone.md" }),
    });
    expect(await captured?.apply("{}")).toBe("no-file");
    repairFromBlock(deps({ text: NOTE }), {
      source: "x",
      errorMessage: "E",
      lang: "json",
      el: document.createElement("div"),
      ctx: ctxFor({ getSectionInfo: () => null }),
    });
    expect(await captured?.apply("{}")).toBe("stale");
  });
});

function editorOf(text: string, line: number) {
  const state = { text };
  const editor = {
    getValue: () => state.text,
    getCursor: () => ({ line, ch: 0 }),
    replaceRange: vi.fn((rep: string, from: { line: number }, to: { line: number }) => {
      const lines = state.text.split("\n");
      lines.splice(from.line, to.line - from.line, ...rep.replace(/\n$/, "").split("\n"));
      state.text = lines.join("\n");
    }),
  };
  return { editor: editor as unknown as Editor, state, spy: editor.replaceRange };
}

describe("repairAtCursor", () => {
  beforeEach(() => {
    captured = null;
    Notice.instances = [];
  });

  it("says so when the cursor is outside a json block", () => {
    repairAtCursor(deps({ text: NOTE }), editorOf(NOTE, 0).editor);
    expect(captured).toBeNull();
    expect(Notice.instances.length).toBe(1);
  });

  it("says so when the block is already valid", () => {
    const ok = NOTE.replace('{"a": 1,}', '{"a": 1}');
    repairAtCursor(deps({ text: ok }), editorOf(ok, 3).editor);
    expect(captured).toBeNull();
    expect(Notice.instances.length).toBe(1);
  });

  it("opens the modal for a broken block and applies through the editor", async () => {
    const { editor, state } = editorOf(NOTE, 3);
    repairAtCursor(deps({ text: NOTE }), editor);
    expect(captured).toMatchObject({ source: '{"a": 1,}', lang: "json" });
    expect(await captured?.apply('{"a": 1}')).toBe("ok");
    expect(state.text).toBe(NOTE.replace('{"a": 1,}', '{"a": 1}'));
  });

  it("does not touch the editor when the text changed meanwhile", async () => {
    const { editor, state, spy } = editorOf(NOTE, 3);
    repairAtCursor(deps({ text: NOTE }), editor);
    state.text = NOTE.replace('{"a": 1,}', '{"a": 9,}');
    expect(await captured?.apply("{}")).toBe("stale");
    expect(spy).not.toHaveBeenCalled();
  });
});
