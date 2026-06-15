import type { JsonType } from "../core/edit";
import { activeDoc } from "./dom";

export interface TypeMenuOptions {
  currentType: JsonType;
  onPick: (newType: JsonType) => void;
}

const TYPES: JsonType[] = ["string", "number", "boolean", "null", "object", "array"];

const LABELS: Record<JsonType, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  null: "Null",
  object: "Object",
  array: "Array",
};

let activeMenu: { el: HTMLElement; close: () => void } | null = null;

export function openTypeMenu(anchor: HTMLElement, opts: TypeMenuOptions): void {
  closeActiveMenu();

  const menu = activeDoc().createElement("div");
  menu.className = "json-type-menu";
  menu.setAttribute("role", "menu");

  for (const t of TYPES) {
    const opt = activeDoc().createElement("button");
    opt.type = "button";
    opt.className = "json-type-option";
    opt.dataset.type = t;
    opt.textContent = LABELS[t];
    opt.setAttribute("role", "menuitem");
    if (t === opts.currentType) {
      opt.disabled = true;
      opt.classList.add("is-current");
    } else {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        closeActiveMenu();
        opts.onPick(t);
      });
    }
    menu.appendChild(opt);
  }

  // Position relative to anchor: append after the anchor's nearest .json-row
  // so the popover flows in document order without absolute positioning math.
  const row = anchor.closest<HTMLElement>(".json-row") ?? anchor;
  row.appendChild(menu);

  // Bind close handlers to the anchor's own document so Escape / click-outside
  // work in pop-out windows, not just the main window (audit 2.11).
  const doc = anchor.ownerDocument;
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeActiveMenu();
    }
  };
  const onPointerOutside = (e: Event) => {
    const t = e.target as Node | null;
    if (t && menu.contains(t)) return;
    closeActiveMenu();
  };
  doc.addEventListener("keydown", onKeydown);
  // Listen on both mousedown and pointerdown: pointerdown fires for touch input
  // (and touch-laptops) where mousedown may not, preventing a stuck-open menu.
  doc.addEventListener("mousedown", onPointerOutside);
  doc.addEventListener("pointerdown", onPointerOutside);

  const close = () => {
    doc.removeEventListener("keydown", onKeydown);
    doc.removeEventListener("mousedown", onPointerOutside);
    doc.removeEventListener("pointerdown", onPointerOutside);
    menu.remove();
    if (activeMenu?.el === menu) activeMenu = null;
  };

  activeMenu = { el: menu, close };
}

/** Close any open type menu (exported for view onunload cleanup, audit 2.12). */
export function closeActiveMenu(): void {
  if (activeMenu) activeMenu.close();
}
