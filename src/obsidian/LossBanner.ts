import { makeEl } from "./dom";
/**
 * Warn banner shown when the open file contains number literals that JSON
 * cannot round-trip faithfully (blocker 1.4). Kept separate from the
 * parse-error banner (which is cleared on every successful parse) and styled
 * like SchemaBanner. Standard DOM only (textContent/hidden, no innerHTML).
 */
export class LossBanner {
  private el: HTMLDivElement;

  constructor() {
    this.el = makeEl("div");
    this.el.className = "json-lossy-banner";
    // Erscheint ohne Zutun des Nutzers (beim Oeffnen der Datei) — ohne Live-Region
    // erfaehrt ein Screenreader nie davon. `polite`, nicht `alert`: die Meldung ist
    // wichtig, aber sie muss nicht mitten in einen Satz hineinsprechen.
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-live", "polite");
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
