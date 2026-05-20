import type { JsonPath } from "../core/types";

export interface BreadcrumbOptions {
  onSegmentClick?: (subPath: JsonPath) => void;
}

export class Breadcrumb {
  private el: HTMLElement;

  constructor(private opts: BreadcrumbOptions) {
    this.el = document.createElement("div");
    this.el.className = "json-breadcrumb";
    this.setPath([]);
  }

  getElement(): HTMLElement {
    return this.el;
  }

  setPath(path: JsonPath): void {
    this.el.innerHTML = "";
    const segments: Array<{ label: string; subPath: JsonPath }> = [
      { label: "root", subPath: [] },
    ];
    path.forEach((seg, i) => {
      const subPath = path.slice(0, i + 1);
      const label = typeof seg === "number" ? `[${seg}]` : String(seg);
      segments.push({ label, subPath });
    });

    segments.forEach((s, idx) => {
      if (idx > 0) {
        const sep = document.createElement("span");
        sep.className = "bc-sep";
        sep.textContent = "›";
        this.el.appendChild(sep);
      }
      const segEl = document.createElement("span");
      segEl.className = "bc-seg";
      if (idx === segments.length - 1) segEl.classList.add("bc-seg-terminal");
      if (idx === 0) segEl.classList.add("bc-seg-root");
      segEl.textContent = s.label;
      segEl.addEventListener("click", () => {
        this.opts.onSegmentClick?.(s.subPath);
      });
      this.el.appendChild(segEl);
    });
  }
}
