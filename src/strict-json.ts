import type { JsonObject, JsonValue } from "./json-types.js";
import { isJsonObject } from "./json-types.js";

const MAX_DEPTH = 512;
const extremeJsonNumberBrand: unique symbol = Symbol("ExtremeJsonNumber");

export interface ExtremeJsonNumber {
  readonly [extremeJsonNumberBrand]: true;
  readonly negative: boolean;
  readonly raw: string;
}

export type VerificationJsonValue =
  | ExtremeJsonNumber
  | JsonValue
  | VerificationJsonObject
  | readonly VerificationJsonValue[];

export interface VerificationJsonObject {
  readonly [key: string]: VerificationJsonValue;
}

export class StrictJsonSyntaxError extends SyntaxError {
  public readonly offset: number;

  public constructor(message: string, offset: number) {
    super(`${message} at offset ${offset}`);
    this.name = "StrictJsonSyntaxError";
    this.offset = offset;
  }
}

export function parseStrictJson(input: string | Uint8Array): JsonValue {
  const text = decodeInput(input);
  return new Parser(text, "jcs").parse() as JsonValue;
}

export function parseStrictJsonObject(input: string | Uint8Array): JsonObject {
  const value = parseStrictJson(input);
  if (!isJsonObject(value)) {
    throw new StrictJsonSyntaxError("Expected a JSON object", 0);
  }
  return value;
}

export function parseStrictJsonForVerification(
  input: string | Uint8Array,
): VerificationJsonValue {
  return new Parser(decodeInput(input), "verification").parse();
}

export function parseStrictJsonObjectForVerification(
  input: string | Uint8Array,
): VerificationJsonObject {
  const value = parseStrictJsonForVerification(input);
  if (!isVerificationJsonObject(value)) {
    throw new StrictJsonSyntaxError("Expected a JSON object", 0);
  }
  return value;
}

export function isExtremeJsonNumber(
  value: VerificationJsonValue,
): value is ExtremeJsonNumber {
  return (
    typeof value === "object" &&
    value !== null &&
    extremeJsonNumberBrand in value
  );
}

class Parser {
  readonly #mode: "jcs" | "verification";
  readonly #text: string;
  #offset = 0;

  public constructor(text: string, mode: "jcs" | "verification") {
    this.#text = text;
    this.#mode = mode;
  }

  public parse(): VerificationJsonValue {
    this.#skipWhitespace();
    const value = this.#parseValue(0);
    this.#skipWhitespace();
    if (this.#offset !== this.#text.length) {
      this.#fail("Unexpected trailing content");
    }
    return value;
  }

  #parseValue(depth: number): VerificationJsonValue {
    if (depth > MAX_DEPTH) this.#fail("Maximum JSON nesting depth exceeded");
    const character = this.#text[this.#offset];
    switch (character) {
      case '"':
        return this.#parseString();
      case "[":
        return this.#parseArray(depth + 1);
      case "{":
        return this.#parseObject(depth + 1);
      case "f":
        return this.#parseLiteral("false", false);
      case "n":
        return this.#parseLiteral("null", null);
      case "t":
        return this.#parseLiteral("true", true);
      default:
        if (character === "-" || isDigit(character)) {
          return this.#parseNumber();
        }
        this.#fail("Expected a JSON value");
    }
  }

  #parseArray(depth: number): readonly VerificationJsonValue[] {
    this.#offset += 1;
    this.#skipWhitespace();
    const result: VerificationJsonValue[] = [];
    if (this.#consume("]")) return result;

    while (true) {
      result.push(this.#parseValue(depth));
      this.#skipWhitespace();
      if (this.#consume("]")) return result;
      this.#expect(",");
      this.#skipWhitespace();
    }
  }

  #parseObject(depth: number): VerificationJsonObject {
    this.#offset += 1;
    this.#skipWhitespace();
    const result: Record<string, VerificationJsonValue> = {};
    const keys = new Set<string>();
    if (this.#consume("}")) return result;

    while (true) {
      if (this.#text[this.#offset] !== '"') {
        this.#fail("Expected a quoted object member name");
      }
      const keyOffset = this.#offset;
      const key = this.#parseString();
      if (keys.has(key)) {
        throw new StrictJsonSyntaxError(
          `Duplicate object member ${JSON.stringify(key)}`,
          keyOffset,
        );
      }
      keys.add(key);
      this.#skipWhitespace();
      this.#expect(":");
      this.#skipWhitespace();
      const value = this.#parseValue(depth);
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.#skipWhitespace();
      if (this.#consume("}")) return result;
      this.#expect(",");
      this.#skipWhitespace();
    }
  }

  #parseString(): string {
    this.#offset += 1;
    let result = "";

    while (this.#offset < this.#text.length) {
      const character = this.#text[this.#offset];
      if (character === '"') {
        this.#offset += 1;
        return result;
      }
      if (character === "\\") {
        result += this.#parseEscape();
        continue;
      }

      const code = this.#text.charCodeAt(this.#offset);
      if (code < 0x20) this.#fail("Unescaped control character in string");
      if (isHighSurrogate(code)) {
        const low = this.#text.charCodeAt(this.#offset + 1);
        if (!isLowSurrogate(low)) {
          if (this.#mode === "jcs") this.#fail("Unpaired high surrogate");
          result += character;
          this.#offset += 1;
          continue;
        }
        result += character;
        result += this.#text[this.#offset + 1];
        this.#offset += 2;
        continue;
      }
      if (isLowSurrogate(code) && this.#mode === "jcs") {
        this.#fail("Unpaired low surrogate");
      }

      result += character;
      this.#offset += 1;
    }

    this.#fail("Unterminated string");
  }

  #parseEscape(): string {
    this.#offset += 1;
    const escape = this.#text[this.#offset];
    this.#offset += 1;
    switch (escape) {
      case '"':
      case "/":
      case "\\":
        return escape;
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "u":
        return this.#parseUnicodeEscape();
      default:
        this.#fail("Invalid string escape");
    }
  }

  #parseUnicodeEscape(): string {
    const first = this.#parseHexCodeUnit();
    if (isLowSurrogate(first)) {
      if (this.#mode === "jcs") this.#fail("Unpaired low surrogate escape");
      return String.fromCharCode(first);
    }
    if (!isHighSurrogate(first)) return String.fromCharCode(first);

    if (
      this.#text[this.#offset] !== "\\" ||
      this.#text[this.#offset + 1] !== "u"
    ) {
      if (this.#mode === "jcs") {
        this.#fail("High surrogate escape is not followed by a low surrogate");
      }
      return String.fromCharCode(first);
    }
    this.#offset += 2;
    const second = this.#parseHexCodeUnit();
    if (!isLowSurrogate(second)) {
      if (this.#mode === "jcs") {
        this.#fail("High surrogate escape is not followed by a low surrogate");
      }
      return String.fromCharCode(first, second);
    }
    return String.fromCodePoint(
      0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00),
    );
  }

  #parseHexCodeUnit(): number {
    const start = this.#offset;
    const value = this.#text.slice(start, start + 4);
    if (!/^[0-9A-Fa-f]{4}$/u.test(value)) {
      this.#fail("Invalid Unicode escape");
    }
    this.#offset += 4;
    return Number.parseInt(value, 16);
  }

  #parseNumber(): number | ExtremeJsonNumber {
    const start = this.#offset;
    this.#consume("-");

    if (this.#consume("0")) {
      if (isDigit(this.#text[this.#offset])) {
        this.#fail("Leading zero in number");
      }
    } else {
      if (!isNonZeroDigit(this.#text[this.#offset])) {
        this.#fail("Invalid number");
      }
      while (isDigit(this.#text[this.#offset])) this.#offset += 1;
    }

    if (this.#consume(".")) {
      if (!isDigit(this.#text[this.#offset])) {
        this.#fail("Fraction requires at least one digit");
      }
      while (isDigit(this.#text[this.#offset])) this.#offset += 1;
    }

    if (this.#text[this.#offset]?.toLowerCase() === "e") {
      this.#offset += 1;
      if (
        this.#text[this.#offset] === "+" ||
        this.#text[this.#offset] === "-"
      ) {
        this.#offset += 1;
      }
      if (!isDigit(this.#text[this.#offset])) {
        this.#fail("Exponent requires at least one digit");
      }
      while (isDigit(this.#text[this.#offset])) this.#offset += 1;
    }

    const raw = this.#text.slice(start, this.#offset);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      if (this.#mode === "verification") {
        return Object.freeze({
          [extremeJsonNumberBrand]: true as const,
          negative: raw.startsWith("-"),
          raw,
        });
      }
      throw new StrictJsonSyntaxError(
        "Number is not representable by the JCS number pipeline",
        start,
      );
    }
    return value;
  }

  #parseLiteral<T extends boolean | null>(literal: string, value: T): T {
    if (
      this.#text.slice(this.#offset, this.#offset + literal.length) !== literal
    ) {
      this.#fail(`Expected ${literal}`);
    }
    this.#offset += literal.length;
    return value;
  }

  #skipWhitespace(): void {
    while (isWhitespace(this.#text[this.#offset])) this.#offset += 1;
  }

  #expect(character: string): void {
    if (!this.#consume(character))
      this.#fail(`Expected ${JSON.stringify(character)}`);
  }

  #consume(character: string): boolean {
    if (this.#text[this.#offset] !== character) return false;
    this.#offset += 1;
    return true;
  }

  #fail(message: string): never {
    throw new StrictJsonSyntaxError(message, this.#offset);
  }
}

function decodeInput(input: string | Uint8Array): string {
  if (typeof input === "string") {
    if (input.charCodeAt(0) === 0xfeff) {
      throw new StrictJsonSyntaxError("UTF-8 BOM is not permitted", 0);
    }
    return input;
  }
  if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    throw new StrictJsonSyntaxError("UTF-8 BOM is not permitted", 0);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new StrictJsonSyntaxError("Input is not valid UTF-8", 0);
  }
}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r"
  );
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function isVerificationJsonObject(
  value: VerificationJsonValue,
): value is VerificationJsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isExtremeJsonNumber(value)
  );
}

function isNonZeroDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "1" && character <= "9";
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
