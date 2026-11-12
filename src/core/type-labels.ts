import { t } from "../vendor/kit/i18n";
import type { JsonType } from "./edit";

/** The six JSON types in menu order — shared by the type popover (`TypeMenu`) and the row menu (`RowMenu`). */
export const JSON_TYPES: readonly JsonType[] = [
  "string",
  "number",
  "boolean",
  "null",
  "object",
  "array",
];

/** Display label per type (in the UI language), shared by both "change type" menus. */
export function typeLabel(type: JsonType): string {
  return t(`type.${type}`);
}
