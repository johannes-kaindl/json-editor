import type { JsonValue, JsonPath, RenderOptions } from "./types";
import { pathToString } from "./path";

type ContainerKind = "object" | "array";

interface ContainerItem {
  segment: string | number;
  value: JsonValue;
}

export function renderTree(value: JsonValue, opts: RenderOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "json-tree-root";
  root.setAttribute("role", "tree");
  root.setAttribute("aria-label", "JSON content");
  renderValue(root, value, [], 0, opts);
  return root;
}

function renderValue(
  parent: HTMLElement,
  value: JsonValue,
  path: JsonPath,
  depth: number,
  opts: RenderOptions
): void {
  if (value === null) {
    parent.appendChild(makePrimitive("null", "json-null", path, value, opts));
    return;
  }
  if (typeof value === "boolean") {
    parent.appendChild(makePrimitive(String(value), "json-boolean", path, value, opts));
    return;
  }
  if (typeof value === "number") {
    parent.appendChild(makePrimitive(String(value), "json-number", path, value, opts));
    return;
  }
  if (typeof value === "string") {
    parent.appendChild(makePrimitive(`"${value}"`, "json-string", path, value, opts));
    return;
  }
  if (Array.isArray(value)) {
    const items: ContainerItem[] = value.map((v, i) => ({ segment: i, value: v }));
    renderContainer(parent, items, path, depth, opts, "array");
    return;
  }
  const obj = value as { [k: string]: JsonValue };
  const items: ContainerItem[] = Object.entries(obj).map(([k, v]) => ({ segment: k, value: v }));
  renderContainer(parent, items, path, depth, opts, "object");
}

function makePrimitive(
  text: string,
  cls: string,
  path: JsonPath,
  value: JsonValue,
  opts: RenderOptions
): HTMLElement {
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text;
  if (!opts.readonly && opts.onValueClick && value !== null) {
    span.classList.add("json-editable");
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onValueClick?.(path, value);
    });
  } else if (!opts.readonly && value === null) {
    span.title = "Edit in Source to change type";
  }
  if (opts.onValueHover) {
    span.addEventListener("mouseenter", () => {
      opts.onValueHover!(span, path, value);
    });
  }
  return span;
}

function renderContainer(
  parent: HTMLElement,
  items: ContainerItem[],
  path: JsonPath,
  depth: number,
  opts: RenderOptions,
  kind: ContainerKind
): void {
  const { open, close } = bracketsFor(kind);

  if (items.length === 0) {
    const span = document.createElement("span");
    span.className = "json-bracket";
    span.textContent = `${open}${close}`;
    parent.appendChild(span);
    return;
  }

  const container = document.createElement("div");
  container.className = "json-container";
  container.dataset.depth = String(depth);
  container.setAttribute("role", "treeitem");

  // toggle is a direct child of container so toggle.parentElement === container,
  // which also contains json-content as a direct child — this is what the toggle
  // test (and the keyboard-nav toggleContainer helper) expects.
  const toggle = document.createElement("span");
  toggle.className = "json-collapse-toggle";
  toggle.appendChild(makeChevron());
  container.appendChild(toggle);

  const openBracket = document.createElement("span");
  openBracket.className = "json-bracket";
  openBracket.textContent = open;
  container.appendChild(openBracket);

  const chip = document.createElement("span");
  chip.className = "json-collapse-chip";
  chip.textContent = collapseChipLabel(items.length, kind);
  container.appendChild(chip);

  const content = document.createElement("div");
  content.className = "json-content";
  content.setAttribute("role", "group");
  const shouldCollapse =
    opts.autoCollapseDepth !== undefined && depth > opts.autoCollapseDepth;
  if (shouldCollapse) {
    content.classList.add("collapsed");
    container.classList.add("is-collapsed");
    container.setAttribute("aria-expanded", "false");
  } else {
    toggle.classList.add("is-open");
    container.setAttribute("aria-expanded", "true");
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = content.classList.toggle("collapsed");
    container.classList.toggle("is-collapsed", collapsed);
    toggle.classList.toggle("is-open", !collapsed);
    container.setAttribute("aria-expanded", String(!collapsed));
    opts.onCollapse?.(path, collapsed);
  });

  items.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "json-row";
    row.setAttribute("role", "treeitem");
    const itemPath = [...path, item.segment];
    row.setAttribute("data-path", pathToString(itemPath));
    if (opts.onPathClick) {
      row.addEventListener("click", () => opts.onPathClick!(itemPath), true);
    }
    if (opts.markerStyle === "classic") {
      const marker = document.createElement("span");
      marker.className = "json-marker";
      marker.textContent = markerFor(i, items.length);
      row.appendChild(marker);
    }
    row.appendChild(keyOrIndexElement(item.segment, kind));
    row.appendChild(document.createTextNode(": "));
    renderValue(row, item.value, itemPath, depth + 1, opts);
    if (i < items.length - 1) row.appendChild(document.createTextNode(","));
    content.appendChild(row);
  });

  container.appendChild(content);
  const closeBracket = document.createElement("span");
  closeBracket.className = "json-bracket";
  closeBracket.textContent = close;
  container.appendChild(closeBracket);
  parent.appendChild(container);
}

function bracketsFor(kind: ContainerKind): { open: string; close: string } {
  return kind === "object" ? { open: "{", close: "}" } : { open: "[", close: "]" };
}

function keyOrIndexElement(segment: string | number, kind: ContainerKind): HTMLElement {
  if (kind === "object") {
    const keyEl = document.createElement("span");
    keyEl.className = "json-key";
    keyEl.textContent = `"${segment}"`;
    return keyEl;
  }
  const idx = document.createElement("span");
  idx.className = "json-index";
  idx.textContent = String(segment);
  return idx;
}

function collapseChipLabel(count: number, kind: ContainerKind): string {
  const noun = kind === "object" ? "key" : "item";
  const text = `${count} ${noun}${count === 1 ? "" : "s"}`;
  return kind === "object" ? `{ ${text} }` : `[ ${text} ]`;
}

function makeChevron(): SVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 10 10");
  svg.setAttribute("width", "9");
  svg.setAttribute("height", "9");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "M3 1 L7 5 L3 9");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function markerFor(index: number, length: number): string {
  if (length === 1) return "─";
  if (index === 0) return "┐";
  if (index === length - 1) return "┘";
  return "├";
}
