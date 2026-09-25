import { type App, PluginSettingTab, type Setting, type SettingDefinitionItem } from "obsidian";
import type { Plugin } from "obsidian";
import { MODE } from "../core/repair/client";
import {
  DEFAULT_LLM_SETTINGS,
  type LlmSettings,
  PROBE_TIMEOUT_MS,
  TIMEOUT_SEC_MIN,
} from "../core/repair/settings";
import { deviationDetail } from "../core/request-text";
import type { CollapsibleStorage } from "../vendor/kit-obsidian/collapsible";
import { type EndpointListStrings, buildEndpointList } from "../vendor/kit-obsidian/endpoint-list";
import { buildEndpointSourceSection } from "../vendor/kit-obsidian/endpoint-source";
import { buildRequestSection } from "../vendor/kit-obsidian/request-section";
import {
  type SettingControlHost,
  installTabRefreshOnOpen,
  refreshSettingsTab,
  renderSettingDefinitions,
  settingBodyHost,
} from "../vendor/kit-obsidian/settings_walker";
import type { EndpointRole } from "../vendor/kit/endpoint_config";
import { ENDPOINT_PRESETS, type EndpointStatusKind } from "../vendor/kit/endpoint_diagnostics";
import { t } from "../vendor/kit/i18n";
import { type ModelListCache, createModelListCache } from "../vendor/kit/model-list-cache";
import {
  BACKENDS,
  type BackendId,
  FAMILIES,
  type FamilyId,
  type FieldExplain,
} from "../vendor/kit/sampling-profiles";
import { clientFor } from "./http";
import type { RepairService } from "./repair-service";

export interface JsonEditorSettings extends LlmSettings {
  defaultMode: "tree" | "source";
  indent: 2 | 4 | "\t";
  markerStyle: "modern" | "classic";
  autoCollapseDepth: number;
  validateAgainstSchema: boolean;
  companionSchemaSuffix: string;
}

/**
 * A companion-schema suffix must be a bare filename fragment, never a path:
 * no separators and no parent-dir traversal (audit 2.20). Kept lenient enough
 * to allow conventional forms like ".schema.json" and ".json-schema".
 */
export function isValidCompanionSuffix(suffix: string): boolean {
  return suffix.length > 0 && !/[/\\]/.test(suffix) && !suffix.includes("..");
}

export const DEFAULT_SETTINGS: JsonEditorSettings = {
  defaultMode: "tree",
  indent: 2,
  markerStyle: "modern",
  autoCollapseDepth: 2,
  validateAgainstSchema: false,
  companionSchemaSuffix: ".schema.json",
  ...DEFAULT_LLM_SETTINGS,
};

interface PluginWithSettings extends Plugin {
  settings: JsonEditorSettings;
  saveSettings(): Promise<void>;
  repairService: RepairService;
}

const STATUS_KEY: Record<Exclude<EndpointStatusKind, "unknown">, string> = {
  ok: "ep.status.ok",
  refused: "ep.status.refused",
  "unknown-host": "ep.status.unknownHost",
  timeout: "ep.status.timeout",
  "not-an-llm-api": "ep.status.notAnLlmApi",
  unauthorized: "ep.status.unauthorized",
};
const WARN_KEY: Record<string, string> = {
  scheme: "ep.warn.scheme",
  malformed: "ep.warn.malformed",
  port: "ep.warn.port",
  "placeholder-ip": "ep.warn.placeholderIp",
};

/**
 * Settings are declared once, as data, and consumed twice: Obsidian >= 1.13 reads
 * `getSettingDefinitions()` directly (which is what makes them appear in settings
 * search), while older versions call `display()`, where the shared walker draws
 * the same declaration with the classic Setting API. One source, two paths — the
 * kit pattern lifted from nine independent copies across the plugin family.
 */
export class JsonEditorSettingsTab extends PluginSettingTab implements SettingControlHost {
  /** Modell-Listen je Endpunkt — Lebensdauer des TABS (Kit-Vertrag), clear() in hide(). */
  private modelLists: ModelListCache = createModelListCache();
  private cleanupPrevious: () => void = () => {};
  private uninstallRefresh: () => void = () => {};
  /** Nur fuer die Sitzung des offenen Tabs: der imperative Neuaufbau zeichnet den DOM bei JEDER
   *  Aenderung komplett neu — ohne diesen Speicher faellt der Abschnitt „Anfrage" dabei auf
   *  `defaultCollapsed` zurueck und klappt nach jeder Ueberschreibung wieder zu. */
  private readonly collapsedState = new Map<string, boolean>();
  private readonly collapsedStorage: CollapsibleStorage = {
    getCollapsed: (key) => this.collapsedState.get(key),
    setCollapsed: (key, collapsed) => {
      this.collapsedState.set(key, collapsed);
    },
  };

  constructor(
    app: App,
    private settingsPlugin: PluginWithSettings,
  ) {
    super(app, settingsPlugin);
    // „Letzte Anfrage" und Abweichungen sollen beim Oeffnen des Tabs aktuell sein.
    this.uninstallRefresh = installTabRefreshOnOpen(this, () => {
      this.renderImperative();
    });
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Default mode",
        desc: "Which view opens by default when a .json file is opened.",
        control: {
          type: "dropdown",
          key: "defaultMode",
          options: { tree: "Tree", source: "Source" },
        },
      },
      {
        name: "Indent",
        desc: "Spaces or tab used when serializing JSON from tree edits.",
        control: {
          type: "dropdown",
          key: "indent",
          options: { "2": "Two spaces", "4": "Four spaces", tab: "Tab" },
        },
      },
      {
        name: "Tree marker style",
        desc: "Visual style of the tree: modern (no markers) or classic (┐├┘).",
        control: {
          type: "dropdown",
          key: "markerStyle",
          options: { modern: "Modern (clean indent)", classic: "Classic (┐├┘)" },
        },
      },
      {
        name: "Auto-collapse depth",
        desc: "Nodes strictly deeper than this depth start collapsed. 0 = collapse all but root.",
        control: { type: "text", key: "autoCollapseDepth" },
      },
      {
        name: "Validate against JSON schema",
        desc: "Off by default. When enabled, the plugin automatically loads a sibling schema file next to the current .json file (e.g. data.json → data.schema.json) and highlights validation errors in real time. Enabling this auto-loads schema files from your vault — only turn it on if you trust those files.",
        control: { type: "toggle", key: "validateAgainstSchema" },
      },
      {
        name: "Companion schema suffix",
        desc: "Suffix used to find the sibling schema file. Default '.schema.json' resolves data.json → data.schema.json.",
        control: { type: "text", key: "companionSchemaSuffix" },
      },
      {
        type: "group",
        heading: t("set.groupRepair"),
        items: [
          {
            name: t("set.endpoints"),
            desc: t("set.endpointsDesc"),
            render: (s: Setting) => {
              this.renderEndpoints(s);
            },
          },
          {
            name: t("request.title"),
            render: (s: Setting) => {
              this.renderRequestSection(s);
            },
          },
          {
            name: t("set.timeout"),
            desc: t("set.timeoutDesc"),
            control: { type: "number", key: "timeoutSec", min: TIMEOUT_SEC_MIN },
          },
        ],
      },
    ] as unknown as SettingDefinitionItem[];
  }

  private endpointStrings(): EndpointListStrings {
    return {
      addPlaceholder: t("ep.addPlaceholder"),
      apiKeyPlaceholder: t("ep.apiKeyPlaceholder"),
      modelPlaceholder: t("ep.modelPlaceholder"),
      ariaUrl: t("ep.ariaUrl"),
      ariaAdd: t("ep.ariaAdd"),
      ariaApiKey: (url) => t("ep.ariaApiKey", url),
      ariaModel: (url) => t("ep.ariaModel", url),
      emptyModelLabel: () => t("ep.globalModelUnset"),
      modelHint: (key) =>
        key === "unreachable"
          ? t("ep.hint.unreachable")
          : key === "no-list"
            ? t("ep.hint.noList")
            : "",
      savedSuffix: t("ep.saved"),
      refreshModels: t("ep.refreshModels"),
      moveToFront: t("ep.moveToFront"),
      remove: t("ep.remove"),
      thirdParty: t("ep.thirdParty"),
      probing: t("ep.probing"),
      statusTooltip: (status) =>
        status.kind === "unknown"
          ? t("ep.status.unknown", status.raw ?? "")
          : t(STATUS_KEY[status.kind]),
      role: (role: EndpointRole) =>
        role.kind === "active"
          ? t("ep.role.active")
          : role.kind === "standby"
            ? t("ep.role.standby", String(role.position))
            : role.kind === "unreachable"
              ? t("ep.role.unreachable")
              : t("ep.role.skippedModel"),
      warnings: (warnings) =>
        warnings.map((w) => (WARN_KEY[w.rule] ? t(WARN_KEY[w.rule]) : w.message)).join(" · "),
      presetTooltip: (preset) => t("ep.preset", preset.label),
      presetLabel: (preset) => preset.label,
      checkConnection: t("ep.checkConnection"),
      saveFailed: t("ep.saveFailed"),
    };
  }

  private renderEndpoints(setting: Setting): void {
    const host = settingBodyHost(setting);
    const plugin = this.settingsPlugin;
    buildEndpointSourceSection({
      app: this.app,
      containerEl: host,
      capability: "chat",
      caller: "json-editor",
      choice: () => plugin.settings.choice,
      setChoice: async (c) => {
        plugin.settings.choice = c;
        await plugin.saveSettings();
        plugin.repairService.invalidate();
        await plugin.repairService.resolve();
      },
      local: () => plugin.settings.endpoints,
      strings: {
        managed: t("src.managed"),
        managedDesc: t("src.managedDesc"),
        openManager: t("src.openManager"),
        pickEndpoint: t("src.pickEndpoint"),
        automatic: t("src.automatic"),
        model: t("set.model"),
        importLocal: t("src.importLocal"),
        imported: (r) => t("src.imported", String(r.added.length), String(r.merged.length)),
        importFailed: t("src.importFailed"),
        modelHint: (key) => (key === "" ? "" : t(`set.modelHint.${key}`)),
        savedSuffix: t("ep.saved"),
        refreshModels: t("ep.refreshModels"),
        saveFailed: t("ep.saveFailed"),
      },
      renderLocalList: () => {
        this.renderLocalEndpointList(host);
      },
      rerender: () => {
        this.refreshUi();
      },
    });
  }

  private renderLocalEndpointList(host: HTMLElement): void {
    const plugin = this.settingsPlugin;
    buildEndpointList({
      containerEl: host,
      label: t("set.endpoints"),
      desc: t("set.endpointsDesc"),
      placeholder: "http://127.0.0.1:1234",
      strings: this.endpointStrings(),
      cache: this.modelLists,
      get: () => plugin.settings.endpoints,
      set: (eps) => {
        plugin.settings.endpoints = eps;
      },
      active: () => plugin.repairService.activeEndpointUrl(),
      clientFor: (cfg) => clientFor(cfg, PROBE_TIMEOUT_MS),
      globalModel: () => "",
      save: () => plugin.saveSettings(),
      reconnect: async () => {
        plugin.repairService.invalidate();
        await plugin.repairService.resolve();
      },
      rerender: () => {
        this.refreshUi();
      },
      presets: ENDPOINT_PRESETS,
    });
  }

  private fieldStateText(e: FieldExplain): string {
    const key = {
      "sent-effective": "request.state.sentEffective",
      "sent-unproven": "request.state.sentUnproven",
      "not-sent-ignored": "request.state.notSentIgnored",
      "not-sent-unsupported": "request.state.notSentUnsupported",
      "not-sent-unknown-family": "request.state.notSentUnknownFamily",
      "not-sent-no-value": "request.state.notSentNoValue",
    }[e.state];
    let text = t(key);
    const noteKey = e.note
      ? {
          "raised-to-reserve": "request.note.raisedToReserve",
          "raised-to-thinking-floor": "request.note.raisedToThinkingFloor",
          "below-thinking-floor": "request.note.belowThinkingFloor",
          "off-not-possible": "request.note.offNotPossible",
        }[e.note]
      : undefined;
    if (noteKey) text += ` ${t(noteKey)}`;
    if (e.field === "top_p") text += t("request.top_p.hint");
    return text;
  }

  private renderRequestSection(setting: Setting): void {
    const host = settingBodyHost(setting);
    const plugin = this.settingsPlugin;
    buildRequestSection({
      containerEl: host,
      modes: [MODE],
      state: () => plugin.repairService.requestSectionState(),
      settings: () => plugin.settings.request,
      save: (next) => plugin.repairService.saveRequestSettings(next),
      maxTokens: () => undefined,
      session: plugin.repairService.requestSession,
      collapsedStorage: this.collapsedStorage,
      rerender: () => {
        this.refreshUi();
      },
      strings: {
        title: t("request.title"),
        head: (family, familySource, backend, backendSource) => {
          const famLabel = family === "—" ? "—" : (FAMILIES[family as FamilyId]?.label ?? family);
          const backLabel =
            backend === "unknown"
              ? t("request.backendSource.none")
              : (BACKENDS[backend as BackendId]?.label ?? backend);
          return t(
            "request.head",
            famLabel,
            t(`request.familySource.${familySource}`),
            backLabel,
            t(`request.backendSource.${backendSource}`),
          );
        },
        unknownFamily: t("request.unknownFamily"),
        jitWarning: (model, defaultModel) => t("request.jitWarning", model, defaultModel),
        sentAs: (model) => t("request.sentAs", model),
        modeHeading: (mode) => t(`request.mode.${mode}`),
        fieldName: (field) => t(`request.field.${field}`),
        fieldDesc: (e) => this.fieldStateText(e),
        reset: t("request.reset"),
        thinkingLevel: t("request.thinkingLevel"),
        level: (l) => t(`request.level.${l}`),
        levelPicker: t("request.levelPicker"),
        levelPickerDesc: t("request.levelPickerDesc"),
        dormant: (fam) =>
          t(
            "request.dormant",
            fam === "unknown" ? t("request.familySource.none") : (FAMILIES[fam]?.label ?? fam),
          ),
        deleteDormant: t("request.deleteDormant"),
        lastRequest: t("request.lastRequest"),
        lastRequestNone: t("request.lastRequestNone"),
        copy: t("request.copy"),
        copied: t("request.copied"),
        deviationsOk: t("request.deviationsOk"),
        deviationsWarn: (n) => t("request.deviationsWarn", String(n)),
        deviation: (kind, count, detail) => `${deviationDetail(kind, detail)} (${count}×)`,
      },
    });
  }

  /** Nur ueber `getSettingDefinitions()` gezeichnet: Obsidian >= 1.13 direkt, darunter ueber
   *  den Walker (`display()`), der die Deklaration mit der klassischen Setting-API nachzeichnet. */
  display(): void {
    this.renderImperative();
  }

  hide(): void {
    this.modelLists.clear();
    this.uninstallRefresh();
  }

  private refreshUi(): void {
    refreshSettingsTab(this, () => {
      this.renderImperative();
    });
  }

  private renderImperative(): void {
    this.cleanupPrevious();
    this.containerEl.replaceChildren();
    this.cleanupPrevious = renderSettingDefinitions(
      this.containerEl,
      this.getSettingDefinitions(),
      this,
      this.app,
    );
  }

  getControlValue(key: string): unknown {
    const s = this.settingsPlugin.settings;
    switch (key) {
      case "defaultMode":
        return s.defaultMode;
      // The control speaks "tab"; the setting stores an actual tab character.
      case "indent":
        return s.indent === "\t" ? "tab" : String(s.indent);
      case "markerStyle":
        return s.markerStyle;
      case "autoCollapseDepth":
        return String(s.autoCollapseDepth);
      case "validateAgainstSchema":
        return s.validateAgainstSchema;
      case "companionSchemaSuffix":
        return s.companionSchemaSuffix;
      case "timeoutSec":
        return s.timeoutSec;
      default:
        return undefined;
    }
  }

  /**
   * Invalid input is dropped rather than stored — a negative depth or a suffix
   * containing a path separator would be applied to every file that opens
   * afterwards, so the setting keeps its previous value instead.
   */
  setControlValue(key: string, value: unknown): void {
    const s = this.settingsPlugin.settings;
    switch (key) {
      case "defaultMode":
        s.defaultMode = value as "tree" | "source";
        break;
      case "indent":
        s.indent = value === "tab" ? "\t" : (Number.parseInt(String(value), 10) as 2 | 4);
        break;
      case "markerStyle":
        s.markerStyle = value as "modern" | "classic";
        break;
      case "autoCollapseDepth": {
        const n = Number.parseInt(String(value), 10);
        if (!Number.isFinite(n) || n < 0) return;
        s.autoCollapseDepth = n;
        break;
      }
      case "validateAgainstSchema":
        s.validateAgainstSchema = Boolean(value);
        break;
      case "companionSchemaSuffix": {
        const trimmed = String(value).trim();
        if (!isValidCompanionSuffix(trimmed)) return;
        s.companionSchemaSuffix = trimmed;
        break;
      }
      case "timeoutSec": {
        const n = Number.parseInt(String(value), 10);
        s.timeoutSec = Number.isFinite(n) ? Math.max(TIMEOUT_SEC_MIN, n) : s.timeoutSec;
        break;
      }
      default:
        return;
    }
    void this.settingsPlugin.saveSettings();
  }
}
