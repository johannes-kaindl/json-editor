import type { JsonPath } from "../core/types";
import { makeEl } from "./dom";

export interface BreadcrumbOptions {
  onSegmentClick?: (subPath: JsonPath) => void;
  /** "Show as root" pressed: the host focuses the tree on this path. */
  onFocusRequest?: (path: JsonPath) => void;
}

export class Breadcrumb {
  private el: HTMLElement;
  private path: JsonPath = [];
  private focusRoot: JsonPath = [];
  private canFocus = false;

  constructor(private opts: BreadcrumbOptions) {
    this.el = makeEl("div");
    this.el.className = "json-breadcrumb";
    this.setPath([]);
  }

  getElement(): HTMLElement {
    return this.el;
  }

  setPath(path: JsonPath): void {
    this.path = path;
    this.render();
  }

  /** The branch the tree is focused on ([] = whole file). Marks the segments. */
  setFocusRoot(path: JsonPath): void {
    this.focusRoot = path;
    this.render();
  }

  /** Whether the current location is a container that can become the root. */
  setCanFocus(can: boolean): void {
    this.canFocus = can;
    this.render();
  }

  private render(): void {
    const path = this.path;
    const focusLen = this.focusRoot.length;
    this.el.replaceChildren();
    const segments: Array<{ label: string; subPath: JsonPath }> = [{ label: "root", subPath: [] }];
    path.forEach((seg, i) => {
      const subPath = path.slice(0, i + 1);
      const label = typeof seg === "number" ? `[${seg}]` : String(seg);
      segments.push({ label, subPath });
    });

    segments.forEach((s, idx) => {
      if (idx > 0) {
        const sep = makeEl("span");
        sep.className = "bc-sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "›";
        this.el.appendChild(sep);
      }
      // A real <button> so the segment is Tab-focusable and Enter/Space-operable
      // (WCAG 2.1.1) — matches every other interactive control in the plugin.
      const segEl = makeEl("button");
      segEl.type = "button";
      segEl.className = "bc-seg";
      if (idx === segments.length - 1) segEl.classList.add("bc-seg-terminal");
      if (idx === 0) segEl.classList.add("bc-seg-root");
      if (focusLen > 0 && idx < focusLen) segEl.classList.add("bc-seg-outside");
      if (focusLen > 0 && idx === focusLen) segEl.classList.add("bc-seg-focus-root");
      if (focusLen > 0 && idx === 0) segEl.setAttribute("aria-label", "Show whole file");
      segEl.textContent = s.label;
      segEl.addEventListener("click", () => {
        this.opts.onSegmentClick?.(s.subPath);
      });
      this.el.appendChild(segEl);
    });

    if (this.canFocus) {
      const focusBtn = makeEl("button");
      focusBtn.type = "button";
      focusBtn.className = "bc-focus-btn";
      focusBtn.setAttribute("aria-label", "Show as root");
      focusBtn.title = "Show as root";
      focusBtn.textContent = "⤢";
      focusBtn.addEventListener("click", () => this.opts.onFocusRequest?.(this.path));
      this.el.appendChild(focusBtn);
    }
  }
}
