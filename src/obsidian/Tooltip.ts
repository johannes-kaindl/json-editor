import type { JsonValue, JsonPath } from "../core/types";
import { pathToString } from "../core/path";

export interface TooltipContent {
  typeLabel: string;
  pathStr: string;
  preview?: string;
}

const SHOW_DELAY_MS = 500;

export class Tooltip {
  private el: HTMLElement;
  private typeEl: HTMLElement;
  private pathEl: HTMLElement;
  private previewEl: HTMLElement;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "json-tooltip";
    this.el.hidden = true;

    const meta = document.createElement("div");
    meta.className = "tt-meta";
    this.typeEl = document.createElement("span");
    this.typeEl.className = "tt-type";
    const sep = document.createElement("span");
    sep.textContent = " · ";
    this.pathEl = document.createElement("span");
    this.pathEl.className = "tt-path";
    meta.appendChild(this.typeEl);
    meta.appendChild(sep);
    meta.appendChild(this.pathEl);

    this.previewEl = document.createElement("div");
    this.previewEl.className = "tt-preview";

    this.el.appendChild(meta);
    this.el.appendChild(this.previewEl);
    document.body.appendChild(this.el);
  }

  show(target: HTMLElement, content: TooltipContent): void {
    this.cancelPending();
    this.pendingTimer = setTimeout(() => {
      this.typeEl.textContent = content.typeLabel;
      this.pathEl.textContent = content.pathStr;
      this.previewEl.textContent = content.preview ?? "";
      this.position(target);
      this.el.hidden = false;
      this.pendingTimer = null;
    }, SHOW_DELAY_MS);
  }

  hide(): void {
    this.cancelPending();
    this.el.hidden = true;
  }

  destroy(): void {
    this.cancelPending();
    this.el.remove();
  }

  private cancelPending(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  private position(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    this.el.style.position = "absolute";
    this.el.style.left = `${rect.left + window.scrollX}px`;
    const ttHeight = 60; // approximation; flip if not enough room below
    const willFitBelow = rect.bottom + ttHeight < window.innerHeight;
    if (willFitBelow) {
      this.el.style.top = `${rect.bottom + 4 + window.scrollY}px`;
    } else {
      this.el.style.top = `${rect.top - ttHeight - 4 + window.scrollY}px`;
    }
  }
}

export function tooltipContentForValue(value: JsonValue, path: JsonPath): TooltipContent {
  const pathStr = pathToString(path);
  if (value === null) {
    return { typeLabel: "null", pathStr, preview: "null" };
  }
  if (typeof value === "boolean") {
    return { typeLabel: "boolean", pathStr, preview: String(value) };
  }
  if (typeof value === "number") {
    return { typeLabel: "number", pathStr, preview: String(value) };
  }
  if (typeof value === "string") {
    let preview = value;
    if (preview.length > 200) preview = preview.slice(0, 199) + "…";
    return { typeLabel: "string", pathStr, preview: `"${preview}"` };
  }
  if (Array.isArray(value)) {
    return { typeLabel: "array", pathStr, preview: `${value.length} items` };
  }
  return { typeLabel: "object", pathStr, preview: `${Object.keys(value).length} entries` };
}
