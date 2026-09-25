import { describe, expect, it } from "vitest";
import {
  type RepairPost,
  buildBody,
  buildRepairParams,
  repairMaxTokens,
  requestRepair,
} from "../../../src/core/repair/client";
import type { BackendId, FamilyId } from "../../../src/vendor/kit/sampling-profiles";

const SRC = '{"a": 1,}';
const FAMILIES: (FamilyId | null)[] = ["qwen3.8", "qwen3.6", "gemma4", "gpt-oss", null];
const BACKENDS: BackendId[] = ["lmstudio", "openwebui", "unknown"];

describe("goldene Requests (Modus structured, Denken aus)", () => {
  it.each(FAMILIES.flatMap((f) => BACKENDS.map((b) => [f, b] as const)))(
    "%s × %s",
    (family, backend) => {
      const { params } = buildRepairParams({ family, backend, thinking: "off", source: SRC });
      expect({ family, backend, params }).toMatchSnapshot();
    },
  );
});

describe("repairMaxTokens", () => {
  it("hat Boden und Deckel", () => {
    expect(repairMaxTokens("x")).toBe(2048);
    expect(repairMaxTokens("x".repeat(100_000))).toBe(16384);
  });
});

const ok =
  (content: string): RepairPost =>
  async () => ({
    status: 200,
    text: JSON.stringify({
      model: "m",
      choices: [{ message: { content }, finish_reason: "stop" }],
    }),
  });
const base = {
  endpoint: { url: "http://h:1234" },
  sentModel: "m@4bit",
  params: { temperature: 0.1 },
  source: SRC,
  errorMessage: "e",
  lang: "json" as const,
};

describe("requestRepair", () => {
  it("sendet Modell, Nachrichten, stream:false und die Profilwerte — nichts Altes", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    const post: RepairPost = async (u, init) => {
      url = u;
      body = JSON.parse(init.body) as Record<string, unknown>;
      return ok('{"a": 1}')(u, init);
    };
    const r = await requestRepair({ ...base, post });
    expect(url).toBe("http://h:1234/v1/chat/completions");
    expect(body).toMatchObject({ model: "m@4bit", stream: false, temperature: 0.1 });
    expect(Object.keys(body).sort()).toEqual(["messages", "model", "stream", "temperature"]);
    expect(r).toMatchObject({ ok: true, text: '{"a": 1}' });
  });
  it("gueltige Antwort im Zaun wird angenommen, ungueltige nicht", async () => {
    expect((await requestRepair({ ...base, post: ok('```json\n{"a": 1}\n```') })).ok).toBe(true);
    const bad = await requestRepair({ ...base, post: ok('{"a": 1,}') });
    expect(bad).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });
  it("HTTP-Fehler traegt Status und Text", async () => {
    const post: RepairPost = async () => ({
      status: 400,
      text: '{"error":{"message":"bad model"}}',
    });
    expect(await requestRepair({ ...base, post })).toMatchObject({
      ok: false,
      error: { kind: "http", status: 400 },
      facts: { status: 400 },
    });
  });
  it("leere Antwort, Netzfehler und Abbruch", async () => {
    expect(await requestRepair({ ...base, post: ok("") })).toMatchObject({
      ok: false,
      error: { kind: "empty" },
    });
    expect(
      await requestRepair({
        ...base,
        post: async () => {
          throw new Error("x");
        },
      }),
    ).toMatchObject({ error: { kind: "network" } });
    const slow = Object.assign(new Error("t"), { name: "TimeoutError" });
    expect(
      await requestRepair({
        ...base,
        post: async () => {
          throw slow;
        },
      }),
    ).toMatchObject({ error: { kind: "timeout" } });
    const abort = Object.assign(new Error("a"), { name: "AbortError" });
    expect(
      await requestRepair({
        ...base,
        post: async () => {
          throw abort;
        },
      }),
    ).toMatchObject({ error: { kind: "aborted" } });
  });
  it("buildBody haengt die Parameter hinter die festen Felder", () => {
    expect(JSON.parse(buildBody("m", [], { top_p: 0.8 }))).toEqual({
      model: "m",
      messages: [],
      stream: false,
      top_p: 0.8,
    });
  });
});
