import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { WINDOW_MIN_LINES } from "../../src/core/repair/windowed";
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

  describe("large files: only the window around the error goes out", () => {
    const N = WINDOW_MIN_LINES * 3;
    const MID = Math.floor(N / 2);
    /** Objekt mit N Einträgen, einer pro Zeile; `special` ersetzt die Zeile des Eintrags MID (ohne Komma am Ende). */
    const docWith = (special?: string): { good: string; bad: string } => {
      const line = (i: number, comma: boolean) =>
        i === MID && special !== undefined
          ? `  ${special}${comma ? "," : ""}`
          : `  "k${i}": ${i}${comma ? "," : ""}`;
      const lines = (broken: boolean) =>
        Array.from({ length: N }, (_, i) => line(i, i < N - 1 && !(broken && i === MID)));
      return { good: `{\n${lines(false).join("\n")}\n}`, bad: `{\n${lines(true).join("\n")}\n}` };
    };
    const config = { endpoints: [{ url: "http://h:1234", model: "m" }] };
    const excerptOf = (s: Sent) => (messagesOf(s)[1]?.content ?? "").split("Excerpt:\n")[1] ?? "";
    const addComma = (text: string) => text.replace(/("[^"\n]*": [^,\n]+)(\n)/, "$1,$2");

    it("sends the lines around the error, not the file, with a window-sized budget", async () => {
      const { good, bad } = docWith();
      const { svc, sent } = make(config, (s) => addComma(excerptOf(s)));
      const out = await svc.run(
        bad,
        "Expected ',' or '}' after property value in JSON at position 1",
        "json",
      );
      // Das Modell hat die Zeile mit dem fehlenden Komma im Fenster ergänzt, der Rest der Datei ist unberührt.
      expect(out).toEqual({ ok: true, text: good });
      const content = messagesOf(sent)[1]?.content ?? "";
      expect(content).toContain("Excerpt:\n");
      expect(content).not.toContain("Document:\n");
      expect(content.length).toBeLessThan(bad.length / 4);
      expect(sent.body.max_tokens).toBe(2048);
    });

    it("the Bearer token in the window goes out redacted and comes back in the proposal", async () => {
      const token = "abcdef0123456789abcdef0123";
      const { good, bad } = docWith(`"auth": "Bearer ${token}"`);
      const { svc, sent } = make(config, (s) => addComma(excerptOf(s)));
      const out = await svc.run(bad, "E", "json");
      expect(JSON.stringify(sent.body)).not.toContain(token);
      expect(out).toEqual({ ok: true, text: good });
    });

    // Wert-Treue der Rückführung ist hier bewusst nicht geprüft: ein schon maskiertes `\\n` kommt mit `\\\\n` zurück, im
    // ganzen Dokument genauso (Befund Welle 27, Task im json-editor-Cockpit). Gemessen wird, was der Fensterweg verantwortet.
    it("a PEM key (JSON-escaped newlines) in the window is redacted on the wire and the proposal is valid JSON again", async () => {
      const body = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7";
      const pem = `-----BEGIN PRIVATE KEY-----\\n${body}\\n-----END PRIVATE KEY-----`;
      const { good, bad } = docWith(`"key": "${pem}"`);
      const { svc, sent } = make(config, (s) => addComma(excerptOf(s)));
      const out = await svc.run(bad, "E", "json");
      expect(JSON.stringify(sent.body)).not.toContain(body);
      expect(out).toMatchObject({ ok: true });
      expect(out.ok && JSON.parse(out.text)[`k${MID - 1}`]).toBe(MID - 1);
      expect(out.ok && JSON.parse(out.text).key).toContain(body);
      expect(good).toContain(body);
    });

    it("the budget follows the text that is sent: windows small, the whole document as before", async () => {
      // Die Zeilen sind lang genug, dass das ganze Dokument über dem Boden von 2048 liegt.
      const pad = "x".repeat(60);
      const lines = Array.from(
        { length: N },
        (_, i) => `  "k${i}": "${pad}${i}"${i < N - 1 ? "," : ""}`,
      );
      const good = `{\n${lines.join("\n")}\n}`;
      const bad = good.replace(`"k${MID}": "${pad}${MID}",`, `"k${MID}": "${pad}${MID}"`);
      const budgets: unknown[] = [];
      const { svc } = make(config, (s) => {
        budgets.push(s.body.max_tokens);
        // Das Modell ändert nichts: drei Fenster, dann das ganze Dokument.
        const content = messagesOf(s)[1]?.content ?? "";
        return content.includes("Excerpt:\n")
          ? excerptOf(s)
          : (content.split("Document:\n")[1] ?? "");
      });
      const out = await svc.run(bad, "E", "json");
      expect(out).toMatchObject({ ok: false, error: { kind: "invalid" } });
      expect(budgets).toHaveLength(4);
      // Fenster von 41, 81 und 161 Zeilen wachsen mit ihrem Text; das ganze Dokument liegt am Deckel wie bisher.
      expect(budgets[0]).toBeLessThan(2200);
      expect(budgets).toEqual([...budgets].sort((a, b) => Number(a) - Number(b)));
      expect(budgets[3]).toBe(16384);
    });
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
