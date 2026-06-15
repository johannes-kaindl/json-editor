/**
 * Warn banner shown when a file is too large to render as a tree responsively
 * (audit 4.1). Carries a "Load tree anyway" button so the user can opt in.
 * Standard DOM only (textContent/hidden, no innerHTML).
 */
export class LargeFileBanner {
  private el: HTMLDivElement;
  private msgEl: HTMLSpanElement;

  constructor(onLoadAnyway: () => void) {
    this.el = document.createElement("div");
    this.el.className = "json-large-file-banner";
    this.el.hidden = true;

    this.msgEl = document.createElement("span");
    this.msgEl.className = "json-large-file-message";
    this.el.appendChild(this.msgEl);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "json-large-file-load";
    btn.textContent = "Load tree anyway";
    btn.title =
      "Render this large file as an interactive tree instead of plain text (may be slow to open).";
    btn.addEventListener("click", () => onLoadAnyway());
    this.el.appendChild(btn);
  }

  getElement(): HTMLDivElement {
    return this.el;
  }

  show(message: string): void {
    this.el.hidden = false;
    this.msgEl.textContent = message;
  }

  hide(): void {
    this.el.hidden = true;
    this.msgEl.textContent = "";
  }
}
