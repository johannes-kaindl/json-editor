import type { JsonValue, JsonPath, RenderOptions } from "./types";
import { pathToString } from "./path";

export function renderTree(value: JsonValue, opts: RenderOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "json-tree-root";
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
    renderArray(parent, value, path, depth, opts);
    return;
  }
  renderObject(parent, value as { [k: string]: JsonValue }, path, depth, opts);
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

function renderObject(
  parent: HTMLElement,
  obj: { [k: string]: JsonValue },
  path: JsonPath,
  depth: number,
  opts: RenderOptions
): void {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    const span = document.createElement("span");
    span.className = "json-bracket";
    span.textContent = "{}";
    parent.appendChild(span);
    return;
  }
  const container = document.createElement("div");
  container.className = "json-container";
  container.dataset.depth = String(depth);

  // toggle is a direct child of container so that toggle.parentElement === container,
  // which also contains json-content as a direct child — this is what the toggle test expects.
  const toggle = document.createElement("span");
  toggle.className = "json-collapse-toggle";
  toggle.appendChild(makeChevron());
  container.appendChild(toggle);
  container.appendChild(document.createTextNode("{"));

  const content = document.createElement("div");
  content.className = "json-content";
  const shouldCollapse =
    opts.autoCollapseDepth !== undefined && depth > opts.autoCollapseDepth;
  if (shouldCollapse) content.classList.add("collapsed");
  if (!shouldCollapse) toggle.classList.add("is-open");

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = content.classList.toggle("collapsed");
    toggle.classList.toggle("is-open", !collapsed);
    opts.onCollapse?.(path, collapsed);
  });

  entries.forEach(([key, v], i) => {
    const row = document.createElement("div");
    row.className = "json-row";
    row.setAttribute("data-path", pathToString([...path, key]));
    if (opts.onPathClick) {
      row.addEventListener("click", () => opts.onPathClick!([...path, key]), true);
    }
    if (opts.markerStyle === "classic") {
      const marker = document.createElement("span");
      marker.className = "json-marker";
      marker.textContent = markerFor(i, entries.length);
      row.appendChild(marker);
    }
    const keyEl = document.createElement("span");
    keyEl.className = "json-key";
    keyEl.textContent = `"${key}"`;
    row.appendChild(keyEl);
    row.appendChild(document.createTextNode(": "));
    renderValue(row, v, [...path, key], depth + 1, opts);
    if (i < entries.length - 1) row.appendChild(document.createTextNode(","));
    content.appendChild(row);
  });

  container.appendChild(content);
  const closeBracket = document.createElement("span");
  closeBracket.className = "json-bracket";
  closeBracket.textContent = "}";
  container.appendChild(closeBracket);
  parent.appendChild(container);
}

function renderArray(
  parent: HTMLElement,
  arr: JsonValue[],
  path: JsonPath,
  depth: number,
  opts: RenderOptions
): void {
  if (arr.length === 0) {
    const span = document.createElement("span");
    span.className = "json-bracket";
    span.textContent = "[]";
    parent.appendChild(span);
    return;
  }
  const container = document.createElement("div");
  container.className = "json-container";
  container.dataset.depth = String(depth);

  // toggle is a direct child of container — same reasoning as renderObject.
  const toggle = document.createElement("span");
  toggle.className = "json-collapse-toggle";
  toggle.appendChild(makeChevron());
  container.appendChild(toggle);
  container.appendChild(document.createTextNode("["));

  const content = document.createElement("div");
  content.className = "json-content";
  const shouldCollapse =
    opts.autoCollapseDepth !== undefined && depth > opts.autoCollapseDepth;
  if (shouldCollapse) content.classList.add("collapsed");
  if (!shouldCollapse) toggle.classList.add("is-open");

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = content.classList.toggle("collapsed");
    toggle.classList.toggle("is-open", !collapsed);
    opts.onCollapse?.(path, collapsed);
  });

  arr.forEach((v, i) => {
    const row = document.createElement("div");
    row.className = "json-row";
    row.setAttribute("data-path", pathToString([...path, i]));
    if (opts.onPathClick) {
      row.addEventListener("click", () => opts.onPathClick!([...path, i]), true);
    }
    if (opts.markerStyle === "classic") {
      const marker = document.createElement("span");
      marker.className = "json-marker";
      marker.textContent = markerFor(i, arr.length);
      row.appendChild(marker);
    }
    const idx = document.createElement("span");
    idx.className = "json-index";
    idx.textContent = String(i);
    row.appendChild(idx);
    row.appendChild(document.createTextNode(": "));
    renderValue(row, v, [...path, i], depth + 1, opts);
    if (i < arr.length - 1) row.appendChild(document.createTextNode(","));
    content.appendChild(row);
  });

  container.appendChild(content);
  const closeBracket = document.createElement("span");
  closeBracket.className = "json-bracket";
  closeBracket.textContent = "]";
  container.appendChild(closeBracket);
  parent.appendChild(container);
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
