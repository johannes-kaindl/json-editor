import { type MarkdownPostProcessorContext, setIcon } from "obsidian";
import { jsoncParse } from "../core/jsonc";
import { parse } from "../core/parse";
import { renderTree } from "../core/render";
import { copyToClipboard } from "../vendor/kit-obsidian/clipboard";
import { t } from "../vendor/kit/i18n";
import type { JsonEditorSettings } from "./SettingsTab";
import { elementFactory, makeEl } from "./dom";

export type CodeblockLang = "json" | "jsonc";

/** Ruft der Fehler-Karten-Knopf auf. Ohne Handler (Tests, Aufrufer ohne LLM-Anbindung) gibt es
 *  keinen Knopf. */
export type RepairHandler = (block: {
  source: string;
  errorMessage: string;
  lang: CodeblockLang;
  el: HTMLElement;
}) => void;

export function renderJsonCodeblock(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
  settings: JsonEditorSettings,
  lang: CodeblockLang = "json",
  onRepair?: RepairHandler,
): void {
  const parsed = lang === "jsonc" ? jsoncParse(source) : parse(source);
  if (!parsed.ok) {
    renderFallback(el, parsed.error, lang, source, onRepair);
    return;
  }
  const doc = el.ownerDocument;
  const card = makeEl("div", doc);
  card.className = "json-codeblock";

  const head = makeEl("div", doc);
  head.className = "json-codeblock-head";
  const label = makeEl("span", doc);
  label.className = "json-codeblock-label";
  label.textContent = lang === "jsonc" ? "JSONC" : "JSON";
  head.appendChild(label);
  head.appendChild(makeCopyButton(doc, source));
  card.appendChild(head);

  const lineCount = source.split("\n").length;
  const autoCollapseDepth = lineCount > 20 ? -1 : settings.autoCollapseDepth;
  const tree = renderTree(parsed.value, {
    doc,
    makeEl: elementFactory(doc),
    readonly: true,
    markerStyle: settings.markerStyle,
    autoCollapseDepth,
  });
  card.appendChild(tree);
  el.appendChild(card);
}

function makeCopyButton(doc: Document, source: string): HTMLButtonElement {
  const btn = makeEl("button", doc);
  btn.className = "json-codeblock-copy";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", () => {
    void copyToClipboard(source, {
      onCopied: () => {
        btn.classList.add("copied");
        btn.textContent = "Copied";
        window.setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = "Copy";
        }, 800);
      },
    });
  });
  return btn;
}

function makeRepairButton(doc: Document, onClick: () => void): HTMLButtonElement {
  const btn = makeEl("button", doc);
  btn.className = "json-codeblock-repair";
  btn.type = "button";
  btn.setAttribute("aria-label", t("repair.buttonTip"));
  btn.title = t("repair.buttonTip");
  const icon = makeEl("span", doc);
  icon.className = "json-codeblock-repair-icon";
  setIcon(icon, "wrench");
  btn.appendChild(icon);
  const text = makeEl("span", doc);
  text.textContent = t("repair.button");
  btn.appendChild(text);
  btn.addEventListener("click", onClick);
  return btn;
}

function renderFallback(
  el: HTMLElement,
  errorMessage: string,
  lang: CodeblockLang,
  source: string,
  onRepair?: RepairHandler,
): void {
  const doc = el.ownerDocument;
  const card = makeEl("div", doc);
  card.className = "json-codeblock is-error";

  const head = makeEl("div", doc);
  head.className = "json-codeblock-head";
  const label = makeEl("span", doc);
  label.className = "json-codeblock-label";
  label.textContent = `${lang === "jsonc" ? "JSONC" : "JSON"} · error`;
  head.appendChild(label);
  if (onRepair)
    head.appendChild(makeRepairButton(doc, () => onRepair({ source, errorMessage, lang, el })));
  card.appendChild(head);

  const body = makeEl("div", doc);
  body.className = "json-codeblock-error";
  body.textContent = `Invalid ${lang === "jsonc" ? "JSONC" : "JSON"}: ${errorMessage}`;
  card.appendChild(body);

  el.appendChild(card);
}
