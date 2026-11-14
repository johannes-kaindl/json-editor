/** An error of the editing core or the schema compiler that the UI can show in the user's language.
 *  `message` stays the English text (tests, logs, a plain `catch`); `code` names the case and `args` the
 *  values the text mentions, in the order the translations use them (`{0}`, `{1}`). Pure: no Obsidian import. */
export type CoreErrorCode =
  | "keyEmpty"
  | "keyExists"
  | "parentNotObject"
  | "parentNotArray"
  | "cannotDeleteRoot"
  | "cannotRenameRoot"
  | "cannotRenameIndex"
  | "indexOutOfBounds"
  | "keyNotFound"
  | "expectedIndexAt"
  | "expectedKeyAt"
  | "expectedIndexFor"
  | "expectedKeyFor"
  | "cannotDescend"
  | "cannotDeleteFrom"
  | "unsupportedType"
  | "numberTooLarge";

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly args: readonly string[];

  constructor(code: CoreErrorCode, message: string, args: readonly string[] = []) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.args = args;
  }
}
