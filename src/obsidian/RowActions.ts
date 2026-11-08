import { makeEl } from "./dom";
export interface RowActionsOptions {
  canRename: boolean;
  onRename: () => void;
  onDelete: () => void;
  onChangeType?: () => void;
  /** Container rows only: show this branch as the tree root. */
  onFocus?: () => void;
}

export function createRowActions(opts: RowActionsOptions): HTMLElement {
  const wrap = makeEl("span");
  wrap.className = "json-row-actions";

  if (opts.onFocus) {
    const focusBtn = makeEl("button");
    focusBtn.className = "json-row-action json-row-focus";
    focusBtn.type = "button";
    focusBtn.title = "Show as root";
    focusBtn.setAttribute("aria-label", "Show as root");
    focusBtn.textContent = "⤢";
    focusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onFocus?.();
    });
    wrap.appendChild(focusBtn);
  }

  if (opts.onChangeType) {
    const typeBtn = makeEl("button");
    typeBtn.className = "json-row-action json-row-type";
    typeBtn.type = "button";
    typeBtn.title = "Change type";
    typeBtn.setAttribute("aria-label", "Change type");
    typeBtn.textContent = "T";
    typeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onChangeType?.();
    });
    wrap.appendChild(typeBtn);
  }

  if (opts.canRename) {
    const renameBtn = makeEl("button");
    renameBtn.className = "json-row-action json-row-rename";
    renameBtn.type = "button";
    renameBtn.title = "Rename key";
    renameBtn.setAttribute("aria-label", "Rename key");
    renameBtn.textContent = "✎";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onRename();
    });
    wrap.appendChild(renameBtn);
  }

  const delBtn = makeEl("button");
  delBtn.className = "json-row-action json-row-delete";
  delBtn.type = "button";
  delBtn.title = "Delete row";
  delBtn.setAttribute("aria-label", "Delete row");
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onDelete();
  });
  wrap.appendChild(delBtn);

  return wrap;
}
