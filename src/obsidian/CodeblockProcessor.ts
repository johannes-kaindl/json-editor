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
  const tree = renderTree(parsed.value, {
    readonly: true,
    markerStyle: settings.markerStyle,
    autoCollapseDepth: settings.autoCollapseDepth,
  });
  el.appendChild(tree);
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
