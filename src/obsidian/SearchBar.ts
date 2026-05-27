export interface SearchBarOptions {
  onQueryChange: (query: string) => void;
}

export class SearchBar {
  private el: HTMLDivElement;
  private input: HTMLInputElement;
  private clearBtn: HTMLButtonElement;
  private countEl: HTMLSpanElement;

  constructor(private opts: SearchBarOptions) {
    this.el = document.createElement("div");
    this.el.className = "json-search-bar";

    this.el.appendChild(this.makeIcon());

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "json-search-input";
    this.input.placeholder = "Search keys and values…";
    this.input.spellcheck = false;
    this.el.appendChild(this.input);

    this.countEl = document.createElement("span");
    this.countEl.className = "json-search-count";
    this.countEl.hidden = true;
    this.el.appendChild(this.countEl);

    this.clearBtn = document.createElement("button");
    this.clearBtn.className = "json-search-clear";
    this.clearBtn.type = "button";
    this.clearBtn.setAttribute("aria-label", "Clear search");
    this.clearBtn.textContent = "×";
    this.clearBtn.hidden = true;
    this.el.appendChild(this.clearBtn);

    this.wire();
  }

  getElement(): HTMLElement {
    return this.el;
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  clear(): void {
    this.input.value = "";
    this.clearBtn.hidden = true;
    this.countEl.hidden = true;
  }

  setMatchInfo(info: { matchCount: number } | null): void {
    if (info === null) {
      this.countEl.hidden = true;
      this.countEl.classList.remove("is-empty");
      return;
    }
    this.countEl.hidden = false;
    if (info.matchCount === 0) {
      this.countEl.textContent = "no matches";
      this.countEl.classList.add("is-empty");
    } else {
      const noun = info.matchCount === 1 ? "match" : "matches";
      this.countEl.textContent = `${info.matchCount} ${noun}`;
      this.countEl.classList.remove("is-empty");
    }
  }

  destroy(): void {
    this.el.remove();
  }

  private wire(): void {
    this.input.addEventListener("input", () => {
      const v = this.input.value;
      this.clearBtn.hidden = v.length === 0;
      this.opts.onQueryChange(v);
    });
    this.clearBtn.addEventListener("click", () => {
      this.input.value = "";
      this.clearBtn.hidden = true;
      this.countEl.hidden = true;
      this.countEl.classList.remove("is-empty");
      this.opts.onQueryChange("");
      this.input.focus();
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (this.input.value === "") {
          this.input.blur();
        } else {
          this.input.value = "";
          this.clearBtn.hidden = true;
          this.countEl.hidden = true;
          this.countEl.classList.remove("is-empty");
          this.opts.onQueryChange("");
        }
      }
    });
  }

  private makeIcon(): SVGElement {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "json-search-icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "7");
    circle.setAttribute("cy", "7");
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "currentColor");
    circle.setAttribute("stroke-width", "1.5");
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", "11");
    line.setAttribute("y1", "11");
    line.setAttribute("x2", "14");
    line.setAttribute("y2", "14");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(circle);
    svg.appendChild(line);
    return svg;
  }
}
