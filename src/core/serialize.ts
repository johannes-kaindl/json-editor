import type { JsonValue, SerializeOptions } from "./types";

export function serialize(value: JsonValue, opts: SerializeOptions): string {
  const indent = opts.indent;
  if (indent === 0) {
    return JSON.stringify(value);
  }
  return JSON.stringify(value, null, indent);
}
