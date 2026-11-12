import type { JsonPath } from "../core/types";
import { t } from "../vendor/kit/i18n";
import { makeEl } from "./dom";

export interface BreadcrumbOptions {
  onSegmentClick?: (subPath: JsonPath) => void;
  /** "Show as root" pressed: the host focuses the tree on this path. */
  onFocusRequest?: (path: JsonPath) => void;
}

/** More segments than this (root included) fold in the middle. */
const MAX_UNFOLDED = 5;
/** Segments kept at the end of a folded path. */
const KEEP_TAIL = 3;

export class Breadcrumb {
  private el: HTMLElement;
  private path: JsonPath = [];
  private focusRoot: JsonPath = [];
  private canFocus = false;
  /** The "…" was pressed: show every segment of a long path. */
  private expanded = false;

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
    this.expanded = false;
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

  private appendSep(): void {
    const sep = makeEl("span");
    sep.className = "bc-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "›";
    this.el.appendChild(sep);
  }

  private render(): void {
    const path = this.path;
    const focusLen = this.focusRoot.length;
    this.el.replaceChildren();
    // The phone keeps a folded path in one row and lets it wrap only once it is unfolded (styles.css).
    this.el.classList.toggle("is-expanded", this.expanded);
    const segments: Array<{ label: string; subPath: JsonPath }> = [
      { label: t("bc.root"), subPath: [] },
    ];
    path.forEach((seg, i) => {
      const subPath = path.slice(0, i + 1);
      const label = typeof seg === "number" ? `[${seg}]` : String(seg);
      segments.push({ label, subPath });
    });

    // A long path folds in the middle (root › … › last three); the "…" unfolds it.
    // `idx` stays the index in the full path, so the focus markers do not shift.
    const fold = !this.expanded && segments.length > MAX_UNFOLDED;
    segments.forEach((s, idx) => {
      if (fold && idx > 0 && idx < segments.length - KEEP_TAIL) {
        if (idx === 1) {
          this.appendSep();
          const more = makeEl("button");
          more.type = "button";
          more.className = "bc-seg bc-ellipsis";
          more.setAttribute("aria-label", t("breadcrumb.expand"));
          more.title = t("breadcrumb.expand");
          more.textContent = "…";
          more.addEventListener("click", () => {
            this.expanded = true;
            this.render();
          });
          this.el.appendChild(more);
        }
        return;
      }
      if (idx > 0) this.appendSep();
      // A real <button> so the segment is Tab-focusable and Enter/Space-operable
      // (WCAG 2.1.1) — matches every other interactive control in the plugin.
      const segEl = makeEl("button");
      segEl.type = "button";
      segEl.className = "bc-seg";
      if (idx === segments.length - 1) segEl.classList.add("bc-seg-terminal");
      if (idx === 0) segEl.classList.add("bc-seg-root");
      if (focusLen > 0 && idx < focusLen) segEl.classList.add("bc-seg-outside");
      if (focusLen > 0 && idx === focusLen) segEl.classList.add("bc-seg-focus-root");
      if (focusLen > 0 && idx === 0) segEl.setAttribute("aria-label", t("bc.wholeFile"));
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
      focusBtn.setAttribute("aria-label", t("row.showRoot"));
      focusBtn.title = t("row.showRoot");
      focusBtn.textContent = "⤢";
      focusBtn.addEventListener("click", () => this.opts.onFocusRequest?.(this.path));
      this.el.appendChild(focusBtn);
    }
  }
}
