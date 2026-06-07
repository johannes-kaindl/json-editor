import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";

export function createCopyButton(value: JsonValue, path: JsonPath): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "json-copy-btn";
  btn.type = "button";
  btn.textContent = "⧉";
  btn.title = "Copy value (Alt-click: copy path)";

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wantsPath = e.altKey;
    const text = wantsPath ? pathToString(path) : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text).then(
      () => markCopied(btn),
      () => {
        /* swallow — clipboard might be unavailable; no UI for v1.1 */
      },
    );
  });

  return btn;
}

function markCopied(btn: HTMLButtonElement): void {
  btn.classList.add("copied");
  btn.textContent = "✓";
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.textContent = "⧉";
  }, 800);
}
