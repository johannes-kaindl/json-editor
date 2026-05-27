import type { JsonType } from "../core/edit";

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

  const menu = document.createElement("div");
  menu.className = "json-type-menu";
  menu.setAttribute("role", "menu");

  for (const t of TYPES) {
    const opt = document.createElement("button");
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

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeActiveMenu();
    }
  };
  const onMousedown = (e: MouseEvent) => {
    if (!(e.target instanceof Node)) return;
    if (menu.contains(e.target)) return;
    closeActiveMenu();
  };
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("mousedown", onMousedown);

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("mousedown", onMousedown);
    menu.remove();
    if (activeMenu?.el === menu) activeMenu = null;
  };

  activeMenu = { el: menu, close };
}

function closeActiveMenu(): void {
  if (activeMenu) activeMenu.close();
}
