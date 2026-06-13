import { Notice } from "obsidian";
import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";

export function createCopyButton(value: JsonValue, path: JsonPath): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "json-copy-btn";
  btn.type = "button";
  btn.textContent = "⧉";
  btn.title = "Copy value (alt-click: copy path)";

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wantsPath = e.altKey;
    const text = wantsPath ? pathToString(path) : JSON.stringify(value, null, 2);
    // navigator.clipboard is absent on older Android WebViews / non-secure
    // contexts; reading .writeText there throws synchronously (audit 2.19).
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      new Notice("Copy failed");
      return;
    }
    clipboard.writeText(text).then(
      () => markCopied(btn),
      () => new Notice("Copy failed"),
    );
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
