import type { JsonValue, JsonPath, MarkerStyle } from "../core/types";
import { renderTree } from "../core/render";
import { editValue } from "../core/edit";
import { pathToString } from "../core/path";
import { createCopyButton } from "./CopyButton";

export interface TreeViewOptions {
  readonly?: boolean;
  markerStyle?: MarkerStyle;
  autoCollapseDepth?: number;
  onChange?: (newValue: JsonValue) => void;
  onPathClick?: (path: JsonPath) => void;
  onValueHover?: (target: HTMLElement, path: JsonPath, value: JsonValue) => void;
  onBeforeRender?: () => void;
}

const FLASH_MS = 600;

export class TreeView {
  private current: JsonValue = null;
  private editing = false;

  constructor(private container: HTMLElement, private opts: TreeViewOptions) {}

  setValue(value: JsonValue): void {
    this.current = value;
    this.render();
  }

  getValue(): JsonValue {
    return this.current;
  }

  scrollToPath(path: JsonPath): void {
    const selector = `.json-row[data-path="${cssEscapeAttr(pathToString(path))}"]`;
    const row = this.container.querySelector<HTMLElement>(selector);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("json-row-flash");
    setTimeout(() => row.classList.remove("json-row-flash"), FLASH_MS);
  }

  private render(): void {
    this.opts.onBeforeRender?.();
    this.container.innerHTML = "";
    const el = renderTree(this.current, {
      readonly: this.opts.readonly,
      markerStyle: this.opts.markerStyle ?? "modern",
      autoCollapseDepth: this.opts.autoCollapseDepth,
      onValueClick: (path, value) => this.openEditor(path, value),
      onPathClick: (path) => this.opts.onPathClick?.(path),
      onValueHover: (target, path, value) => {
        if (this.editing) return;
        this.opts.onValueHover?.(target, path, value);
      },
    });
    this.attachCopyButtons(el);
    this.container.appendChild(el);
  }

  private attachCopyButtons(treeRoot: HTMLElement): void {
    const rows = treeRoot.querySelectorAll<HTMLElement>(".json-row");
    rows.forEach((row) => {
      const pathStr = row.getAttribute("data-path");
      if (pathStr === null) return;
      const value = locateValueByPathStr(this.current, pathStr);
      const path = parsePathStr(pathStr);
      const btn = createCopyButton(value, path);
      row.appendChild(btn);
    });
  }

  private openEditor(path: JsonPath, value: JsonValue): void {
    if (this.opts.readonly) return;
    if (value === null) return;
    const valueEl = this.findElementForPath(path);
    if (!valueEl) return;

    this.editing = true;
    const finish = (newVal: JsonValue | undefined) => {
      this.editing = false;
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
  const content = parent.querySelector<HTMLElement>(".json-content");
  if (!content) return null;
  const rows = Array.from(content.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains("json-row")
  );
  if (typeof segment === "string") {
    for (const row of rows) {
      const key = row.querySelector(".json-key");
      if (key && key.textContent === `"${segment}"`) return row;
    }
    return null;
  }
  return rows[segment] ?? null;
}

function locateValueByPathStr(root: JsonValue, pathStr: string): JsonValue {
  const path = parsePathStr(pathStr);
  let current: JsonValue = root;
  for (const seg of path) {
    if (current === null) return null;
    if (Array.isArray(current) && typeof seg === "number") {
      current = current[seg];
    } else if (typeof current === "object" && typeof seg === "string") {
      current = (current as { [k: string]: JsonValue })[seg];
    } else {
      return null;
    }
  }
  return current;
}

function parsePathStr(pathStr: string): JsonPath {
  if (pathStr === "root") return [];
  const segments: JsonPath = [];
  let i = 0;
  let buf = "";
  const flushString = () => {
    if (buf.length > 0) {
      segments.push(buf);
      buf = "";
    }
  };
  while (i < pathStr.length) {
    const c = pathStr[i];
    if (c === ".") {
      flushString();
      i++;
    } else if (c === "[") {
      flushString();
      // Quoted-key form: ["..."]. Scan for the closing `"]` and respect
      // escaped quotes (\"). A bare `]` inside the key value would otherwise
      // be misread as the structural close and corrupt the segment.
      if (pathStr[i + 1] === '"') {
        let j = i + 2;
        let raw = "";
        while (j < pathStr.length) {
          if (pathStr[j] === "\\" && pathStr[j + 1] === '"') {
            raw += '"';
            j += 2;
          } else if (pathStr[j] === '"' && pathStr[j + 1] === "]") {
            break;
          } else {
            raw += pathStr[j];
            j++;
          }
        }
        segments.push(raw);
        i = j + 2; // skip `"]`
      } else {
        const close = pathStr.indexOf("]", i);
        const inner = pathStr.slice(i + 1, close);
        segments.push(parseInt(inner, 10));
        i = close + 1;
      }
    } else {
      buf += c;
      i++;
    }
  }
  flushString();
  return segments;
}

function cssEscapeAttr(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
