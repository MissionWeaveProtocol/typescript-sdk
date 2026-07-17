import type { JsonObject, JsonValue } from "./json-types.js";

const textEncoder = new TextEncoder();

export function canonicalizeJson(value: JsonValue): string {
  return serialize(value, new Set<object>());
}

export function canonicalJsonBytes(value: JsonValue): Uint8Array {
  return textEncoder.encode(canonicalizeJson(value));
}

function serialize(value: JsonValue, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("JCS cannot encode a non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (ancestors.has(value))
    throw new TypeError("JCS cannot encode cyclic data");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const elements = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value))
          throw new TypeError("JCS cannot encode a sparse array");
        elements.push(serialize(value[index], ancestors));
      }
      return `[${elements.join(",")}]`;
    }

    const object = value as JsonObject;
    const members = Object.keys(object)
      .sort()
      .map((key) => {
        assertWellFormedUnicode(key);
        const member = object[key];
        if (member === undefined)
          throw new TypeError("JCS cannot encode undefined");
        return `${JSON.stringify(key)}:${serialize(member, ancestors)}`;
      });
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!Number.isInteger(low) || low < 0xdc00 || low > 0xdfff) {
        throw new TypeError("JCS cannot encode an unpaired high surrogate");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("JCS cannot encode an unpaired low surrogate");
    }
  }
}
