// Comment- and format-preserving JSONC edit engine, wrapping Microsoft's
// jsonc-parser. Pure module (no Obsidian imports) — mirrors edit.ts's ops but
// operates on the SOURCE TEXT so `//`, `/* */` comments and formatting survive
// every mutation. See docs/superpowers/specs/2026-07-11-jsonc-support-design.md.
import {
  type FormattingOptions,
  type JSONPath,
  type Node,
  type ParseError,
  applyEdits,
  findNodeAtLocation,
  parse as jparse,
  modify,
  parseTree,
  printParseErrorCode,
} from "jsonc-parser";
import type { JsonType } from "./edit";
import { offsetToLineCol } from "./parse";
import type { JsonPath, JsonValue, ParseResult } from "./types";

const PARSE_OPTS = { allowTrailingComma: true, disallowComments: false } as const;

/** Detect the source's indent width (spaces) from the first indented line; fallback 2. */
export function detectIndent(src: string): number {
  const m = /\n([ \t]+)\S/.exec(src);
  if (!m) return 2;
  const ws = m[1];
  if (ws.includes("\t")) return 2; // tab-indented files keep the space-based formatter default
  return ws.length;
}

function fmt(src: string): FormattingOptions {
  return {
    insertSpaces: true,
    tabSize: detectIndent(src),
    eol: src.includes("\r\n") ? "\r\n" : "\n",
  };
}

/** Comment-tolerant parse. Returns the same ParseResult shape as core/parse.ts. */
export function jsoncParse(text: string): ParseResult {
  if (text.trim() === "") return { ok: false, error: "Empty input", line: 1, col: 1 };
  const errors: ParseError[] = [];
  const value = jparse(text, errors, PARSE_OPTS) as JsonValue;
  if (errors.length > 0) {
    const first = errors[0];
    const { line, col } = offsetToLineCol(text, first.offset);
    return { ok: false, error: printParseErrorCode(first.error), line, col };
  }
  return { ok: true, value };
}

/** Resolve the value at a path from the parsed source (comments stripped). */
function valueAtPath(src: string, path: JsonPath): JsonValue {
  const r = jsoncParse(src);
  if (!r.ok) return null;
  let cur: JsonValue = r.value;
  for (const seg of path) {
    if (Array.isArray(cur) && typeof seg === "number") cur = cur[seg];
    else if (cur !== null && typeof cur === "object" && typeof seg === "string")
      cur = (cur as Record<string, JsonValue>)[seg];
    else return null;
  }
  return cur;
}

export function jsoncEditValue(src: string, path: JsonPath, newVal: JsonValue): string {
  return applyEdits(src, modify(src, path, newVal, { formattingOptions: fmt(src) }));
}

export function jsoncAddKey(
  src: string,
  parentPath: JsonPath,
  key: string,
  val: JsonValue,
): string {
  return applyEdits(
    src,
    modify(src, [...parentPath, key] as JSONPath, val, { formattingOptions: fmt(src) }),
  );
}

export function jsoncAddItem(src: string, parentPath: JsonPath, val: JsonValue): string {
  const parent = valueAtPath(src, parentPath);
  const index = Array.isArray(parent) ? parent.length : 0;
  return applyEdits(
    src,
    modify(src, [...parentPath, index] as JSONPath, val, {
      isArrayInsertion: true,
      formattingOptions: fmt(src),
    }),
  );
}

export function jsoncDelete(src: string, path: JsonPath): string {
  return applyEdits(src, modify(src, path, undefined, { formattingOptions: fmt(src) }));
}

/**
 * Rename a key via a targeted edit on ONLY the key token — the value subtree and
 * every comment inside or trailing it are untouched. jsonc-parser.modify cannot
 * rename a key, and remove+add would drop the value's comments.
 */
export function jsoncRenameKey(src: string, path: JsonPath, newKey: string): string {
  const root = parseTree(src, [], PARSE_OPTS);
  if (!root) return src;
  const valueNode = findNodeAtLocation(root, path);
  const prop = valueNode?.parent; // property node: children = [keyNode, valueNode]
  const keyNode = prop?.type === "property" ? prop.children?.[0] : undefined;
  if (!keyNode) return src;
  return (
    src.slice(0, keyNode.offset) +
    JSON.stringify(newKey) +
    src.slice(keyNode.offset + keyNode.length)
  );
}

function defaultForType(t: JsonType): JsonValue {
  switch (t) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "object":
      return {};
    case "array":
      return [];
  }
}

export function jsoncChangeType(src: string, path: JsonPath, newType: JsonType): string {
  return applyEdits(
    src,
    modify(src, path, defaultForType(newType), { formattingOptions: fmt(src) }),
  );
}

/**
 * A container child, decomposed so reorder can re-insert commas by position.
 * The structural comma is deliberately NOT part of nodeText/commentText — the
 * rebuild sets commas from slot order, keeping them before any trailing comment
 * (a `//` comment would otherwise swallow a following comma).
 */
interface Child {
  nodeStart: number;
  extentEnd: number; // end of the consumed region (node + optional comma + same-line comment)
  nodeText: string;
  commentText: string; // e.g. " // A" (leading whitespace kept), or ""
}

function childInfos(src: string, containerPath: JsonPath): Child[] | null {
  const root = parseTree(src, [], PARSE_OPTS);
  if (!root) return null;
  const container: Node | undefined =
    containerPath.length === 0 ? root : findNodeAtLocation(root, containerPath);
  const kids = container?.children;
  if (!kids || kids.length === 0) return [];
  return kids.map((n) => {
    const nodeStart = n.offset;
    const nodeEnd = n.offset + n.length;
    const nl = src.indexOf("\n", nodeEnd);
    const lineTail = src.slice(nodeEnd, nl === -1 ? src.length : nl);
    // lineTail ∈ { ", // A", " // C", ",", "", " /* x */", … }
    const m = /^(\s*,)?(\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))?/.exec(lineTail);
    const consumed = m?.[0] ?? "";
    return {
      nodeStart,
      extentEnd: nodeEnd + consumed.length,
      nodeText: src.slice(nodeStart, nodeEnd),
      commentText: m?.[2] ?? "",
    };
  });
}

function reorderIndices(count: number, from: number, to: number): number[] {
  const arr = [...Array(count).keys()];
  const [item] = arr.splice(from, 1);
  arr.splice(Math.max(0, Math.min(to, arr.length)), 0, item);
  return arr;
}

/**
 * Rebuild a container's inter-brace text in a new child order, preserving the
 * original inter-element gaps (indentation + free-standing comment lines) in slot
 * order. The moved element carries its own same-line trailing comment; no comment
 * is ever lost (free-standing comments keep their absolute slot — see spec).
 */
function rebuildContainer(src: string, containerPath: JsonPath, order: number[]): string {
  const children = childInfos(src, containerPath);
  if (!children || children.length === 0) return src;
  const innerStart = children[0].nodeStart;
  const innerEnd = children[children.length - 1].extentEnd;
  const gapBefore = children.map((_, i) =>
    i === 0 ? "" : src.slice(children[i - 1].extentEnd, children[i].nodeStart),
  );
  const ordered = order.map((i) => children[i]);
  let out = "";
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0) out += gapBefore[i];
    out += ordered[i].nodeText;
    if (i < ordered.length - 1) out += ",";
    out += ordered[i].commentText;
  }
  return src.slice(0, innerStart) + out + src.slice(innerEnd);
}

export function jsoncMoveArrayItem(
  src: string,
  arrayPath: JsonPath,
  fromIdx: number,
  toIdx: number,
): string {
  const children = childInfos(src, arrayPath);
  if (!children) return src;
  const n = children.length;
  if (fromIdx < 0 || fromIdx >= n) return src;
  const to = Math.max(0, Math.min(toIdx, n - 1));
  if (to === fromIdx) return src;
  return rebuildContainer(src, arrayPath, reorderIndices(n, fromIdx, to));
}

export function jsoncMoveObjectKey(
  src: string,
  objPath: JsonPath,
  key: string,
  toPos: number,
): string {
  const parent = valueAtPath(src, objPath);
  if (parent === null || typeof parent !== "object" || Array.isArray(parent)) return src;
  const keys = Object.keys(parent);
  const from = keys.indexOf(key);
  if (from === -1) return src;
  const to = Math.max(0, Math.min(toPos, keys.length - 1));
  if (to === from) return src;
  return rebuildContainer(src, objPath, reorderIndices(keys.length, from, to));
}
