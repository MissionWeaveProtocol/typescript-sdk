import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { JsonObject } from "./json-types.js";
import { packageRoot } from "./package-root.js";
import {
  SchemaCatalog,
  schemaNames,
  type SchemaName,
} from "./schema-catalog.js";
import { parseStrictJson } from "./strict-json.js";

export interface ConformanceCaseResult {
  readonly actualValid: boolean;
  readonly expectedValid: boolean;
  readonly name: string;
  readonly passed: boolean;
  readonly schema: SchemaName;
}

export interface ConformanceReport {
  readonly cases: readonly ConformanceCaseResult[];
  readonly failed: number;
  readonly invalidCases: number;
  readonly passed: number;
  readonly total: number;
  readonly validCases: number;
}

export function runConformance(root = packageRoot()): ConformanceReport {
  const catalog = SchemaCatalog.load(root);
  const manifestPath = path.join(root, "conformance", "manifest.json");
  const manifest = parseStrictJson(readFileSync(manifestPath));
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Conformance manifest must be a non-empty array");
  }

  const names = new Set<string>();
  const instances = new Set<string>();
  const results = manifest.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(
        `Conformance manifest entry ${index + 1} is not an object`,
      );
    }
    const item = entry as JsonObject;
    const name = requireString(item, "name", index);
    if (names.has(name))
      throw new Error(`Duplicate conformance case name: ${name}`);
    names.add(name);

    if (typeof item["valid"] !== "boolean") {
      throw new Error(`Conformance case ${name} has a non-boolean valid field`);
    }
    const schemaPath = resolveRepositoryFile(root, item["schema"], "schemas");
    const instancePath = resolveRepositoryFile(
      root,
      item["instance"],
      path.join("conformance", "vectors"),
    );
    const relativeInstance = toLogicalPath(root, instancePath);
    if (instances.has(relativeInstance)) {
      throw new Error(
        `Conformance vector is listed more than once: ${relativeInstance}`,
      );
    }
    instances.add(relativeInstance);

    const schemaName = path.basename(schemaPath) as SchemaName;
    if (!schemaNames.includes(schemaName)) {
      throw new Error(
        `Manifest references a non-normative schema: ${schemaName}`,
      );
    }
    const instance = parseStrictJson(readFileSync(instancePath));
    const actualValid = catalog.validate(schemaName, instance).valid;
    return {
      actualValid,
      expectedValid: item["valid"],
      name,
      passed: actualValid === item["valid"],
      schema: schemaName,
    } satisfies ConformanceCaseResult;
  });

  const vectorRoot = path.join(root, "conformance", "vectors");
  const vectorFiles = collectJsonFiles(vectorRoot).map((file) =>
    toLogicalPath(root, file),
  );
  const unlisted = vectorFiles.filter((file) => !instances.has(file));
  if (unlisted.length > 0 || instances.size !== vectorFiles.length) {
    throw new Error(
      `Conformance vectors are not listed exactly once: ${unlisted.join(", ")}`,
    );
  }

  const passed = results.filter((result) => result.passed).length;
  return {
    cases: results,
    failed: results.length - passed,
    invalidCases: results.filter((result) => !result.expectedValid).length,
    passed,
    total: results.length,
    validCases: results.filter((result) => result.expectedValid).length,
  };
}

function requireString(item: JsonObject, field: string, index: number): string {
  const value = item[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Conformance manifest entry ${index + 1} has no ${field}`);
  }
  return value;
}

function resolveRepositoryFile(
  root: string,
  value: unknown,
  expectedParent: string,
): string {
  if (typeof value !== "string" || value === "" || path.isAbsolute(value)) {
    throw new Error(
      "Conformance manifest path must be a non-empty relative string",
    );
  }
  const parts = value.split(/[\\/]/u);
  if (parts.includes(".."))
    throw new Error(`Unsafe conformance manifest path: ${value}`);

  const resolved = path.resolve(root, value);
  const parent = path.resolve(root, expectedParent);
  if (resolved !== parent && !resolved.startsWith(`${parent}${path.sep}`)) {
    throw new Error(
      `Conformance manifest path escapes ${expectedParent}: ${value}`,
    );
  }
  if (!statSync(resolved).isFile())
    throw new Error(`Missing conformance file: ${value}`);
  return resolved;
}

function collectJsonFiles(directory: string): string[] {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectJsonFiles(candidate));
    else if (entry.isFile() && entry.name.endsWith(".json"))
      files.push(candidate);
  }
  return files;
}

function toLogicalPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}
