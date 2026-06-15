export class SchemaBanner {
  private el: HTMLDivElement;

  constructor() {
    this.el = activeDocument.createElement("div");
    this.el.className = "json-schema-banner";
    this.el.hidden = true;
  }

  getElement(): HTMLDivElement {
    return this.el;
  }

  setErrors(count: number): void {
    if (count <= 0) {
      this.el.hidden = true;
      this.el.textContent = "";
      this.el.classList.remove("is-schema-parse-error");
      return;
    }
    this.el.hidden = false;
    this.el.classList.remove("is-schema-parse-error");
    const noun = count === 1 ? "error" : "errors";
    this.el.textContent = `${count} schema ${noun} — hover the red rows for details.`;
  }

  setSchemaParseError(message: string): void {
    this.el.hidden = false;
    this.el.classList.add("is-schema-parse-error");
    this.el.textContent = `Schema not loaded — ${message}`;
  }

  hide(): void {
    this.el.hidden = true;
    this.el.textContent = "";
    this.el.classList.remove("is-schema-parse-error");
  }
}
