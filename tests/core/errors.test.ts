import { describe, expect, it } from "vitest";
import {
  addArrayItem,
  addObjectKey,
  deleteAt,
  moveArrayItem,
  moveObjectKey,
  renameKey,
} from "../../src/core/edit";
import { CoreError } from "../../src/core/errors";
import { compileSchema } from "../../src/core/schema";

function codeOf(fn: () => unknown): {
  code: string;
  args: readonly (string | number)[];
  message: string;
} {
  try {
    fn();
  } catch (e) {
    if (e instanceof CoreError) return { code: e.code, args: e.args, message: e.message };
    throw e;
  }
  throw new Error("did not throw");
}

describe("the core throws CoreError with a code, so the UI can translate", () => {
  const doc = { a: 1, list: [1, 2] };

  it("keeps the English message and adds a code and the values it names", () => {
    expect(codeOf(() => addObjectKey(doc, [], "", null))).toEqual({
      code: "keyEmpty",
      args: [],
      message: "Key cannot be empty",
    });
    expect(codeOf(() => addObjectKey(doc, [], "a", null))).toEqual({
      code: "keyExists",
      args: ["a"],
      message: 'Key "a" already exists',
    });
    expect(codeOf(() => renameKey(doc, ["a"], "list"))).toMatchObject({
      code: "keyExists",
      args: ["list"],
    });
  });

  it("names the structural mistakes", () => {
    expect(codeOf(() => addObjectKey(doc, ["list"], "k", null)).code).toBe("parentNotObject");
    expect(codeOf(() => addArrayItem(doc, ["a"], 1)).code).toBe("parentNotArray");
    expect(codeOf(() => deleteAt(doc, [])).code).toBe("cannotDeleteRoot");
    expect(codeOf(() => renameKey(doc, [], "x")).code).toBe("cannotRenameRoot");
    expect(codeOf(() => renameKey(doc, ["list", 0], "x")).code).toBe("cannotRenameIndex");
    expect(codeOf(() => moveArrayItem(doc, ["list"], 9, 0)).code).toBe("indexOutOfBounds");
    expect(codeOf(() => moveObjectKey(doc, [], "nope", 0)).code).toBe("keyNotFound");
  });

  it("carries the values of a path error", () => {
    expect(codeOf(() => deleteAt(doc, ["a", "x", "y"]))).toMatchObject({
      code: "cannotDescend",
      args: ["number", "x"],
    });
  });

  it("is still an Error whose name says what it is", () => {
    const e = new CoreError("keyEmpty", "Key cannot be empty");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CoreError");
  });
});

describe("the schema compiler reports a code next to its English text", () => {
  it("too large, not JSON, unsafe pattern, not draft-07", () => {
    const big = compileSchema(`{"description":"${"x".repeat(2_000_000)}"}`);
    expect(big).toMatchObject({
      ok: false,
      error: "Schema is too large",
      errorCode: "schemaTooLarge",
    });
    const bad = compileSchema("{ nope");
    expect(bad).toMatchObject({ ok: false, errorCode: "schemaNotJson" });
    expect(bad.ok === false && bad.errorArgs?.[0]).toBeTruthy();
    const unsafe = compileSchema('{"type":"string","pattern":"(a+)+$"}');
    expect(unsafe).toMatchObject({
      ok: false,
      errorCode: "schemaUnsafePattern",
      errorArgs: ["(a+)+$"],
    });
    expect(compileSchema('{"type":"nonsense"}')).toMatchObject({
      ok: false,
      errorCode: "schemaNotDraft07",
    });
  });
});
