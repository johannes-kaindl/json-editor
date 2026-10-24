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

  describe("Claude as an endpoint of the LLM Endpoint Manager", () => {
    interface Asked {
      via: "list" | "resolve";
      transports: unknown;
    }

    /** Ein Manager-Double, das aufzeichnet, mit welchen Transporten ihn die Verbindung fragt, und
     *  einen Claude-Endpunkt liefert, wenn (und nur wenn) `"anthropic"` unter den Transporten steht. */
    const managerApp = () => {
      const asked: Asked[] = [];
      const claude = {
        id: "claude",
        label: "Claude API",
        provider: "anthropic",
        transport: "anthropic",
        backend: "anthropic",
        capabilities: ["chat"],
        defaultModel: "claude-haiku-5-5",
        enabled: true,
        hasSecret: true,
        url: "https://api.anthropic.test",
        models: [{ id: "claude-haiku-5-5" }],
      };
      const wants = (t: unknown) => Array.isArray(t) && t.includes("anthropic");
      const api = {
        version: 1,
        list: (filter?: { transports?: unknown }) => {
          asked.push({ via: "list", transports: filter?.transports });
          return wants(filter?.transports) ? [claude] : [];
        },
        get: () => null,
        resolve: async (_capability: string, opts?: { transports?: unknown }) => {
          asked.push({ via: "resolve", transports: opts?.transports });
          return wants(opts?.transports)
            ? {
                id: claude.id,
                label: claude.label,
                backend: claude.backend,
                transport: claude.transport,
                defaultModel: claude.defaultModel,
                models: claude.models,
                config: { url: claude.url, apiKey: "sk-ant-test", model: claude.defaultModel },
              }
            : { error: "no-endpoint" };
        },
        materialize: async () => ({ error: "no-endpoint" }),
        models: async () => [],
        importEndpoints: async () => ({ error: "no-endpoint" }),
        on: () => () => {},
      };
      const app = { plugins: { plugins: { "llm-endpoint-manager": { api } } } } as unknown as App;
      return { app, asked };
    };

    const serviceFor = (app: App, transport?: SseTransport) =>
      new RepairService(
        app,
        "json-editor",
        () => ({ ...DEFAULT_SETTINGS, request: structuredClone(DEFAULT_SETTINGS.request) }),
        vi.fn(async () => {}),
        {
          ...(transport ? { transport } : {}),
          probe: async () => true,
          backendOf: async () => "anthropic",
        },
      );

    it("asks the manager for endpoints with the transport 'anthropic' as well", async () => {
      const { app, asked } = managerApp();
      const r = await serviceFor(app).llm.resolve();
      const resolved = asked.filter((a) => a.via === "resolve");
      // Messprobe: der Fake wurde gefragt und hat einen Endpunkt geliefert, sonst ist „immer anthropic“ nichts wert.
      expect(resolved.length).toBeGreaterThan(0);
      expect(r.config).not.toBeNull();
      for (const a of resolved) expect(a.transports).toEqual(["http", "anthropic"]);
    });

    it("sends the repair to the Messages API: x-api-key, no temperature, max_tokens", async () => {
      const { app } = managerApp();
      const { sent, transport } = transportWith(() => '{"a": 1}');
      const out = await serviceFor(app, transport).run('{"a": 1,}', "E", "json");
      expect(sent.url).toBe("https://api.anthropic.test/v1/messages");
      expect(sent.headers["x-api-key"]).toBe("sk-ant-test");
      expect(sent.headers["anthropic-version"]).toBeTruthy();
      expect(sent.body).not.toHaveProperty("temperature");
      expect(sent.body).not.toHaveProperty("top_p");
      expect(sent.body.max_tokens).toBeGreaterThan(0);
      expect(out).toBeDefined();
    });
  });
});
