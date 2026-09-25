import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type JsonEditorSettings } from "../../src/obsidian/SettingsTab";
import { RepairService } from "../../src/obsidian/repair-service";

vi.mock("../../src/obsidian/http", () => ({
  probeEndpoint: vi.fn(async () => ({ kind: "ok", reachable: true })),
  cachedProbe: vi.fn(async () => "lmstudio"),
  postChat: vi.fn(() => async (_u: string, init: { body: string }) => {
    sent.body = JSON.parse(init.body) as Record<string, unknown>;
    return {
      status: 200,
      text: JSON.stringify({
        choices: [{ message: { content: '{"a": 1}' }, finish_reason: "stop" }],
      }),
    };
  }),
}));
const sent: { body: Record<string, unknown> } = { body: {} };

const make = (over: Partial<JsonEditorSettings> = {}) => {
  const settings: JsonEditorSettings = { ...DEFAULT_SETTINGS, ...over };
  const save = vi.fn(async () => {});
  return { settings, save, svc: new RepairService({} as App, () => settings, save) };
};

describe("RepairService", () => {
  it("sends the structured-mode profile for the model's family, with the canonical sent model", async () => {
    const { svc } = make({ endpoints: [{ url: "http://h:1234", model: "qwen/qwen3.8-27b" }] });
    const out = await svc.run('{"a": 1,}', "E", "json");
    expect(out).toMatchObject({ ok: true, text: '{"a": 1}' });
    expect(sent.body).toMatchObject({ model: "qwen/qwen3.8-27b", stream: false, temperature: 0.1 });
    expect(sent.body.max_tokens).toBe(2048);
    expect(svc.requestSession.lastRequest()?.params).toMatchObject({ temperature: 0.1 });
  });

  it("a plugin-side override for the resolved family wins over the profile", async () => {
    const request = structuredClone(DEFAULT_SETTINGS.request);
    request.overrides.structured = { "qwen3.8": { temperature: 0.3 } };
    const { svc } = make({
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

  it("saveRequestSettings persists into the shared settings object", async () => {
    const { svc, settings, save } = make();
    const next = structuredClone(settings.request);
    await svc.saveRequestSettings(next);
    expect(settings.request).toBe(next);
    expect(save).toHaveBeenCalledOnce();
  });

  it("exposes the section state after a resolve", async () => {
    const { svc } = make({ endpoints: [{ url: "http://h:1234", model: "qwen/qwen3.8-27b" }] });
    await svc.resolve();
    expect(svc.requestSectionState()).toMatchObject({
      family: "qwen3.8",
      backend: "lmstudio",
      sentModel: "qwen/qwen3.8-27b",
    });
    expect(svc.activeEndpointUrl()).toBe("http://h:1234");
  });
});
