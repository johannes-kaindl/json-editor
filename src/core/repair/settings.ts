import type { EndpointChoice } from "../../vendor/kit/endpoint-source";
import { type EndpointConfig, migrateEndpointList } from "../../vendor/kit/endpoint_config";
import {
  DEFAULT_REQUEST_SETTINGS,
  type RequestSettings,
  sanitizeRequestSettings,
} from "../../vendor/kit/sampling-profiles";

export const TIMEOUT_SEC_MIN = 5;
export const PROBE_TIMEOUT_MS = 5000;

/** Einstellungen der LLM-Reparatur. Eigener Block, damit die Editor-Einstellungen unberuehrt
 *  bleiben und der Ladepfad einzeln testbar ist. */
export interface LlmSettings {
  endpoints: EndpointConfig[];
  /** Wahl beim Endpoint Manager (Endpunkt-ID + Modell); leer = automatisch. */
  choice: EndpointChoice;
  timeoutSec: number;
  request: RequestSettings;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  endpoints: [{ url: "http://127.0.0.1:1234" }],
  choice: {},
  timeoutSec: 60,
  request: DEFAULT_REQUEST_SETTINGS,
};

function sanitizeChoice(raw: unknown): EndpointChoice {
  if (raw === null || typeof raw !== "object") return {};
  const c = raw as { endpointId?: unknown; model?: unknown };
  return {
    ...(typeof c.endpointId === "string" && c.endpointId !== ""
      ? { endpointId: c.endpointId }
      : {}),
    ...(typeof c.model === "string" && c.model !== "" ? { model: c.model } : {}),
  };
}

/** Liest den LLM-Teil aus dem gespeicherten `data.json`-Inhalt. `dropped` nennt Pfade, die das
 *  Saeubern des Request-Blocks verworfen hat — der Aufrufer meldet sie, statt sie still zu
 *  verlieren (CORE-DATA-01). */
export function loadLlmSettings(raw: unknown): { llm: LlmSettings; dropped: string[] } {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const { settings: request, dropped } = sanitizeRequestSettings(r.request);
  const list = Array.isArray(r.endpoints)
    ? (r.endpoints as (string | EndpointConfig)[])
    : undefined;
  const endpoints =
    list !== undefined
      ? migrateEndpointList(undefined, list)
      : DEFAULT_LLM_SETTINGS.endpoints.map((e) => ({ ...e }));
  const timeout = Number(r.timeoutSec);
  return {
    llm: {
      endpoints,
      choice: sanitizeChoice(r.choice),
      timeoutSec:
        Number.isFinite(timeout) && timeout > 0
          ? Math.max(TIMEOUT_SEC_MIN, timeout)
          : DEFAULT_LLM_SETTINGS.timeoutSec,
      request,
    },
    dropped,
  };
}
