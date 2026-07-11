import { type MarkdownPostProcessorContext, Notice } from "obsidian";
import { jsoncParse } from "../core/jsonc";
import { parse } from "../core/parse";
import { renderTree } from "../core/render";
import type { JsonEditorSettings } from "./SettingsTab";

export type CodeblockLang = "json" | "jsonc";

export function renderJsonCodeblock(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
  settings: JsonEditorSettings,
  lang: CodeblockLang = "json",
): void {
  const parsed = lang === "jsonc" ? jsoncParse(source) : parse(source);
  if (!parsed.ok) {
    renderFallback(el, parsed.error, lang);
    return;
  }
  const doc = el.ownerDocument;
  const card = doc.createElement("div");
  card.className = "json-codeblock";

  const head = doc.createElement("div");
  head.className = "json-codeblock-head";
  const label = doc.createElement("span");
  label.className = "json-codeblock-label";
  label.textContent = lang === "jsonc" ? "JSONC" : "JSON";
  head.appendChild(label);
  head.appendChild(makeCopyButton(doc, source));
  card.appendChild(head);

  const lineCount = source.split("\n").length;
  const autoCollapseDepth = lineCount > 20 ? -1 : settings.autoCollapseDepth;
  const tree = renderTree(parsed.value, {
    doc,
    readonly: true,
    markerStyle: settings.markerStyle,
    autoCollapseDepth,
  });
  card.appendChild(tree);
  el.appendChild(card);
}

function makeCopyButton(doc: Document, source: string): HTMLButtonElement {
  const btn = doc.createElement("button");
  btn.className = "json-codeblock-copy";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", () => {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      new Notice("Copy failed");
      return;
    }
    clipboard.writeText(source).then(
      () => {
        btn.classList.add("copied");
        btn.textContent = "Copied";
        window.setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = "Copy";
        }, 800);
      },
      () => new Notice("Copy failed"),
    );
  });
  return btn;
}

function renderFallback(el: HTMLElement, errorMessage: string, lang: CodeblockLang): void {
  const doc = el.ownerDocument;
  const card = doc.createElement("div");
  card.className = "json-codeblock is-error";

  const head = doc.createElement("div");
  head.className = "json-codeblock-head";
  const label = doc.createElement("span");
  label.className = "json-codeblock-label";
  label.textContent = `${lang === "jsonc" ? "JSONC" : "JSON"} · error`;
  head.appendChild(label);
  card.appendChild(head);

  const body = doc.createElement("div");
  body.className = "json-codeblock-error";
  body.textContent = `Invalid ${lang === "jsonc" ? "JSONC" : "JSON"}: ${errorMessage}`;
  card.appendChild(body);

  el.appendChild(card);
}
