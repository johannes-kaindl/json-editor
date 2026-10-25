import type { App } from "obsidian";
import { MODE, type RepairResult, repairMaxTokens } from "../core/repair/client";
import type { FenceLang } from "../core/repair/fence";
import { repairWindowed } from "../core/repair/windowed";
import type { SseTransport } from "../vendor/kit-obsidian/chat-client";
import { requestUrlTransport } from "../vendor/kit-obsidian/chat-transport";
import { type LlmConnection, createLlmConnection } from "../vendor/kit-obsidian/llm-connection";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import { getLang } from "../vendor/kit/i18n";
import type { BackendId } from "../vendor/kit/sampling-profiles";
import type { JsonEditorSettings } from "./SettingsTab";

/** Nahtstellen fuer Tests; im Betrieb bleibt es bei den Vorgaben der Verbindung. */
export interface RepairServiceSeams {
  transport?: SseTransport;
  probe?: (cfg: EndpointConfig) => Promise<boolean>;
  backendOf?: (cfg: EndpointConfig) => Promise<BackendId | null>;
}

/** Alles rund um den LLM-Aufruf der Reparatur. Endpunkt, Modell, Anfrage-Parameter, Client und
 *  Settings-Abschnitte liefert die Kit-Verbindung; hier bleiben die Nachrichten, das Budget und
 *  die Abbildung auf `RepairResult`. */
export class RepairService {
  readonly llm: LlmConnection;
  /** Antwortbudget des naechsten Aufrufs. Die Verbindung liest es ueber `maxTokens`, damit die
   *  Familien-Reserve des Profils greift (ein `overrides.max_tokens` umginge sie). */
  private repairBudget: number | undefined;

  constructor(
    app: App,
    pluginId: string,
    private readonly settings: () => JsonEditorSettings,
    private readonly save: () => Promise<void>,
    seams: RepairServiceSeams = {},
  ) {
    this.llm = createLlmConnection({
      app,
      pluginId,
      caller: "json-editor",
      capability: "chat",
      // Die Antwort ist ein Dokument, kein Gespraech: Modus „structured“.
      mode: MODE,
      // Ohne Stream, wie bisher: eine volle Completion ueber `requestUrl` statt des XHR-Streams.
      stream: false,
      // `anthropic: true`: Claude als Endpunkt des Managers; die Reparatur fragt ihn mit, die Verbindung baut den Messages-Transport.
      transports: {
        http: seams.transport ?? requestUrlTransport,
        fallback: "none",
        anthropic: true,
      },
      ...(seams.probe ? { probe: seams.probe } : {}),
      ...(seams.backendOf ? { backendOf: seams.backendOf } : {}),
      // Die Antwort wird als JSON aus `content` geparst: ein geschwaerzter, mehrzeiliger
      // Platzhalter (PEM) muss JSON-escaped zurueckkommen.
      restoreContent: "json",
      maxTokens: () => this.repairBudget,
      lang: () => getLang(),
      getSettings: () => {
        const s = this.settings();
        return { endpoints: s.endpoints, choice: s.choice, request: s.request };
      },
      // Erst in die Settings schreiben, dann speichern: die Endpunkt-Liste liest ihre Zeilen danach zurueck.
      persist: (patch) => {
        Object.assign(this.settings(), patch);
        return this.save();
      },
    });
  }

  /** Ein Reparaturlauf. Eine kleine Datei geht ganz an das Modell; bei einer großen schickt der Lauf nur die Zeilen um
   *  den Fehler (`repairWindowed`), das Ergebnis ist trotzdem der GANZE reparierte Text. Abweichungen meldet die
   *  Verbindung selbst ans Sitzungsprotokoll. */
  async run(
    source: string,
    errorMessage: string,
    lang: FenceLang,
    signal?: AbortSignal,
  ): Promise<RepairResult> {
    return repairWindowed(source, errorMessage, lang, ({ messages, payload }) => {
      // Das Budget folgt dem Text, der wirklich geht: ein Fenster braucht wenig, das ganze Dokument so viel wie bisher.
      this.repairBudget = repairMaxTokens(payload);
      return this.llm.complete({ messages }, signal ? { signal } : {});
    });
  }
}
