import type { Schema } from "@cfworker/json-schema";

/**
 * The canonical JSON Schema draft-07 meta-schema (from json-schema.org).
 *
 * We validate a user's companion schema against this before using it. ajv used
 * to reject a structurally-invalid schema (e.g. `{"type": 123}`) when compiling;
 * @cfworker/json-schema is a lenient interpreter that does NOT, so we restore
 * that "malformed schema -> error" contract with an explicit meta-validation
 * pass. Like ajv's `strict: false`, the meta-schema does not forbid unknown
 * keywords (no top-level `additionalProperties: false`), so non-standard
 * keywords are tolerated rather than rejected.
 */
export const DRAFT_07_META_SCHEMA: Schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "http://json-schema.org/draft-07/schema#",
  title: "Core schema meta-schema",
  definitions: {
    schemaArray: { type: "array", minItems: 1, items: { $ref: "#" } },
    nonNegativeInteger: { type: "integer", minimum: 0 },
    nonNegativeIntegerDefault0: {
      allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }],
    },
    simpleTypes: {
      enum: ["array", "boolean", "integer", "null", "number", "object", "string"],
    },
    stringArray: { type: "array", items: { type: "string" }, uniqueItems: true, default: [] },
  },
  type: ["object", "boolean"],
  properties: {
    // Identifier formats (uri / uri-reference) are intentionally relaxed to
    // plain `type: string`: @cfworker enforces `format`, and rejecting an
    // otherwise-usable schema outright over a cosmetic $id would disable ALL
    // validation for that file (ajv with strict:false tolerated a junk $id).
    $id: { type: "string" },
    $schema: { type: "string" },
    $ref: { type: "string" },
    $comment: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    default: true,
    readOnly: { type: "boolean", default: false },
    writeOnly: { type: "boolean", default: false },
    examples: { type: "array", items: true },
    multipleOf: { type: "number", exclusiveMinimum: 0 },
    maximum: { type: "number" },
    exclusiveMaximum: { type: "number" },
    minimum: { type: "number" },
    exclusiveMinimum: { type: "number" },
    maxLength: { $ref: "#/definitions/nonNegativeInteger" },
    minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
    pattern: { type: "string", format: "regex" },
    additionalItems: { $ref: "#" },
    items: {
      anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
      default: true,
    },
    maxItems: { $ref: "#/definitions/nonNegativeInteger" },
    minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
    uniqueItems: { type: "boolean", default: false },
    contains: { $ref: "#" },
    maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
    minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
    required: { $ref: "#/definitions/stringArray" },
    additionalProperties: { $ref: "#" },
    definitions: { type: "object", additionalProperties: { $ref: "#" }, default: {} },
    properties: { type: "object", additionalProperties: { $ref: "#" }, default: {} },
    patternProperties: {
      type: "object",
      additionalProperties: { $ref: "#" },
      propertyNames: { format: "regex" },
      default: {},
    },
    dependencies: {
      type: "object",
      additionalProperties: {
        anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }],
      },
    },
    propertyNames: { $ref: "#" },
    const: true,
    enum: { type: "array", items: true, minItems: 1, uniqueItems: true },
    type: {
      anyOf: [
        { $ref: "#/definitions/simpleTypes" },
        {
          type: "array",
          items: { $ref: "#/definitions/simpleTypes" },
          minItems: 1,
          uniqueItems: true,
        },
      ],
    },
    format: { type: "string" },
    contentMediaType: { type: "string" },
    contentEncoding: { type: "string" },
    if: { $ref: "#" },
    // biome-ignore lint/suspicious/noThenProperty: `then` is a JSON Schema draft-07 keyword, not a thenable
    then: { $ref: "#" },
    else: { $ref: "#" },
    allOf: { $ref: "#/definitions/schemaArray" },
    anyOf: { $ref: "#/definitions/schemaArray" },
    oneOf: { $ref: "#/definitions/schemaArray" },
    not: { $ref: "#" },
  },
  default: true,
};
