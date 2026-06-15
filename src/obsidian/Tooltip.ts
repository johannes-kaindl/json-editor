import { pathToString } from "../core/path";
import type { JsonPath, JsonValue } from "../core/types";

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
  private pendingTimer: number | null = null;
  private win: Window;

  // host ties the tooltip to the view's window so it works in pop-out windows
  // (audit 2.11): element, timers, and viewport metrics all come from there.
  constructor(host: HTMLElement) {
    const doc = host.ownerDocument;
    this.win = doc.defaultView ?? window;
    this.el = doc.createElement("div");
    this.el.className = "json-tooltip";
    this.el.hidden = true;

    const meta = activeDocument.createElement("div");
    meta.className = "tt-meta";
    this.typeEl = activeDocument.createElement("span");
    this.typeEl.className = "tt-type";
    const sep = activeDocument.createElement("span");
    sep.textContent = " · ";
    this.pathEl = activeDocument.createElement("span");
    this.pathEl.className = "tt-path";
    meta.appendChild(this.typeEl);
    meta.appendChild(sep);
    meta.appendChild(this.pathEl);

    this.previewEl = activeDocument.createElement("div");
    this.previewEl.className = "tt-preview";

    this.el.appendChild(meta);
    this.el.appendChild(this.previewEl);
    doc.body.appendChild(this.el);
  }

  show(target: HTMLElement, content: TooltipContent): void {
    this.cancelPending();
    this.pendingTimer = this.win.setTimeout(() => {
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
      this.win.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  private position(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    // position: absolute lives in styles.css (.json-tooltip); only the dynamic
    // left/top are set inline (audit 2.21). Window metrics come from the host
    // window so positioning is correct in pop-outs (2.11).
    this.el.style.left = `${rect.left + this.win.scrollX}px`;
    const ttHeight = 60; // approximation; flip if not enough room below
    const willFitBelow = rect.bottom + ttHeight < this.win.innerHeight;
    if (willFitBelow) {
      this.el.style.top = `${rect.bottom + 4 + this.win.scrollY}px`;
    } else {
      this.el.style.top = `${rect.top - ttHeight - 4 + this.win.scrollY}px`;
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
    if (preview.length > 200) preview = `${preview.slice(0, 199)}…`;
    return { typeLabel: "string", pathStr, preview: `"${preview}"` };
  }
  if (Array.isArray(value)) {
    return { typeLabel: "array", pathStr, preview: `${value.length} items` };
  }
  return { typeLabel: "object", pathStr, preview: `${Object.keys(value).length} entries` };
}
