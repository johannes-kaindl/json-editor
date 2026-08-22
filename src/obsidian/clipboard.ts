import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";
import { copyToClipboard } from "../vendor/kit-obsidian/clipboard";

export function copyJsonValue(value: JsonValue, onCopied?: () => void): void {
  void copyToClipboard(JSON.stringify(value, null, 2), { onCopied });
}

export function copyJsonPath(path: JsonPath, onCopied?: () => void): void {
  void copyToClipboard(pathToString(path), { onCopied });
}
