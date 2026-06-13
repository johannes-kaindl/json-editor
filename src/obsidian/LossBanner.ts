/**
 * Warn banner shown when the open file contains number literals that JSON
 * cannot round-trip faithfully (blocker 1.4). Kept separate from the
 * parse-error banner (which is cleared on every successful parse) and styled
 * like SchemaBanner. Standard DOM only (textContent/hidden, no innerHTML).
 */
export class LossBanner {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "json-lossy-banner";
    this.el.hidden = true;
  }

  getElement(): HTMLDivElement {
    return this.el;
  }

  show(message: string): void {
    this.el.hidden = false;
    this.el.textContent = message;
  }

  hide(): void {
    this.el.hidden = true;
    this.el.textContent = "";
  }
}
