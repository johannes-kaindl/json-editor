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

/**
 * The inverse of pathToString. Lived as a private helper in the adapter until
 * 1.11.0, but it is pure and belongs next to its counterpart — the path picker
 * needs it too.
 */
export function parsePathStr(pathStr: string): JsonPath {
  if (pathStr === "root") return [];
  const segments: JsonPath = [];
  let i = 0;
  let buf = "";
  const flushString = () => {
    if (buf.length > 0) {
      segments.push(buf);
      buf = "";
    }
  };
  while (i < pathStr.length) {
    const c = pathStr[i];
    if (c === ".") {
      flushString();
      i++;
    } else if (c === "[") {
      flushString();
      // Quoted-key form: ["..."]. Scan for the closing `"]` and respect
      // escaped quotes (\"). A bare `]` inside the key value would otherwise
      // be misread as the structural close and corrupt the segment.
      if (pathStr[i + 1] === '"') {
        let j = i + 2;
        let raw = "";
        while (j < pathStr.length) {
          if (pathStr[j] === "\\" && pathStr[j + 1] === '"') {
            raw += '"';
            j += 2;
          } else if (pathStr[j] === '"' && pathStr[j + 1] === "]") {
            break;
          } else {
            raw += pathStr[j];
            j++;
          }
        }
        segments.push(raw);
        i = j + 2; // skip `"]`
      } else {
        const close = pathStr.indexOf("]", i);
        const inner = pathStr.slice(i + 1, close);
        segments.push(Number.parseInt(inner, 10));
        i = close + 1;
      }
    } else {
      buf += c;
      i++;
    }
  }
  flushString();
  return segments;
}
