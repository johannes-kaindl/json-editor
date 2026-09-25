import { type App, type Editor, type MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import { jsoncParse } from "../core/jsonc";
import { parse } from "../core/parse";
import { type FenceLang, findFenceAt, spliceFence } from "../core/repair/fence";
import { t } from "../vendor/kit/i18n";
import { type ApplyResult, RepairModal } from "./RepairModal";
import type { JsonEditorSettings } from "./SettingsTab";
import type { RepairService } from "./repair-service";

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
): void {
  new RepairModal(deps.app, {
    source,
    errorMessage,
    lang,
    apply,
    run: (signal) => deps.service.run(source, errorMessage, lang, signal),
    timeoutSec: deps.settings().timeoutSec,
    notice: (text) => {
      new Notice(text);
    },
  }).open();
}

/** Knopf in der Fehler-Titelzeile eines gerenderten Codeblocks. Die Position kommt erst beim
 *  Klick aus `getSectionInfo` (das Element haengt dann im DOM), geschrieben wird atomar ueber
 *  `vault.process` — und nur, wenn der Inhalt dort noch der ist, den das Modell gesehen hat. */
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
    let result: ApplyResult = "stale";
    await deps.app.vault.process(file, (data) => {
      const next = spliceFence(data, info.lineStart, info.lineEnd, source, text);
      if (next === null) return data;
      result = "ok";
      return next;
    });
    return result;
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
