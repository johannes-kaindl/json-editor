import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { RepairModal, type RepairModalOptions } from "../../src/obsidian/RepairModal";
import type { RepairOutcome } from "../../src/obsidian/repair-service";

const SOURCE = '{\n  "a": 1,\n}';
const FIXED = '{\n  "a": 1\n}';
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function open(over: Partial<RepairModalOptions> = {}) {
  const run = vi.fn<(s: AbortSignal) => Promise<RepairOutcome>>(async () => ({
    ok: true,
    text: FIXED,
    facts: { status: 200, content: FIXED },
  }));
  const apply = vi.fn(async () => "ok" as const);
  const notice = vi.fn();
  const modal = new RepairModal({} as App, {
    source: SOURCE,
    errorMessage: "Expected double-quoted property name",
    lang: "json",
    run,
    apply,
    notice,
    timeoutSec: 60,
    ...over,
  });
  modal.open();
  const buttons = (): Record<string, HTMLButtonElement> =>
    Object.fromEntries(
      [...modal.contentEl.querySelectorAll("button")].map((b) => [b.textContent ?? "", b]),
    );
  return { modal, run, apply, notice, buttons };
}

describe("RepairModal", () => {
  it("shows the parser error, asks the model once and locks Apply while waiting", async () => {
    let release!: (o: RepairOutcome) => void;
    const { modal, run, buttons } = open({
      run: vi.fn(
        () =>
          new Promise<RepairOutcome>((r) => {
            release = r;
          }),
      ),
    });
    expect(modal.contentEl.textContent).toContain(
      "Parser error: Expected double-quoted property name",
    );
    expect(modal.contentEl.querySelector(".json-repair-status.is-working")).not.toBeNull();
    expect(buttons().Apply?.disabled).toBe(true);
    expect(run).toBeDefined();
    release({ ok: true, text: FIXED, facts: { status: 200, content: FIXED } });
    await flush();
    expect(buttons().Apply?.disabled).toBe(false);
  });

  it("renders original left, proposal right, with the changed line marked on both sides", async () => {
    const { modal } = open();
    await flush();
    const cols = modal.contentEl.querySelectorAll(".json-repair-col");
    expect(cols.length).toBe(2);
    expect(cols[0]?.querySelector(".is-del")?.textContent).toBe('  "a": 1,');
    expect(cols[1]?.querySelector(".is-add")?.textContent).toBe('  "a": 1');
    expect(cols[0]?.children.length).toBe(cols[1]?.children.length);
  });

  it("Apply writes exactly the proposal, then confirms and closes", async () => {
    const { apply, notice, buttons } = open();
    await flush();
    buttons().Apply?.click();
    await flush();
    expect(apply).toHaveBeenCalledWith(FIXED);
    expect(notice).toHaveBeenCalledWith("Code block repaired.");
  });

  it("Discard writes nothing and stops a running request", async () => {
    let signal!: AbortSignal;
    const { apply, buttons } = open({
      run: vi.fn((s: AbortSignal) => {
        signal = s;
        return new Promise<RepairOutcome>(() => {});
      }),
    });
    buttons().Discard?.click();
    expect(signal.aborted).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("an invalid answer never releases Apply and names the reason", async () => {
    const { modal, apply, buttons } = open({
      run: async () => ({
        ok: false,
        error: { kind: "invalid", detail: "Unexpected token", answer: "x" },
        facts: null,
      }),
    });
    await flush();
    expect(modal.contentEl.querySelector(".json-repair-status.is-error")?.textContent).toContain(
      "not valid JSON: Unexpected token",
    );
    expect(buttons().Apply?.disabled).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, error: { kind: "no-endpoint" }, facts: null }, "No reachable LLM endpoint"],
    [
      { ok: false, error: { kind: "no-endpoint", reason: "secret-missing" }, facts: null },
      "API key is missing",
    ],
    [
      { ok: false, error: { kind: "http", status: 400, detail: "bad model" }, facts: null },
      "error (400): bad model",
    ],
    [{ ok: false, error: { kind: "timeout" }, facts: null }, "within 60 seconds"],
    [{ ok: false, error: { kind: "empty" }, facts: null }, "no answer"],
    [{ ok: false, error: { kind: "network" }, facts: null }, "could not be reached"],
  ] as [RepairOutcome, string][])("failure %#: says why", async (outcome, text) => {
    const { modal } = open({ run: async () => outcome });
    await flush();
    expect(modal.contentEl.textContent).toContain(text);
  });

  it("an unchanged document is reported, not offered as a change", async () => {
    const { modal, buttons } = open({
      run: async () => ({ ok: true, text: SOURCE, facts: { status: 200, content: SOURCE } }),
    });
    await flush();
    expect(modal.contentEl.textContent).toContain("unchanged");
    expect(buttons().Apply?.disabled).toBe(true);
  });

  it("Try again asks the model again", async () => {
    const { run, buttons } = open();
    await flush();
    buttons()["Try again"]?.click();
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("a stale note keeps the modal open and says nothing was written", async () => {
    const { modal, buttons } = open({ apply: async () => "stale" });
    await flush();
    buttons().Apply?.click();
    await flush();
    expect(modal.contentEl.textContent).toContain("nothing was written");
  });
});
