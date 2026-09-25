import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { type EndpointConfig, authHeaders } from "../../vendor/kit/endpoint_config";
import { errorMessageFromText } from "../../vendor/kit/error_body";
import {
  type BackendId,
  type FamilyId,
  type FieldId,
  type ResolvedRequest,
  type ResponseFacts,
  type ThinkingLevel,
  resolveRequestParams,
} from "../../vendor/kit/sampling-profiles";
import type { FenceLang } from "./fence";
import { type ChatMessage, buildRepairMessages, validateRepair } from "./prompt";

/** Modus dieses Plugins in der Sampling-Profile-Tabelle: der Ablauf liefert ein schema-
 *  gebundenes Dokument, kein Gespraech — „structured". Nur EIN Modus, deshalb fest verdrahtet. */
export const MODE = "structured";

/** Antwortbudget: das reparierte Dokument ist etwa so lang wie das kaputte. Zeichen/2 ist bei
 *  JSON (viele Kurz-Token) konservativ; der Deckel schuetzt vor einem Riesenblock. */
export function repairMaxTokens(source: string): number {
  return Math.min(16384, Math.max(2048, Math.ceil(source.length / 2) + 512));
}

/** Die Request-Bau-Funktion DES PLUGINS: nur sie kennt den festen Modus. Die goldenen Requests
 *  laufen gegen sie, nicht gegen resolveRequestParams direkt. */
export function buildRepairParams(input: {
  family: FamilyId | null;
  backend: BackendId;
  thinking: ThinkingLevel;
  source: string;
  overrides?: Partial<Record<FieldId, number | string>>;
}): ResolvedRequest {
  return resolveRequestParams({
    family: input.family,
    mode: MODE,
    backend: input.backend,
    thinking: input.thinking,
    maxTokens: repairMaxTokens(input.source),
    overrides: input.overrides,
  });
}

export type RepairPost = (
  url: string,
  init: { headers: Record<string, string>; body: string },
  signal?: AbortSignal,
) => Promise<{ status: number; text: string }>;

export interface RepairRequest {
  post: RepairPost;
  endpoint: EndpointConfig;
  /** Modell, wie es tatsaechlich gesendet wird (nach Alias-Aufloesung). */
  sentModel: string;
  params: Record<string, number | string>;
  source: string;
  errorMessage: string;
  lang: FenceLang;
  signal?: AbortSignal;
}

export type RepairError =
  | { kind: "http"; status: number; detail: string }
  | { kind: "network" }
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "empty" }
  | { kind: "invalid"; detail: string; answer: string };

export type RepairResult =
  | { ok: true; text: string; facts: ResponseFacts }
  | { ok: false; error: RepairError; facts: ResponseFacts | null };

interface ChatBody {
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
    };
    finish_reason?: string | null;
  }[];
}

export function buildBody(
  sentModel: string,
  messages: ChatMessage[],
  params: Record<string, number | string>,
): string {
  return JSON.stringify({ model: sentModel, messages, stream: false, ...params });
}

export async function requestRepair(req: RepairRequest): Promise<RepairResult> {
  const messages = buildRepairMessages(req.source, req.errorMessage, req.lang);
  let res: { status: number; text: string };
  try {
    res = await req.post(
      `${normalizeEndpoint(req.endpoint.url)}/v1/chat/completions`,
      {
        headers: { "Content-Type": "application/json", ...authHeaders(req.endpoint.apiKey) },
        body: buildBody(req.sentModel, messages, req.params),
      },
      req.signal,
    );
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return {
      ok: false,
      error:
        name === "AbortError"
          ? { kind: "aborted" }
          : name === "TimeoutError"
            ? { kind: "timeout" }
            : { kind: "network" },
      facts: null,
    };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      error: {
        kind: "http",
        status: res.status,
        detail: errorMessageFromText(res.text) ?? res.text.slice(0, 200),
      },
      facts: { status: res.status, errorText: res.text, content: "" },
    };
  }
  let body: ChatBody;
  try {
    body = JSON.parse(res.text) as ChatBody;
  } catch {
    return { ok: false, error: { kind: "network" }, facts: null };
  }
  const choice = body.choices?.[0];
  const content = choice?.message?.content ?? "";
  const facts: ResponseFacts = {
    status: res.status,
    finishReason: choice?.finish_reason ?? null,
    content,
    reasoning: choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? "",
    ...(body.model !== undefined ? { responseModel: body.model } : {}),
  };
  if (content.trim() === "") return { ok: false, error: { kind: "empty" }, facts };
  const v = validateRepair(content, req.lang);
  if (!v.ok)
    return { ok: false, error: { kind: "invalid", detail: v.error, answer: content }, facts };
  return { ok: true, text: v.text, facts };
}
