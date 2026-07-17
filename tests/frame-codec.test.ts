import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FrameCodec } from "../src/frame-codec.js";
import { packageRoot } from "../src/package-root.js";
import { SchemaValidationError } from "../src/schema-catalog.js";

describe("FrameCodec", () => {
  const root = packageRoot(import.meta.url);
  const codec = new FrameCodec();
  const validFrame = readFileSync(
    path.join(root, "conformance", "vectors", "valid", "websocket-frame.json"),
  );

  it("strictly decodes, validates, and canonically encodes a frame", () => {
    const decoded = codec.decode(validFrame);
    expect(codec.decode(codec.encode(decoded))).toEqual(decoded);
  });

  it("rejects duplicate members before schema validation", () => {
    expect(() => codec.decode('{"type":"PING","type":"PING"}')).toThrow(
      /Duplicate object member/u,
    );
  });

  it("rejects schema-invalid frames", () => {
    expect(() =>
      codec.decode(
        readFileSync(
          path.join(
            root,
            "conformance",
            "vectors",
            "invalid",
            "websocket-partial-stream.json",
          ),
        ),
      ),
    ).toThrow(SchemaValidationError);
  });
});
