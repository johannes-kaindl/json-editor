import { type App, Notice } from "obsidian";
import { MODE, type RepairResult, buildRepairParams, requestRepair } from "../core/repair/client";
import type { FenceLang } from "../core/repair/fence";
import { PROBE_TIMEOUT_MS } from "../core/repair/settings";
import { deviationNotice } from "../core/request-text";
import { findEndpointManager } from "../vendor/kit-obsidian/endpoint-source";
import type { RequestSectionState } from "../vendor/kit-obsidian/request-section";
import { type RequestSession, createRequestSession } from "../vendor/kit-obsidian/request-session";
import {
  type ApiErrorCode,
  type EndpointSourceResult,
  resolveEndpointSource,
} from "../vendor/kit/endpoint-source";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import { t } from "../vendor/kit/i18n";
import { type RequestSettings, checkResponse, thinkingFor } from "../vendor/kit/sampling-profiles";
import type { JsonEditorSettings } from "./SettingsTab";
import { cachedProbe, postChat, probeEndpoint } from "./http";

/** Alles rund um den LLM-Aufruf der Reparatur: Endpunkt aufloesen (Manager, sonst lokale
 *  Liste), Anfrage nach Profil bauen, Antwort pruefen. Der Plugin-Kern kennt nur diese Klasse. */
export type RepairOutcome =
  | RepairResult
  | { ok: false; error: { kind: "no-endpoint"; reason?: ApiErrorCode }; facts: null };

export class RepairService {
  private activeSource: EndpointSourceResult | null = null;
  private cachedLocal: EndpointConfig | null = null;
  private pending: Promise<EndpointSourceResult> | null = null;
  readonly requestSession: RequestSession = createRequestSession({
    message: (d) => deviationNotice(d),
  });

  constructor(
    private readonly app: App,
    private readonly settings: () => JsonEditorSettings,
    private readonly save: () => Promise<void>,
  ) {}

  activeEndpointUrl(): string | null {
    return this.activeSource?.config?.url ?? null;
  }

  /** Verwirft den gemerkten lokalen Endpunkt; der naechste Aufruf pingt die Liste erneut. */
  invalidate(): void {
    this.cachedLocal = null;
  }

  /** Fuer `buildRequestSection` im Settings-Tab. */
  requestSectionState(): RequestSectionState {
    const s = this.activeSource;
    return {
      family: s?.family ?? null,
      familySource: s?.familySource ?? "none",
      backend: s?.backend ?? "unknown",
      backendSource: s?.backendSource ?? "none",
      model: s?.model ?? "",
      sentModel: s?.sentModel ?? "",
      ...(s?.defaultModel !== undefined ? { defaultModel: s.defaultModel } : {}),
    };
  }

  async saveRequestSettings(next: RequestSettings): Promise<void> {
    this.settings().request = next;
    await this.save();
  }

  /** EINZIGER Weg zum Endpunkt. Der Manager wird bei JEDEM Aufruf frisch gelesen und nie
   *  gecacht (er cached sich selbst); der lokale Pfad merkt sich den erreichbaren Endpunkt. */
  resolve(): Promise<EndpointSourceResult> {
    const manager = findEndpointManager(this.app);
    if (manager === null && this.cachedLocal !== null && this.activeSource !== null)
      return Promise.resolve(this.activeSource);
    if (this.pending !== null) return this.pending;
    const s = this.settings();
    this.pending = resolveEndpointSource(
      {
        manager,
        local: s.endpoints,
        capability: "chat",
        choice: s.choice,
        caller: "json-editor",
        backendOf: (cfg) => cachedProbe(cfg.url, cfg.model ?? ""),
      },
      (ep) => probeEndpoint(ep, PROBE_TIMEOUT_MS).then((st) => st.reachable),
    )
      .then((r) => {
        this.activeSource = r;
        this.cachedLocal = r.kind === "local" ? r.config : null;
        return r;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  /** Ein Reparaturlauf. Meldet Abweichungen ans Sitzungsprotokoll (Abschnitt „Anfrage"). */
  async run(
    source: string,
    errorMessage: string,
    lang: FenceLang,
    signal?: AbortSignal,
  ): Promise<RepairOutcome> {
    const src = await this.resolve();
    if (src.config === null)
      return {
        ok: false,
        error: { kind: "no-endpoint", ...(src.reason !== undefined ? { reason: src.reason } : {}) },
        facts: null,
      };
    const s = this.settings();
    const level = thinkingFor(s.request, MODE);
    const { params } = buildRepairParams({
      family: src.family,
      backend: src.backend,
      thinking: level,
      source,
      overrides: s.request.overrides[MODE]?.[src.family ?? "unknown"] ?? {},
    });
    this.requestSession.recordRequest(params);
    const result = await requestRepair({
      post: postChat(s.timeoutSec * 1000),
      endpoint: src.config,
      sentModel: src.sentModel || src.model,
      params,
      source,
      errorMessage,
      lang,
      ...(signal ? { signal } : {}),
    });
    if (result.facts !== null)
      this.requestSession.report(
        checkResponse({ family: src.family, thinking: level }, result.facts),
      );
    return result;
  }
}

export function noticeNoEndpoint(reason?: ApiErrorCode): void {
  new Notice(
    reason === "secret-missing" ? t("repair.noEndpointSecretMissing") : t("repair.noEndpoint"),
  );
}
