import { describe, expect, it } from "vitest";

import {
  parseStrictJson,
  parseStrictJsonObject,
  StrictJsonSyntaxError,
} from "../src/strict-json.js";

describe("strict JSON parsing", () => {
  it("parses a complete JSON document", () => {
    expect(parseStrictJson('{"items":[null,true,false,-0,1.5e2]}')).toEqual({
      items: [null, true, false, -0, 150],
    });
  });

  it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"outer":{"a":1,"a":2}}'])(
    "rejects duplicate members before ordinary JSON parsing: %s",
    (input) => {
      expect(() => parseStrictJson(input)).toThrow(/Duplicate object member/u);
    },
  );

  it.each([
    "01",
    "1.",
    "1e",
    "1e400",
    '"\\x20"',
    '"\\uD800"',
    '"\\uDC00"',
    '{"a":1} trailing',
  ])("rejects invalid or non-JCS JSON: %s", (input) => {
    expect(() => parseStrictJson(input)).toThrow(StrictJsonSyntaxError);
  });

  it("rejects a UTF-8 BOM and invalid UTF-8", () => {
    expect(() =>
      parseStrictJson(Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
    ).toThrow(/BOM/u);
    expect(() => parseStrictJson(Uint8Array.from([0xc3, 0x28]))).toThrow(
      /UTF-8/u,
    );
  });

  it("keeps __proto__ as data instead of mutating the object prototype", () => {
    const document = parseStrictJsonObject('{"__proto__":{"polluted":true}}');
    expect(Object.hasOwn(document, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(document)).toBe(Object.prototype);
  });
});
