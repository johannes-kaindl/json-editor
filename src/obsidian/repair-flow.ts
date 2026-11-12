import { type App, type Editor, type MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import { jsoncParse } from "../core/jsonc";
import { parse } from "../core/parse";
import { type FenceLang, findFenceAt, spliceFence } from "../core/repair/fence";
import { obsidianWritePorts } from "../vendor/kit-obsidian/write-ports";
import { BlockChangedError, writeBlockBody } from "../vendor/kit/block-writer";
import { t } from "../vendor/kit/i18n";
import { type ApplyResult, RepairModal } from "./RepairModal";
import type { JsonEditorSettings } from "./SettingsTab";
import type { RepairService } from "./repair-service";

/** Was die Datei-Ansicht beim Klick auf „Reparieren“ übergibt: der ganze Dateitext, `apply` schreibt ihn zurück. */
export interface FileRepairRequest {
  source: string;
  errorMessage: string;
  lang: FenceLang;
  apply: (text: string) => Promise<ApplyResult>;
}

export interface RepairDeps {
  app: App;
  service: RepairService;
  settings: () => JsonEditorSettings;
}

function open(
  deps: RepairDeps,
  source: string,
  errorMessage: string,
  lang: FenceLang,
  apply: (text: string) => Promise<ApplyResult>,
  target: "block" | "file" = "block",
): void {
  new RepairModal(deps.app, {
    target,
    source,
    errorMessage,
    lang,
    apply,
    run: (signal) => deps.service.run(source, errorMessage, lang, signal),
    notice: (text) => {
      new Notice(text);
    },
  }).open();
}

/** Knopf im Parse-Fehler-Banner der Datei-Ansicht: derselbe Ablauf, der Dateitext statt des Codeblock-Inhalts. */
export function repairFromFile(deps: RepairDeps, req: FileRepairRequest): void {
  open(deps, req.source, req.errorMessage, req.lang, req.apply, "file");
}

/** Knopf in der Fehler-Titelzeile eines gerenderten Codeblocks. Die Position kommt erst beim
 *  Klick aus `getSectionInfo` (das Element haengt dann im DOM), geschrieben wird mit `writeBlockBody` des Kits —
 *  und nur, wenn Zaun-Sprache und Inhalt dort noch die sind, die das Modell gesehen hat. */
export function repairFromBlock(
  deps: RepairDeps,
  block: {
    source: string;
    errorMessage: string;
    lang: FenceLang;
    el: HTMLElement;
    ctx: MarkdownPostProcessorContext;
  },
): void {
  const { source, errorMessage, lang, el, ctx } = block;
  open(deps, source, errorMessage, lang, async (text) => {
    const file = deps.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return "no-file";
    const info = ctx.getSectionInfo(el);
    if (info === null) return "stale";
    // Der Kit-Schreiber prueft Zaun-Sprache und Rumpf an der Stelle, schreibt ueber den offenen Editor
    // (Strg+Z wirkt), sonst atomar ueber `vault.process`, und behaelt das Zeilenende der Notiz.
    try {
      await writeBlockBody(
        obsidianWritePorts(deps.app),
        { path: ctx.sourcePath, lineStart: info.lineStart, lineEnd: info.lineEnd, fence: lang },
        source,
        text.replace(/\s+$/, ""),
      );
      return "ok";
    } catch (e) {
      if (e instanceof BlockChangedError) return "stale";
      throw e;
    }
  });
}

/** Palettenbefehl: der ```json-/```jsonc-Block unter dem Cursor. */
export function repairAtCursor(deps: RepairDeps, editor: Editor): void {
  const text = editor.getValue();
  const fence = findFenceAt(text, editor.getCursor().line);
  if (fence === null) {
    new Notice(t("repair.notInBlock"));
    return;
  }
  const parsed = fence.lang === "jsonc" ? jsoncParse(fence.content) : parse(fence.content);
  if (parsed.ok) {
    new Notice(t("repair.alreadyValid"));
    return;
  }
  open(deps, fence.content, parsed.error, fence.lang, (proposal) => {
    const current = editor.getValue();
    if (spliceFence(current, fence.start, fence.end, fence.content, proposal) === null)
      return Promise.resolve("stale");
    editor.replaceRange(
      `${proposal}\n`,
      { line: fence.start + 1, ch: 0 },
      { line: fence.end, ch: 0 },
    );
    return Promise.resolve("ok");
  });
}
