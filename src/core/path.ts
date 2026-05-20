import type { JsonPath } from "./types";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function pathToString(path: JsonPath): string {
  if (path.length === 0) return "root";
  let result = "";
  for (const seg of path) {
    if (typeof seg === "number") {
      result += `[${seg}]`;
    } else if (IDENTIFIER_RE.test(seg)) {
      result += result === "" ? seg : `.${seg}`;
    } else {
      result += `["${seg.replace(/"/g, '\\"')}"]`;
    }
  }
  return result;
}
