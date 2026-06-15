import { activeDoc } from "./dom";
export interface AddAffordanceOptions {
  kind: "object" | "array";
  /** Called when user confirms add. For arrays, key is undefined. */
  onAdd: (key: string | undefined) => void;
  /** Called if user opens the inline input but cancels. */
  onCancel?: () => void;
}

export function createAddAffordance(opts: AddAffordanceOptions): HTMLElement {
  const wrap = activeDoc().createElement("div");
  wrap.className = "json-add-affordance";

  const trigger = activeDoc().createElement("button");
  trigger.className = "json-add-trigger";
  trigger.type = "button";
  trigger.textContent = opts.kind === "object" ? "+ Add key" : "+ Add item";
  trigger.title = opts.kind === "object" ? "Add a new key" : "Add a new item";
  wrap.appendChild(trigger);

  if (opts.kind === "array") {
    // Arrays don't need a key; click immediately appends a null item.
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onAdd(undefined);
    });
  } else {
    // Objects: click reveals an inline input for the key name.
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = activeDoc().createElement("input");
      input.type = "text";
      input.className = "json-add-input";
      input.placeholder = "Key";
      let resolved = false;
      const commit = () => {
        if (resolved) return;
        resolved = true;
        const key = input.value.trim();
        input.replaceWith(trigger);
        if (key === "") {
          opts.onCancel?.();
        } else {
          opts.onAdd(key);
        }
      };
      const cancel = () => {
        if (resolved) return;
        resolved = true;
        input.replaceWith(trigger);
        opts.onCancel?.();
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commit();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          cancel();
        }
      });
      input.addEventListener("blur", () => commit());
      trigger.replaceWith(input);
      input.focus();
    });
  }

  return wrap;
}
