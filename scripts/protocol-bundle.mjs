import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const EXPECTED_CRYPTOGRAPHY_PIN = Object.freeze({
  artifactCount: 94,
  artifactDigest:
    "sha256:487e18c1ea7053432953f28d1496ae4fdb8e9d42c2eeb8e94f9b21f8cc2596a2",
  caseCount: 22,
  evaluationCount: 58,
  manifestVersion: 1,
  path: "cryptography/manifest.json",
  profileId: "missionweaveprotocol.signed-document-verification.v0.1",
  sourceCommit: "235aee85ba88934641822e1639e08efd2c9e29b6",
});

const MAX_JSON_DEPTH = 512;

export async function collectJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(candidate)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(candidate);
    }
  }

  return files;
}

export async function treeDigest(root, files) {
  const digest = createHash("sha256");
  const ordered = [...files].sort((left, right) =>
    logicalPath(root, left).localeCompare(logicalPath(root, right)),
  );

  for (const file of ordered) {
    digest.update(logicalPath(root, file));
    digest.update(Buffer.from([0]));
    digest.update(await readFile(file));
    digest.update(Buffer.from([0]));
  }

  return digest.digest("hex");
}

export async function verifyProtocolBundle(root) {
  const pinPath = path.join(root, "PROTOCOL_PIN.json");
  const pin = JSON.parse(await readFile(pinPath, "utf8"));

  if (
    pin.repository !==
      "https://github.com/missionweaveprotocol/missionweaveprotocol" ||
    pin.commit !== "6f10987627d62fb296e3490ceceb5539b1e94b70" ||
    pin.protocolVersion !== "0.1" ||
    pin.wireNamespace !== "missionweaveprotocol"
  ) {
    throw new Error("PROTOCOL_PIN.json has unexpected protocol identity");
  }

  const allFiles = [];
  for (const name of ["schemas", "conformance"]) {
    const artifact = pin.artifacts?.[name];
    if (!artifact || artifact.path !== name) {
      throw new Error(`PROTOCOL_PIN.json has an invalid ${name} artifact`);
    }

    const directory = path.join(root, artifact.path);
    if (!(await stat(directory)).isDirectory()) {
      throw new Error(`${artifact.path} is not a directory`);
    }
    const files = await collectJsonFiles(directory);
    if (files.length !== artifact.files) {
      throw new Error(
        `${name} expected ${artifact.files} JSON files, found ${files.length}`,
      );
    }

    const actualDigest = await treeDigest(root, files);
    if (actualDigest !== artifact.sha256) {
      throw new Error(
        `${name} digest mismatch: expected ${artifact.sha256}, got ${actualDigest}`,
      );
    }
    allFiles.push(...files);
  }

  const bundleDigest = await treeDigest(root, allFiles);
  if (bundleDigest !== pin.bundleSha256) {
    throw new Error(
      `bundle digest mismatch: expected ${pin.bundleSha256}, got ${bundleDigest}`,
    );
  }

  return {
    bundleSha256: bundleDigest,
    conformanceFiles: pin.artifacts.conformance.files,
    protocolCommit: pin.commit,
    protocolVersion: pin.protocolVersion,
    schemaFiles: pin.artifacts.schemas.files,
  };
}

export async function verifyCryptographyBundle(root) {
  const pin = parseStrictJsonObject(
    await readFile(path.join(root, "PROTOCOL_PIN.json")),
  );
  const cryptographyPin = pin.cryptography;
  if (
    !isJsonObject(cryptographyPin) ||
    !recordsEqual(cryptographyPin, EXPECTED_CRYPTOGRAPHY_PIN)
  ) {
    throw new Error("PROTOCOL_PIN.json has an unexpected cryptography pin");
  }

  const manifestPath = path.join(root, ...cryptographyPin.path.split("/"));
  await assertRegularFileWithoutSymlinks(
    root,
    cryptographyPin.path,
    "cryptography manifest",
  );
  const manifest = parseStrictJsonObject(await readFile(manifestPath));

  if (
    manifest.$schema !==
      "https://missionweaveprotocol.dev/cryptography/0.1/manifest.schema.json" ||
    manifest.manifestVersion !== cryptographyPin.manifestVersion ||
    manifest.protocolVersion !== "0.1" ||
    manifest.profileId !== cryptographyPin.profileId ||
    manifest.artifactDigest !== cryptographyPin.artifactDigest
  ) {
    throw new Error("cryptography manifest has an unexpected identity");
  }

  if (!Array.isArray(manifest.artifacts)) {
    throw new Error("cryptography manifest artifacts must be an array");
  }
  if (manifest.artifacts.length !== cryptographyPin.artifactCount) {
    throw new Error(
      `cryptography manifest expected ${cryptographyPin.artifactCount} artifacts, found ${manifest.artifacts.length}`,
    );
  }

  if (!Array.isArray(manifest.cases)) {
    throw new Error("cryptography manifest cases must be an array");
  }
  if (manifest.cases.length !== cryptographyPin.caseCount) {
    throw new Error(
      `cryptography manifest expected ${cryptographyPin.caseCount} cases, found ${manifest.cases.length}`,
    );
  }

  let evaluationCount = 0;
  for (const [index, manifestCase] of manifest.cases.entries()) {
    if (
      !isJsonObject(manifestCase) ||
      !Array.isArray(manifestCase.evaluations)
    ) {
      throw new Error(
        `cryptography manifest case ${index} has invalid evaluations`,
      );
    }
    evaluationCount += manifestCase.evaluations.length;
  }
  if (evaluationCount !== cryptographyPin.evaluationCount) {
    throw new Error(
      `cryptography manifest expected ${cryptographyPin.evaluationCount} evaluations, found ${evaluationCount}`,
    );
  }

  const artifactPaths = new Set();
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (!isJsonObject(artifact)) {
      throw new Error(`cryptography artifact ${index} must be an object`);
    }
    const artifactPath = artifact.path;
    assertSafeArtifactPath(artifactPath);
    if (artifactPaths.has(artifactPath)) {
      throw new Error(`duplicate cryptography artifact path: ${artifactPath}`);
    }
    artifactPaths.add(artifactPath);

    if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 0) {
      throw new Error(`${artifactPath} has an invalid byteLength`);
    }
    if (
      typeof artifact.sha256 !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(artifact.sha256)
    ) {
      throw new Error(`${artifactPath} has an invalid SHA-256 digest`);
    }

    await assertRegularFileWithoutSymlinks(root, artifactPath, "artifact");
    const bytes = await readFile(path.join(root, ...artifactPath.split("/")));
    if (bytes.byteLength !== artifact.byteLength) {
      throw new Error(
        `${artifactPath} byte length mismatch: expected ${artifact.byteLength}, got ${bytes.byteLength}`,
      );
    }
    const actualDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (actualDigest !== artifact.sha256) {
      throw new Error(
        `${artifactPath} digest mismatch: expected ${artifact.sha256}, got ${actualDigest}`,
      );
    }
  }

  const digestInput = { ...manifest };
  delete digestInput.artifactDigest;
  const actualArtifactDigest = `sha256:${createHash("sha256")
    .update(canonicalizeJson(digestInput), "utf8")
    .digest("hex")}`;
  if (actualArtifactDigest !== cryptographyPin.artifactDigest) {
    throw new Error(
      `cryptography manifest digest mismatch: expected ${cryptographyPin.artifactDigest}, got ${actualArtifactDigest}`,
    );
  }

  return {
    artifactCount: manifest.artifacts.length,
    artifactDigest: actualArtifactDigest,
    caseCount: manifest.cases.length,
    evaluationCount,
    manifestVersion: manifest.manifestVersion,
    profileId: manifest.profileId,
    protocolVersion: manifest.protocolVersion,
    sourceCommit: cryptographyPin.sourceCommit,
  };
}

function logicalPath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function assertSafeArtifactPath(artifactPath) {
  if (
    typeof artifactPath !== "string" ||
    artifactPath.length === 0 ||
    artifactPath.includes("\\") ||
    artifactPath.includes("\0") ||
    path.posix.isAbsolute(artifactPath)
  ) {
    throw new Error(`unsafe cryptography artifact path: ${artifactPath}`);
  }

  const segments = artifactPath.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    ) ||
    path.posix.normalize(artifactPath) !== artifactPath ||
    !(
      artifactPath.startsWith("cryptography/") ||
      artifactPath.startsWith("schemas/")
    )
  ) {
    throw new Error(`unsafe cryptography artifact path: ${artifactPath}`);
  }

  if (artifactPath === "cryptography/README.md") {
    throw new Error("cryptography/README.md must not be a digest artifact");
  }
  if (artifactPath === "cryptography/manifest.json") {
    throw new Error("cryptography/manifest.json must not be a digest artifact");
  }
}

async function assertRegularFileWithoutSymlinks(root, logicalFile, label) {
  let current = root;
  const segments = logicalFile.split("/");

  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let fileStatus;
    try {
      fileStatus = await lstat(current);
    } catch {
      throw new Error(`${logicalFile} ${label} is missing`);
    }
    if (fileStatus.isSymbolicLink()) {
      throw new Error(`${logicalFile} ${label} must not use symlinks`);
    }
    const isLast = index === segments.length - 1;
    if (isLast ? !fileStatus.isFile() : !fileStatus.isDirectory()) {
      throw new Error(
        `${logicalFile} ${label} is not a regular file with directory parents`,
      );
    }
  }
}

function recordsEqual(actual, expected) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) =>
        key === expectedKeys[index] && Object.is(actual[key], expected[key]),
    )
  );
}

function canonicalizeJson(value) {
  return serializeCanonicalJson(value, new Set());
}

function serializeCanonicalJson(value, ancestors) {
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JCS cannot encode a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (ancestors.has(value)) {
    throw new TypeError("JCS cannot encode cyclic data");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((element) => serializeCanonicalJson(element, ancestors))
        .join(",")}]`;
    }

    const members = Object.keys(value)
      .sort()
      .map((key) => {
        assertWellFormedUnicode(key);
        return `${JSON.stringify(key)}:${serializeCanonicalJson(value[key], ancestors)}`;
      });
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertWellFormedUnicode(value) {
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

function parseStrictJsonObject(input) {
  const value = new StrictJsonParser(decodeStrictJson(input)).parse();
  if (!isJsonObject(value)) {
    throw new SyntaxError("Expected a JSON object at offset 0");
  }
  return value;
}

function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class StrictJsonParser {
  #offset = 0;
  #text;

  constructor(text) {
    this.#text = text;
  }

  parse() {
    this.#skipWhitespace();
    const value = this.#parseValue(0);
    this.#skipWhitespace();
    if (this.#offset !== this.#text.length) {
      this.#fail("Unexpected trailing content");
    }
    return value;
  }

  #parseValue(depth) {
    if (depth > MAX_JSON_DEPTH) {
      this.#fail("Maximum JSON nesting depth exceeded");
    }
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

  #parseArray(depth) {
    this.#offset += 1;
    this.#skipWhitespace();
    const result = [];
    if (this.#consume("]")) return result;

    while (true) {
      result.push(this.#parseValue(depth));
      this.#skipWhitespace();
      if (this.#consume("]")) return result;
      this.#expect(",");
      this.#skipWhitespace();
    }
  }

  #parseObject(depth) {
    this.#offset += 1;
    this.#skipWhitespace();
    const result = {};
    const keys = new Set();
    if (this.#consume("}")) return result;

    while (true) {
      if (this.#text[this.#offset] !== '"') {
        this.#fail("Expected a quoted object member name");
      }
      const keyOffset = this.#offset;
      const key = this.#parseString();
      if (keys.has(key)) {
        throw new SyntaxError(
          `Duplicate object member ${JSON.stringify(key)} at offset ${keyOffset}`,
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

  #parseString() {
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
        if (!isLowSurrogate(low)) this.#fail("Unpaired high surrogate");
        result += character;
        result += this.#text[this.#offset + 1];
        this.#offset += 2;
        continue;
      }
      if (isLowSurrogate(code)) this.#fail("Unpaired low surrogate");

      result += character;
      this.#offset += 1;
    }

    this.#fail("Unterminated string");
  }

  #parseEscape() {
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

  #parseUnicodeEscape() {
    const first = this.#parseHexCodeUnit();
    if (isLowSurrogate(first)) this.#fail("Unpaired low surrogate escape");
    if (!isHighSurrogate(first)) return String.fromCharCode(first);

    if (
      this.#text[this.#offset] !== "\\" ||
      this.#text[this.#offset + 1] !== "u"
    ) {
      this.#fail("High surrogate escape is not followed by a low surrogate");
    }
    this.#offset += 2;
    const second = this.#parseHexCodeUnit();
    if (!isLowSurrogate(second)) {
      this.#fail("High surrogate escape is not followed by a low surrogate");
    }
    return String.fromCodePoint(
      0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00),
    );
  }

  #parseHexCodeUnit() {
    const start = this.#offset;
    const value = this.#text.slice(start, start + 4);
    if (!/^[0-9A-Fa-f]{4}$/u.test(value)) {
      this.#fail("Invalid Unicode escape");
    }
    this.#offset += 4;
    return Number.parseInt(value, 16);
  }

  #parseNumber() {
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

    const value = Number(this.#text.slice(start, this.#offset));
    if (!Number.isFinite(value)) {
      throw new SyntaxError(
        `Number is not representable by the JCS number pipeline at offset ${start}`,
      );
    }
    return value;
  }

  #parseLiteral(literal, value) {
    if (
      this.#text.slice(this.#offset, this.#offset + literal.length) !== literal
    ) {
      this.#fail(`Expected ${literal}`);
    }
    this.#offset += literal.length;
    return value;
  }

  #skipWhitespace() {
    while (isJsonWhitespace(this.#text[this.#offset])) this.#offset += 1;
  }

  #expect(character) {
    if (!this.#consume(character)) {
      this.#fail(`Expected ${JSON.stringify(character)}`);
    }
  }

  #consume(character) {
    if (this.#text[this.#offset] !== character) return false;
    this.#offset += 1;
    return true;
  }

  #fail(message) {
    throw new SyntaxError(`${message} at offset ${this.#offset}`);
  }
}

function decodeStrictJson(input) {
  if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    throw new SyntaxError("UTF-8 BOM is not permitted at offset 0");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new SyntaxError("Input is not valid UTF-8 at offset 0");
  }
}

function isJsonWhitespace(character) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r"
  );
}

function isDigit(character) {
  return character !== undefined && character >= "0" && character <= "9";
}

function isNonZeroDigit(character) {
  return character !== undefined && character >= "1" && character <= "9";
}

function isHighSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}
