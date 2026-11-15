import type { SchemaCompileResult } from "../core/schema";
import { codedErrorText } from "../vendor/kit/coded-error";
import { t } from "../vendor/kit/i18n";

/** The text of an error for the user's language. A coded error (the `CoreError` of the core, recognised by its `code` and `args`) is
 *  translated from its code; when no translation exists its English `message` stands, never the raw key. Any other error (a library,
 *  the platform) keeps the message it came with. */
export function errorText(e: unknown): string {
  return codedErrorText(e, t, "err.");
}

/** The banner text for a schema that did not compile: the compiler's own findings are translated, the
 *  validator library's text (no code) stays as the library wrote it. */
export function schemaErrorText(result: Extract<SchemaCompileResult, { ok: false }>): string {
  return result.errorCode
    ? t(`err.${result.errorCode}`, ...(result.errorArgs ?? []))
    : result.error;
}
