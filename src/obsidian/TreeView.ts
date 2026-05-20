import type { JsonValue, JsonPath, MarkerStyle } from "../core/types";
import { renderTree } from "../core/render";
import { editValue } from "../core/edit";

export interface TreeViewOptions {
  readonly?: boolean;
  markerStyle?: MarkerStyle;
  autoCollapseDepth?: number;
  onChange?: (newValue: JsonValue) => void;
}

export class TreeView {
  private current: JsonValue = null;
  constructor(private container: HTMLElement, private opts: TreeViewOptions) {}

  setValue(value: JsonValue): void {
    this.current = value;
    this.render();
  }

  getValue(): JsonValue {
    return this.current;
  }

  private render(): void {
    this.container.innerHTML = "";
    const el = renderTree(this.current, {
      readonly: this.opts.readonly,
      markerStyle: this.opts.markerStyle ?? "modern",
      autoCollapseDepth: this.opts.autoCollapseDepth,
      onValueClick: (path, value) => this.openEditor(path, value),
    });
    this.container.appendChild(el);
  }

  private openEditor(path: JsonPath, value: JsonValue): void {
    if (this.opts.readonly) return;
    if (value === null) return;
    const valueEl = this.findElementForPath(path);
    if (!valueEl) return;

    const finish = (newVal: JsonValue | undefined) => {
      if (newVal !== undefined) {
        const updated = editValue(this.current, path, newVal);
        this.current = updated;
        this.opts.onChange?.(updated);
      }
      this.render();
    };

    if (typeof value === "string") {
      replaceWithInput(valueEl, "text", value, (raw, committed) => {
        finish(committed ? raw : undefined);
      });
    } else if (typeof value === "number") {
      replaceWithInput(valueEl, "number", String(value), (raw, committed) => {
        if (!committed) return finish(undefined);
        const n = Number(raw);
        finish(Number.isFinite(n) ? n : undefined);
      });
    } else if (typeof value === "boolean") {
      replaceWithCheckbox(valueEl, value, (newVal, committed) => {
        finish(committed ? newVal : undefined);
      });
    }
  }

  private findElementForPath(path: JsonPath): HTMLElement | null {
    let current: HTMLElement | null = this.container.querySelector(".json-tree-root");
    if (!current) return null;
    for (const seg of path) {
      if (!current) return null;
      current = locateChildForSegment(current, seg);
    }
    if (!current) return null;
    const primitive = current.querySelector(
      ".json-string, .json-number, .json-boolean, .json-null"
    ) as HTMLElement | null;
    return primitive ?? current;
  }
}

function locateChildForSegment(parent: HTMLElement, segment: string | number): HTMLElement | null {
  // Find the nearest .json-content within parent and walk its direct children.
  // We avoid :scope selectors because happy-dom does not support :scope with
  // descendant combinators (":scope .foo") or child combinators (":scope > .foo").
  const content = parent.querySelector(".json-content");
  if (!content) return null;
  const rows = Array.from(content.children).filter(
    (el) => el.classList.contains("json-row")
  ) as HTMLElement[];
  if (typeof segment === "string") {
    for (const row of rows) {
      const key = row.querySelector(".json-key");
      if (key && key.textContent === `"${segment}"`) return row;
    }
    return null;
  }
  return rows[segment] ?? null;
}

function replaceWithInput(
  target: HTMLElement,
  type: "text" | "number",
  initial: string,
  onDone: (rawValue: string, committed: boolean) => void
): void {
  const input = document.createElement("input");
  input.type = type;
  input.value = initial;
  input.className = "json-inline-edit";
  target.replaceWith(input);
  input.focus();
  input.select();
  let resolved = false;
  const commit = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.value, true);
  };
  const cancel = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.value, false);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", () => commit());
}

function replaceWithCheckbox(
  target: HTMLElement,
  initial: boolean,
  onDone: (newValue: boolean, committed: boolean) => void
): void {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = initial;
  input.className = "json-inline-edit";
  target.replaceWith(input);
  input.focus();
  let resolved = false;
  const commit = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.checked, true);
  };
  const cancel = () => {
    if (resolved) return;
    resolved = true;
    onDone(input.checked, false);
  };
  input.addEventListener("change", () => commit());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", () => commit());
}
