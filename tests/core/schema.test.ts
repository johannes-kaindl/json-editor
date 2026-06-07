import { describe, expect, it } from "vitest";
import { compileSchema } from "../../src/core/schema";

const PERSON_SCHEMA = `{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer", "minimum": 0 }
  },
  "required": ["name"]
}`;

describe("compileSchema", () => {
  it("compiles a valid schema and returns a validate fn", () => {
    const result = compileSchema(PERSON_SCHEMA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.schema.validate).toBe("function");
  });

  it("returns error result for malformed JSON", () => {
    const result = compileSchema("{not json}");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/json|parse/i);
  });

  it("returns error result for invalid schema", () => {
    const result = compileSchema('{"type": 123}');
    expect(result.ok).toBe(false);
  });

  it("accepts a schema with $schema URL (strict: false)", () => {
    const text = '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object"}';
    const result = compileSchema(text);
    expect(result.ok).toBe(true);
  });
});

describe("compiled schema validate", () => {
  it("returns empty errors for a valid value", () => {
    const r = compileSchema(PERSON_SCHEMA);
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate({ name: "Jay", age: 35 });
    expect(errors).toEqual([]);
  });

  it("returns error with empty path for top-level missing required", () => {
    const r = compileSchema(PERSON_SCHEMA);
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate({ age: 30 });
    expect(errors.length).toBeGreaterThan(0);
    // The required-missing error attaches to the parent object (path [])
    expect(errors.some((e) => e.path.length === 0)).toBe(true);
  });

  it("returns error with nested path for wrong-type field", () => {
    const r = compileSchema(PERSON_SCHEMA);
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate({ name: "Jay", age: "old" });
    expect(errors.some((e) => e.path[0] === "age")).toBe(true);
  });

  it("converts instancePath to JsonPath segments (object keys)", () => {
    const r = compileSchema(
      '{"type":"object","properties":{"foo":{"type":"object","properties":{"bar":{"type":"number"}}}}}',
    );
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate({ foo: { bar: "no" } });
    expect(errors.length).toBe(1);
    expect(errors[0].path).toEqual(["foo", "bar"]);
  });

  it("converts instancePath to JsonPath segments (array indices)", () => {
    const r = compileSchema('{"type":"array","items":{"type":"number"}}');
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate([1, "two", 3]);
    expect(errors.length).toBe(1);
    expect(errors[0].path).toEqual([1]);
  });

  it("returns all errors with allErrors: true", () => {
    const r = compileSchema(
      '{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}}}',
    );
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate({ a: "x", b: "y" });
    expect(errors.length).toBe(2);
  });

  it("returns human-readable message", () => {
    const r = compileSchema('{"type":"number"}');
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate("not a number");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/number|type/i);
  });

  it("handles JSON pointer escape sequences", () => {
    const r = compileSchema(
      '{"type":"object","properties":{"a/b":{"type":"number"},"c~d":{"type":"number"}}}',
    );
    if (!r.ok) throw new Error("schema compile failed");
    const errors = r.schema.validate({ "a/b": "x", "c~d": "y" });
    expect(errors.length).toBe(2);
    const paths = errors.map((e) => e.path);
    expect(paths).toContainEqual(["a/b"]);
    expect(paths).toContainEqual(["c~d"]);
  });
});
