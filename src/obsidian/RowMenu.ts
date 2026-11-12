import { Menu } from "obsidian";
import type { JsonType } from "../core/edit";
import { JSON_TYPES, typeLabel } from "../core/type-labels";
import type { JsonPath, JsonValue } from "../core/types";
import { t } from "../vendor/kit/i18n";

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
  /** Show this branch as the tree root. Offered for containers only. */
  onFocus?: () => void;
}

/** Build and show the consolidated row action menu. Returns the Menu (for tests). */
export function openRowMenu(evt: MouseEvent, opts: RowMenuOptions): Menu {
  const menu = new Menu();

  if (opts.validationError) {
    menu.addItem((i) => i.setTitle(`⚠ ${opts.validationError}`).setDisabled(true));
    menu.addSeparator();
  }

  menu.addItem((i) =>
    i
      .setTitle(t("row.copyValue"))
      .setIcon("copy")
      .onClick(() => opts.onCopyValue()),
  );
  menu.addItem((i) =>
    i
      .setTitle(t("row.copyPath"))
      .setIcon("route")
      .onClick(() => opts.onCopyPath()),
  );

  if (opts.onFocus && opts.value !== null && typeof opts.value === "object") {
    menu.addItem((i) =>
      i
        .setTitle(t("row.showRoot"))
        .setIcon("scan")
        .onClick(() => opts.onFocus?.()),
    );
  }

  if (!opts.readonly) {
    if (opts.canRename) {
      menu.addItem((i) =>
        i
          .setTitle(t("row.renameKey"))
          .setIcon("pencil")
          .onClick(() => opts.onRename()),
      );
    }
    menu.addItem((i) =>
      i
        .setTitle(t("row.changeType"))
        .setIcon("shapes")
        .onClick(() => openTypeChoiceMenu(evt, opts.currentType, opts.onChangeType)),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle(t("row.moveUp"))
        .setIcon("arrow-up")
        .setDisabled(!opts.moveUpEnabled)
        .onClick(() => opts.onMoveUp()),
    );
    menu.addItem((i) =>
      i
        .setTitle(t("row.moveDown"))
        .setIcon("arrow-down")
        .setDisabled(!opts.moveDownEnabled)
        .onClick(() => opts.onMoveDown()),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle(t("row.delete"))
        .setIcon("trash-2")
        .setWarning(true)
        .onClick(() => opts.onDelete()),
    );
  }

  menu.showAtMouseEvent(evt);
  return menu;
}

/**
 * Follow-up menu listing the six JSON types (current one disabled). Used instead
 * of a nested submenu — flatter and more reliable on touch, and avoids the
 * Menu.setSubmenu API which isn't in the pinned Obsidian typings.
 */
function openTypeChoiceMenu(
  evt: MouseEvent,
  current: JsonType,
  onPick: (t: JsonType) => void,
): Menu {
  const menu = new Menu();
  for (const t of JSON_TYPES) {
    menu.addItem((i) => {
      i.setTitle(typeLabel(t));
      if (t === current) i.setDisabled(true);
      else i.onClick(() => onPick(t));
    });
  }
  menu.showAtMouseEvent(evt);
  return menu;
}
