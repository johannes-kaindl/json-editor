import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type JsonEditorSettings } from "../../src/obsidian/SettingsTab";
import { RepairService } from "../../src/obsidian/repair-service";
import type { SseTransport } from "../../src/vendor/kit-obsidian/chat-client";

interface Sent {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** Fake-Transport: zeichnet die Anfrage auf und antwortet mit einer vollen Completion. */
const transportWith = (answer: (sent: Sent) => string, status = 200) => {
  const sent: Sent = { url: "", body: {}, headers: {} };
  const transport: SseTransport = {
    postStream: async (url, body, headers, onChunk) => {
      sent.url = url;
      sent.body = body as Record<string, unknown>;
      sent.headers = headers;
      onChunk(
        status === 200
          ? JSON.stringify({
              model: "m",
              choices: [{ message: { content: answer(sent) }, finish_reason: "stop" }],
            })
          : answer(sent),
      );
      return status;
    },
  };
  return { sent, transport };
};

const make = (
  over: Partial<JsonEditorSettings> = {},
  answer: (sent: Sent) => string = () => '{"a": 1}',
  status = 200,
) => {
  const settings: JsonEditorSettings = {
    ...DEFAULT_SETTINGS,
    request: structuredClone(DEFAULT_SETTINGS.request),
    ...over,
  };
  const save = vi.fn(async () => {});
  const { sent, transport } = transportWith(answer, status);
  const svc = new RepairService({} as App, "json-editor", () => settings, save, {
    transport,
    probe: async () => true,
    backendOf: async () => "lmstudio",
  });
  return { settings, save, sent, svc };
};

const messagesOf = (sent: Sent) => sent.body.messages as { role: string; content: string }[];

describe("RepairService", () => {
  it("sends the structured-mode profile for the model's family, without a stream", async () => {
    const { svc, sent } = make({
      endpoints: [{ url: "http://h:1234", model: "qwen/qwen3.8-27b" }],
    });
    const out = await svc.run('{"a": 1,}', "E", "json");
    expect(out).toMatchObject({ ok: true, text: '{"a": 1}' });
    expect(sent.url).toBe("http://h:1234/v1/chat/completions");
    expect(sent.body).toMatchObject({ model: "qwen/qwen3.8-27b", stream: false, temperature: 0.1 });
    expect(sent.body.max_tokens).toBe(2048);
    expect(messagesOf(sent)[1]?.content).toContain("Parser error: E");
  });

  it("keeps the family reserve: a high thinking level raises the budget instead of being overridden", async () => {
    const request = structuredClone(DEFAULT_SETTINGS.request);
    request.thinking.structured = "high";
    const { svc, sent } = make({
      endpoints: [{ url: "http://h:1234", model: "qwen/qwen3.8-27b" }],
      request,
    });
    await svc.run('{"a": 1,}', "E", "json");
    expect(sent.body.max_tokens).toBe(32768);
  });

  it("a plugin-side override for the resolved family wins over the profile", async () => {
    const request = structuredClone(DEFAULT_SETTINGS.request);
    request.overrides.structured = { "qwen3.8": { temperature: 0.3 } };
    const { svc, sent } = make({
      endpoints: [{ url: "http://h:1234", model: "qwen/qwen3.8-27b" }],
      request,
    });
    await svc.run("{", "E", "json");
    expect(sent.body.temperature).toBe(0.3);
  });

  it("reports 'no-endpoint' instead of throwing when the list is empty", async () => {
    const { svc } = make({ endpoints: [] });
    expect(await svc.run("{", "E", "json")).toMatchObject({
      ok: false,
      error: { kind: "no-endpoint" },
    });
  });

  it("maps an HTTP error to kind http with status and server text", async () => {
    const { svc } = make(
      { endpoints: [{ url: "http://h:1234", model: "m" }] },
      () => '{"error":{"message":"bad model"}}',
      400,
    );
    expect(await svc.run("{", "E", "json")).toMatchObject({
      ok: false,
      error: { kind: "http", status: 400 },
    });
  });

  it("an invalid answer is rejected with the parser of the block", async () => {
    const { svc } = make({ endpoints: [{ url: "http://h:1234", model: "m" }] }, () => '{"a": 1,}');
    expect(await svc.run("{", "E", "json")).toMatchObject({
      ok: false,
      error: { kind: "invalid" },
    });
  });

  it("redacts a Bearer token on the wire and gives the original back — as valid JSON", async () => {
    const token = "abcdef0123456789abcdef0123";
    const source = `{"auth": "Bearer ${token}", "a": 1,}`;
    const { svc, sent } = make({ endpoints: [{ url: "http://h:1234", model: "m" }] }, (s) => {
      const doc = (messagesOf(s)[1]?.content ?? "").split("Document:\n")[1] ?? "";
      return doc.replace(",}", "}");
    });
    const out = await svc.run(source, "E", "json");
    expect(JSON.stringify(sent.body)).not.toContain(token);
    expect(out).toEqual({ ok: true, text: `{"auth": "Bearer ${token}", "a": 1}` });
  });
});
