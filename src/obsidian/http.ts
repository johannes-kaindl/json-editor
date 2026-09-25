// uebernommen aus lingotuner/src/obsidian/http.ts (probe/listModels/cachedProbe), 2026-09-25
import { requestUrl } from "obsidian";
import type { RepairPost } from "../core/repair/client";
import {
  type CapabilityFetch,
  probeEndpoint as probeBackend,
  probeBaseUrl,
} from "../vendor/kit/capabilities";
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { type EndpointConfig, authHeaders } from "../vendor/kit/endpoint_config";
import {
  type EndpointStatus,
  classifyEndpointStatus,
  extractModelIds,
} from "../vendor/kit/endpoint_diagnostics";
import type { BackendId } from "../vendor/kit/sampling-profiles";
import { withTimeout } from "../vendor/kit/timeout";

type Wire = { status: number; text: string; timedOut: boolean; error: string | null };

async function send(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<Wire> {
  const work = requestUrl({ url, method: "GET", headers, throw: false })
    .then((res) => ({ status: res.status, text: res.text, timedOut: false, error: null }))
    .catch((err: unknown) => ({
      status: 0,
      text: "",
      timedOut: false,
      error: err instanceof Error ? err.message : String(err),
    }));
  const raced = await withTimeout(work, timeoutMs, window);
  return raced.timedOut ? { status: 0, text: "", timedOut: true, error: null } : raced.value;
}

/** Erreichbarkeits-Probe gegen GET /v1/models — mit Schluessel, sonst meldet ein gehosteter
 *  Anbieter 401 und der Endpunkt gilt still als tot. */
export async function probeEndpoint(
  ep: EndpointConfig,
  timeoutMs: number,
): Promise<EndpointStatus> {
  const res = await send(
    `${normalizeEndpoint(ep.url)}/v1/models`,
    timeoutMs,
    authHeaders(ep.apiKey),
  );
  if (res.timedOut) return classifyEndpointStatus({ kind: "timeout" });
  if (res.error !== null) return classifyEndpointStatus({ kind: "error", message: res.error });
  let body: unknown = null;
  try {
    body = JSON.parse(res.text);
  } catch {
    /* kein JSON → not-an-llm-api */
  }
  return classifyEndpointStatus({ kind: "response", status: res.status, body });
}

export async function listModels(ep: EndpointConfig, timeoutMs: number): Promise<string[]> {
  const res = await send(
    `${normalizeEndpoint(ep.url)}/v1/models`,
    timeoutMs,
    authHeaders(ep.apiKey),
  );
  if (res.timedOut || res.error !== null || res.status < 200 || res.status >= 300) return [];
  try {
    return extractModelIds(JSON.parse(res.text)).sort();
  } catch {
    return [];
  }
}

/** EIN Client je Endpunkt-Zeile fuer die Kit-Endpoint-Liste (Status-Icon UND Modell-Liste). */
export function clientFor(
  ep: EndpointConfig,
  timeoutMs: number,
): { probe(): Promise<EndpointStatus>; listModels(): Promise<string[]> } {
  return { probe: () => probeEndpoint(ep, timeoutMs), listModels: () => listModels(ep, timeoutMs) };
}

/** Nicht gestreamt: die Antwort ist ein JSON-Dokument, `requestUrl` (kein CORS) reicht. Es kennt
 *  weder Timeout noch Abort — `withTimeout` begrenzt die Wartezeit, das Signal beendet sie. */
export function postChat(timeoutMs: number): RepairPost {
  return async (url, init, signal) => {
    const work = requestUrl({
      url,
      method: "POST",
      headers: init.headers,
      body: init.body,
      throw: false,
    }).then((res) => ({ status: res.status, text: res.text }));
    const aborted = new Promise<never>((_, reject) => {
      const fail = (): void => {
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      };
      if (signal?.aborted) fail();
      else signal?.addEventListener("abort", fail, { once: true });
    });
    const raced = await Promise.race([withTimeout(work, timeoutMs, window), aborted]);
    if (raced.timedOut) throw Object.assign(new Error("Timeout"), { name: "TimeoutError" });
    return raced.value;
  };
}

const fetchJsonAdapter: CapabilityFetch = async (req) => {
  const res = await requestUrl({
    url: req.url,
    method: req.method ?? "GET",
    headers: req.headers,
    body: req.body,
    throw: false,
  });
  if (res.status < 200 || res.status >= 300) return null;
  try {
    return { json: JSON.parse(res.text) as unknown };
  } catch {
    return null;
  }
};

const BACKEND_CACHE_MS = 30_000;
let backendCache: { url: string; backend: BackendId; at: number } | null = null;

/** Welches Backend hinter einer URL steckt — 30 s je URL zwischengespeichert (dieselbe Regel
 *  wie der Modelllisten-Cache), bei Aenderung der URL verworfen. */
export async function cachedProbe(url: string, model: string): Promise<BackendId | null> {
  const now = Date.now();
  if (backendCache && backendCache.url === url && now - backendCache.at < BACKEND_CACHE_MS)
    return backendCache.backend;
  const { backend } = await probeBackend(fetchJsonAdapter, probeBaseUrl(url), model);
  backendCache = { url, backend, at: now };
  return backend;
}
