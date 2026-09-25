import { type App, ButtonComponent, Modal } from "obsidian";
import { sideBySide } from "../core/repair/diff-view";
import type { FenceLang } from "../core/repair/fence";
import { diffLines } from "../vendor/kit/diff";
import { t } from "../vendor/kit/i18n";
import type { RepairOutcome } from "./repair-service";

export type ApplyResult = "ok" | "stale" | "no-file";

export interface RepairModalOptions {
  source: string;
  errorMessage: string;
  lang: FenceLang;
  /** Ein Lauf gegen das Modell; das Signal bricht ihn ab (Neu versuchen, Schliessen). */
  run(signal: AbortSignal): Promise<RepairOutcome>;
  /** Schreibt den Vorschlag in den Codeblock — nur nach Bestaetigung, nur dessen Inhalt. */
  apply(text: string): Promise<ApplyResult>;
  timeoutSec: number;
  notice(text: string): void;
}

/** Bestaetigungs-Modal der Reparatur: links Original, rechts Vorschlag, Zeilen-Diff farbig
 *  darueber gelegt. Anwenden ist erst frei, wenn die Antwort mit demselben Parser gueltig ist —
 *  ein Fehlschlag zeigt seinen Grund statt eines Anwenden-Knopfs. */
export class RepairModal extends Modal {
  private ctrl: AbortController | null = null;
  private proposal: string | null = null;
  private bodyEl!: HTMLElement;
  private applyBtn!: ButtonComponent;
  private retryBtn!: ButtonComponent;
  private closing = false;

  constructor(
    app: App,
    private readonly opts: RepairModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("repair.title"));
    this.modalEl.addClass("json-repair-modal");
    const c = this.contentEl;
    c.createEl("p", { cls: "json-repair-error", text: t("repair.error", this.opts.errorMessage) });
    this.bodyEl = c.createDiv({ cls: "json-repair-body" });
    // Cancel links, Bestaetigen rechts (UI-STANDARD §2).
    const btns = c.createDiv({ cls: "modal-button-container" });
    new ButtonComponent(btns).setButtonText(t("repair.discard")).onClick(() => {
      this.close();
    });
    this.retryBtn = new ButtonComponent(btns).setButtonText(t("repair.retry")).onClick(() => {
      void this.attempt();
    });
    this.applyBtn = new ButtonComponent(btns)
      .setButtonText(t("repair.apply"))
      .setCta()
      .onClick(() => {
        void this.confirm();
      });
    this.applyBtn.setDisabled(true);
    void this.attempt();
  }

  onClose(): void {
    this.closing = true;
    this.ctrl?.abort();
    this.contentEl.empty();
  }

  private status(text: string, kind: "working" | "error" | "info"): void {
    this.bodyEl.empty();
    this.bodyEl.createEl("p", { cls: `json-repair-status is-${kind}`, text });
    this.bodyEl.setAttribute("role", kind === "error" ? "alert" : "status");
  }

  private async attempt(): Promise<void> {
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.proposal = null;
    this.applyBtn.setDisabled(true);
    this.retryBtn.setDisabled(true);
    this.status(t("repair.working"), "working");
    const out = await this.opts.run(ctrl.signal);
    if (this.closing || ctrl.signal.aborted) return;
    this.retryBtn.setDisabled(false);
    if (!out.ok) {
      this.status(this.errorText(out), "error");
      return;
    }
    if (out.text.trim() === this.opts.source.trim()) {
      this.status(t("repair.noChanges"), "info");
      return;
    }
    this.proposal = out.text;
    this.renderDiff(out.text);
    this.applyBtn.setDisabled(false);
  }

  private errorText(out: Extract<RepairOutcome, { ok: false }>): string {
    const e = out.error;
    switch (e.kind) {
      case "no-endpoint":
        return e.reason === "secret-missing"
          ? t("repair.noEndpointSecretMissing")
          : t("repair.noEndpoint");
      case "http":
        return t("repair.http", e.status, e.detail);
      case "timeout":
        return t("repair.timeout", this.opts.timeoutSec);
      case "empty":
        return t("repair.empty");
      case "invalid":
        return t("repair.invalid", e.detail);
      case "aborted":
      case "network":
        return t("repair.network");
    }
  }

  private renderDiff(proposal: string): void {
    this.bodyEl.empty();
    this.bodyEl.removeAttribute("role");
    const grid = this.bodyEl.createDiv({ cls: "json-repair-diff" });
    const head = grid.createDiv({ cls: "json-repair-diff-head" });
    head.createSpan({ text: t("repair.original") });
    head.createSpan({ text: t("repair.proposal") });
    const left = grid.createEl("pre", { cls: "json-repair-col" });
    const right = grid.createEl("pre", { cls: "json-repair-col" });
    left.setAttribute("aria-label", t("repair.aria.left"));
    right.setAttribute("aria-label", t("repair.aria.right"));
    for (const row of sideBySide(diffLines(this.opts.source, proposal))) {
      const l = left.createDiv({
        cls: `json-repair-line is-${row.kind === "chg" ? "del" : row.kind === "add" ? "empty" : row.kind}`,
      });
      l.setText(row.left ?? "");
      const r = right.createDiv({
        cls: `json-repair-line is-${row.kind === "chg" ? "add" : row.kind === "del" ? "empty" : row.kind}`,
      });
      r.setText(row.right ?? "");
    }
  }

  private async confirm(): Promise<void> {
    if (this.proposal === null) return;
    this.applyBtn.setDisabled(true);
    const result = await this.opts.apply(this.proposal);
    if (result === "ok") {
      this.opts.notice(t("repair.applied"));
      this.close();
      return;
    }
    this.status(result === "stale" ? t("repair.stale") : t("repair.noFile"), "error");
  }
}
