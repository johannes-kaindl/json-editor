export interface RowActionsOptions {
  canRename: boolean;
  onRename: () => void;
  onDelete: () => void;
}

export function createRowActions(opts: RowActionsOptions): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "json-row-actions";

  if (opts.canRename) {
    const renameBtn = document.createElement("button");
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

  const delBtn = document.createElement("button");
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
