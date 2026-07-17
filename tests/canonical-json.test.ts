import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { canonicalizeJson } from "../src/canonical-json.js";
import { parseStrictJson } from "../src/strict-json.js";

describe("RFC 8785 JSON Canonicalization Scheme", () => {
  it("matches the RFC 8785 primitive and property-order golden", () => {
    const input = readFileSync(
      fileURLToPath(
        new URL("fixtures/jcs/rfc8785-input.json", import.meta.url),
      ),
    );
    const expected = readFileSync(
      fileURLToPath(
        new URL("fixtures/jcs/rfc8785-output.json", import.meta.url),
      ),
      "utf8",
    ).trimEnd();
    expect(canonicalizeJson(parseStrictJson(input))).toBe(expected);
  });

  it("sorts property names by UTF-16 code units", () => {
    const value = {
      "\u20ac": "Euro Sign",
      "\r": "Carriage Return",
      "\ufb33": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "\ud83d\ude00": "Emoji: Grinning Face",
      "\u0080": "Control",
      "\u00f6": "Latin Small Letter O With Diaeresis",
    };
    const canonical = canonicalizeJson(value);
    const orderedValues = [
      "Carriage Return",
      "One",
      "Control",
      "Latin Small Letter O With Diaeresis",
      "Euro Sign",
      "Emoji: Grinning Face",
      "Hebrew Letter Dalet With Dagesh",
    ];
    expect(orderedValues.map((item) => canonical.indexOf(item))).toEqual(
      [...orderedValues.map((item) => canonical.indexOf(item))].sort(
        (left, right) => left - right,
      ),
    );
  });

  it("uses ECMAScript number serialization and rejects invalid values", () => {
    expect(canonicalizeJson(-0)).toBe("0");
    expect(() => canonicalizeJson(Number.POSITIVE_INFINITY)).toThrow(
      /non-finite/u,
    );
    expect(() => canonicalizeJson("\ud800")).toThrow(/surrogate/u);
  });
});
