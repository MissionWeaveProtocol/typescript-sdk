import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { packageRoot } from "../src/package-root.js";
import { SchemaCatalog } from "../src/schema-catalog.js";
import { parseStrictJsonObject } from "../src/strict-json.js";

const root = packageRoot();
const catalog = SchemaCatalog.load(root);
const command = parseStrictJsonObject(
  readFileSync(
    path.join(root, "conformance", "vectors", "valid", "command.json"),
  ),
);

describe("MissionWeaveProtocol absolute URI format", () => {
  it.each([
    ["example:", true],
    ["example:?query", true],
    ["example:#fragment", true],
    ["example:?query#fragment", true],
    ["urn:missionweaveprotocol:action:one", true],
    ["https://agents.example/action", true],
    ["http://[2001:db8::1]/action", true],
    ["actions/relative", false],
    ["https://agents.example/action\n", false],
    ["https://例え.テスト/action", false],
    ["example:?invalid=%GG", false],
  ])("validates %j as %s", (actionId, expectedValid) => {
    const result = catalog.validate("command.schema.json", {
      ...command,
      actionId,
    });

    expect(result.valid).toBe(expectedValid);
  });
});
