import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { packageRoot } from "../src/package-root.js";
import { SchemaCatalog, schemaNames } from "../src/schema-catalog.js";
import { parseStrictJson } from "../src/strict-json.js";

describe("SchemaCatalog", () => {
  const root = packageRoot(import.meta.url);
  const catalog = SchemaCatalog.load(root);

  it("registers all 21 Draft 2020-12 schemas offline", () => {
    expect(catalog.names).toEqual(schemaNames);
    expect(catalog.names).toHaveLength(21);
  });

  it("validates a canonical vector", () => {
    const document = parseStrictJson(
      readFileSync(
        path.join(root, "conformance", "vectors", "valid", "error.json"),
      ),
    );
    expect(catalog.validate("error.schema.json", document)).toEqual({
      errors: [],
      valid: true,
    });
  });

  it("enforces date-time format assertions", () => {
    const document = {
      code: "INTERNAL_ERROR",
      message: "test",
      occurredAt: "not-a-date",
      retryable: false,
    };
    const result = catalog.validate("error.schema.json", document);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.keyword === "format")).toBe(
      true,
    );
  });
});
