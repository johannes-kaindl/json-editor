import { Menu } from "obsidian";
import type { JsonType } from "../core/edit";
import type { JsonPath, JsonValue } from "../core/types";

const TYPES: JsonType[] = ["string", "number", "boolean", "null", "object", "array"];
const LABELS: Record<JsonType, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  null: "Null",
  object: "Object",
  array: "Array",
};

export interface RowMenuOptions {
  value: JsonValue;
  path: JsonPath;
  canRename: boolean;
  currentType: JsonType;
  readonly: boolean;
  validationError?: string;
  moveUpEnabled: boolean;
  moveDownEnabled: boolean;
  onCopyValue: () => void;
  onCopyPath: () => void;
  onRename: () => void;
  onChangeType: (t: JsonType) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

/** Build and show the consolidated row action menu. Returns the Menu (for tests). */
export function openRowMenu(evt: MouseEvent, opts: RowMenuOptions): Menu {
  const menu = new Menu();

  if (opts.validationError) {
    menu.addItem((i) => i.setTitle(`⚠ ${opts.validationError}`).setDisabled(true));
    menu.addSeparator();
  }

  menu.addItem((i) => i.setTitle("Copy value").setIcon("copy").onClick(() => opts.onCopyValue()));
  menu.addItem((i) => i.setTitle("Copy path").setIcon("route").onClick(() => opts.onCopyPath()));

  if (!opts.readonly) {
    if (opts.canRename) {
      menu.addItem((i) =>
        i.setTitle("Rename key").setIcon("pencil").onClick(() => opts.onRename()),
      );
    }
    menu.addItem((i) => {
      i.setTitle("Change type").setIcon("shapes");
      const sub = i.setSubmenu();
      for (const t of TYPES) {
        sub.addItem((si) => {
          si.setTitle(LABELS[t]);
          if (t === opts.currentType) {
            si.setDisabled(true);
          } else {
            si.onClick(() => opts.onChangeType(t));
          }
        });
      }
    });
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Move up")
        .setIcon("arrow-up")
        .setDisabled(!opts.moveUpEnabled)
        .onClick(() => opts.onMoveUp()),
    );
    menu.addItem((i) =>
      i
        .setTitle("Move down")
        .setIcon("arrow-down")
        .setDisabled(!opts.moveDownEnabled)
        .onClick(() => opts.onMoveDown()),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("Delete").setIcon("trash-2").setWarning(true).onClick(() => opts.onDelete()),
    );
  }

  menu.showAtMouseEvent(evt);
  return menu;
}
