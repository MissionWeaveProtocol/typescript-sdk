import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import * as formatsNamespace from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";

import type { JsonObject, JsonValue } from "./json-types.js";
import { packageRoot } from "./package-root.js";
import { isProtocolRfc3339 } from "./rfc3339.js";
import { parseStrictJsonObject } from "./strict-json.js";

const addFormats = formatsNamespace.default as unknown as FormatsPlugin;
const ajvFullUriFormat: unknown = addFormats.get("uri", "full");
const nonRfc3986AsciiCharacter = /[^A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]/u;
const emptyHierPartUri =
  /^[A-Za-z][A-Za-z0-9+.-]*:(?:\?(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})*)?(?:#(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})*)?$/u;

export const schemaNames = [
  "agent-card.schema.json",
  "approval.schema.json",
  "artifact.schema.json",
  "command.schema.json",
  "common.schema.json",
  "context-package.schema.json",
  "conversation.schema.json",
  "error.schema.json",
  "event.schema.json",
  "evidence.schema.json",
  "extension-profile.schema.json",
  "group-snapshot.schema.json",
  "group.schema.json",
  "lease.schema.json",
  "membership.schema.json",
  "message.schema.json",
  "mission.schema.json",
  "presence-record.schema.json",
  "websocket-frame.schema.json",
  "work-contract.schema.json",
  "work-item.schema.json",
] as const;

export type SchemaName = (typeof schemaNames)[number];

export interface ValidationResult {
  readonly errors: readonly ErrorObject[];
  readonly valid: boolean;
}

export class SchemaValidationError extends Error {
  public readonly errors: readonly ErrorObject[];
  public readonly schemaName: SchemaName;

  public constructor(schemaName: SchemaName, errors: readonly ErrorObject[]) {
    super(
      `${schemaName} validation failed: ${errors
        .map(
          (error) =>
            `${error.instancePath || "/"} ${error.message ?? error.keyword}`,
        )
        .join("; ")}`,
    );
    this.name = "SchemaValidationError";
    this.schemaName = schemaName;
    this.errors = errors;
  }
}

export class SchemaCatalog {
  readonly #root: string;
  readonly #validators = new Map<SchemaName, ValidateFunction>();

  private constructor(root: string) {
    this.#root = root;
  }

  public static load(root = packageRoot()): SchemaCatalog {
    const catalog = new SchemaCatalog(root);
    catalog.#initialize();
    return catalog;
  }

  public get root(): string {
    return this.#root;
  }

  public get names(): readonly SchemaName[] {
    return schemaNames;
  }

  public validate(schemaName: SchemaName, value: JsonValue): ValidationResult {
    const validator = this.#validators.get(schemaName);
    if (!validator) throw new Error(`Unknown schema ${schemaName}`);
    const valid = validator(value) as boolean;
    return {
      errors: validator.errors ? structuredClone(validator.errors) : [],
      valid,
    };
  }

  public assertValid(schemaName: SchemaName, value: JsonValue): void {
    const result = this.validate(schemaName, value);
    if (!result.valid)
      throw new SchemaValidationError(schemaName, result.errors);
  }

  #initialize(): void {
    const schemaDirectory = path.join(this.#root, "schemas");
    const discovered = readdirSync(schemaDirectory)
      .filter((name) => name.endsWith(".json"))
      .sort();
    if (
      discovered.length !== schemaNames.length ||
      discovered.some((name, index) => name !== schemaNames[index])
    ) {
      throw new Error(
        `Expected the canonical ${schemaNames.length}-schema catalog, found ${discovered.length} files`,
      );
    }

    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      strictRequired: false,
      strictTypes: false,
      unicodeRegExp: true,
      validateFormats: true,
    });
    addFormats(ajv, { mode: "full" });
    ajv.addFormat("uri", {
      type: "string",
      validate: isRfc3986AbsoluteUri,
    });
    ajv.addFormat("date-time", {
      type: "string",
      validate: isProtocolRfc3339,
    });

    const documents = new Map<SchemaName, JsonObject>();
    for (const schemaName of schemaNames) {
      const document = parseStrictJsonObject(
        readFileSync(path.join(schemaDirectory, schemaName)),
      );
      const expectedId = `https://missionweaveprotocol.dev/schemas/0.1/${schemaName}`;
      if (document["$id"] !== expectedId) {
        throw new Error(`${schemaName} has an unexpected $id`);
      }
      documents.set(schemaName, document);
      ajv.addSchema(document, expectedId);
    }

    for (const [schemaName, document] of documents) {
      const identifier = document["$id"];
      if (typeof identifier !== "string")
        throw new Error(`${schemaName} has no $id`);
      const validator = ajv.getSchema(identifier);
      if (!validator) throw new Error(`Ajv did not compile ${schemaName}`);
      this.#validators.set(schemaName, validator);
    }
  }
}

function isRfc3986AbsoluteUri(value: string): boolean {
  if (nonRfc3986AsciiCharacter.test(value)) return false;
  return matchesFormat(ajvFullUriFormat, value) || emptyHierPartUri.test(value);
}

function matchesFormat(format: unknown, value: string): boolean {
  if (format instanceof RegExp) {
    format.lastIndex = 0;
    const matches = format.test(value);
    format.lastIndex = 0;
    return matches;
  }
  if (typeof format === "function") {
    return Boolean((format as (input: string) => boolean)(value));
  }
  if (typeof format === "object" && format !== null && "validate" in format) {
    return matchesFormat(
      (format as { readonly validate: unknown }).validate,
      value,
    );
  }
  throw new TypeError(
    "ajv-formats did not provide a synchronous URI validator",
  );
}
