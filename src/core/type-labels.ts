import type { JsonType } from "./edit";

/** The six JSON types in menu order — shared by the type popover (`TypeMenu`) and the row menu (`RowMenu`). */
export const JSON_TYPES: readonly JsonType[] = ["string", "number", "boolean", "null", "object", "array"];

/** Display label per type, shared by both "change type" menus. */
export const TYPE_LABELS: Readonly<Record<JsonType, string>> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  null: "Null",
  object: "Object",
  array: "Array",
};
