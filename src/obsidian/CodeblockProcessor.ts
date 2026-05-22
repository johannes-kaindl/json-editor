import type { MarkdownPostProcessorContext } from "obsidian";
import { parse } from "../core/parse";
import { renderTree } from "../core/render";
import type { JsonEditorSettings } from "./SettingsTab";

export function renderJsonCodeblock(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
  settings: JsonEditorSettings
): void {
  const parsed = parse(source);
  if (!parsed.ok) {
    renderFallback(source, el, parsed.error);
    return;
  }
  const card = document.createElement("div");
  card.className = "json-codeblock";

  const head = document.createElement("div");
  head.className = "json-codeblock-head";
  const label = document.createElement("span");
  label.className = "json-codeblock-label";
  label.textContent = "JSON";
  head.appendChild(label);
  head.appendChild(makeCopyButton(source));
  card.appendChild(head);

  const lineCount = source.split("\n").length;
  const autoCollapseDepth = lineCount > 20 ? -1 : settings.autoCollapseDepth;
  const tree = renderTree(parsed.value, {
    readonly: true,
    markerStyle: settings.markerStyle,
    autoCollapseDepth,
  });
  card.appendChild(tree);
  el.appendChild(card);
}

function makeCopyButton(source: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "json-codeblock-copy";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", () => {
    navigator.clipboard?.writeText(source).then(
      () => {
        btn.classList.add("copied");
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = "Copy";
        }, 800);
      },
      () => {
        /* clipboard unavailable — no UI */
      }
    );
  });
  return btn;
}

function renderFallback(source: string, el: HTMLElement, errorMessage: string): void {
  const wrapper = document.createElement("div");
  wrapper.className = "json-codeblock-fallback";
  const indicator = document.createElement("span");
  indicator.className = "json-codeblock-error-indicator";
  indicator.title = `Invalid JSON: ${errorMessage}`;
  indicator.textContent = "⚠";
  wrapper.appendChild(indicator);
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.className = "language-json";
  code.textContent = source;
  pre.appendChild(code);
  wrapper.appendChild(pre);
  el.appendChild(wrapper);
}
