import { Notice } from "obsidian";
import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";

/**
 * Write text to the clipboard, guarding the navigator.clipboard absence on
 * older Android WebViews / non-secure contexts where reading .writeText throws
 * synchronously (audit 2.19). Calls onCopied on success, shows a Notice on any
 * failure.
 */
export function copyToClipboard(text: string, onCopied?: () => void): void {
  const clipboard = navigator.clipboard;
  if (!clipboard) {
    new Notice("Copy failed");
    return;
  }
  clipboard.writeText(text).then(
    () => onCopied?.(),
    () => new Notice("Copy failed"),
  );
}

export function copyJsonValue(value: JsonValue, onCopied?: () => void): void {
  copyToClipboard(JSON.stringify(value, null, 2), onCopied);
}

export function copyJsonPath(path: JsonPath, onCopied?: () => void): void {
  copyToClipboard(pathToString(path), onCopied);
}
