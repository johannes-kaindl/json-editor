import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";
import { copyToClipboard } from "../vendor/kit-obsidian/clipboard";
import { makeEl } from "./dom";

export function createCopyButton(
  value: JsonValue,
  path: JsonPath,
  /** Sagt den Erfolg an. Ohne das meldet der Knopf ihn nur ueber Klasse und Glyphe — und
   *  die Glyphe hoert niemand, weil das aria-label den Textinhalt ueberschreibt. */
  onCopied?: (what: "value" | "path") => void,
): HTMLButtonElement {
  const btn = makeEl("button");
  btn.className = "json-copy-btn";
  btn.type = "button";
  btn.textContent = "⧉";
  btn.title = "Copy value (alt-click: copy path)";
  btn.setAttribute("aria-label", "Copy value");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const what = e.altKey ? "path" : "value";
    const text = e.altKey ? pathToString(path) : JSON.stringify(value, null, 2);
    void copyToClipboard(text, {
      onCopied: () => {
        markCopied(btn);
        onCopied?.(what);
      },
    });
  });

  return btn;
}

function markCopied(btn: HTMLButtonElement): void {
  btn.classList.add("copied");
  btn.textContent = "✓";
  window.setTimeout(() => {
    btn.classList.remove("copied");
    btn.textContent = "⧉";
  }, 800);
}
