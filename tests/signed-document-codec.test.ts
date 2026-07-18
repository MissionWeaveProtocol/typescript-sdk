import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalJsonBytes,
  decodeBase64Url,
  packageRoot,
  parseStrictJsonObject,
  parseStrictJson,
  sha256Identifier,
  signBytes,
  SignedDocumentCodec,
  SignedDocumentKind,
  SignedDocumentVerificationError,
  type JsonObject,
  type JsonValue,
  type KeyRegistrySnapshot,
  type KeyResolver,
  type SigningKey,
} from "../src/index.js";

const root = packageRoot(import.meta.url);
const keyResolutionEvaluations = loadSignedEvaluations().filter(
  (evaluation) => evaluation.stage === "key-resolution",
);
const completeEvaluations = loadSignedEvaluations().filter(
  (evaluation) => evaluation.stage === "complete",
);
const parseEvaluations = loadSignedEvaluations().filter(
  (evaluation) => evaluation.stage === "parse",
);
const signatureEvaluations = loadSignedEvaluations().filter(
  (evaluation) => evaluation.stage === "signature",
);

describe("SignedDocumentCodec", () => {
  it("covers the complete 22-case / 58-evaluation bundle contract", () => {
    const manifest = readJson("cryptography/manifest.json");
    const histogram = Object.fromEntries(
      [
        "parse",
        "schema",
        "signature-envelope",
        "key-resolution",
        "canonicalization",
        "signature",
        "complete",
      ].map((stage) => [
        stage,
        loadSignedEvaluations().filter(
          (evaluation) => evaluation.stage === stage,
        ).length,
      ]),
    );
    expect(asArray(manifest["cases"])).toHaveLength(22);
    expect(loadSignedEvaluations()).toHaveLength(57);
    expect(histogram).toEqual({
      canonicalization: 2,
      complete: 11,
      "key-resolution": 20,
      parse: 4,
      schema: 5,
      signature: 4,
      "signature-envelope": 11,
    });
  });

  it("runs the standalone RFC 8785 bundle evaluation", () => {
    const input = parseStrictJson(
      readFileSync(
        path.join(
          root,
          "cryptography/vectors/canonicalization/rfc8785-section-3.2.2-input.json",
        ),
      ),
    );
    const actual = canonicalJsonBytes(input);
    expect(actual).toEqual(
      new Uint8Array(
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/canonicalization/rfc8785-section-3.2.2.jcs",
          ),
        ),
      ),
    );
    expect(sha256Identifier(actual)).toBe(
      "sha256:2d5e01a318d0f0879ab568c4be289c8b1f64ef8921a53c6277d5e069978baacb",
    );
  });

  it("signs the golden Command through the SigningKey boundary", () => {
    const expected = readJson(
      "cryptography/vectors/signed-documents/valid/command.json",
    );
    const signingFixture = readJson(
      "cryptography/keys/signing-coordinator.json",
    );
    const unsigned = withoutTopLevelSignature(expected);
    const privateKey = createPrivateKey({
      format: "der",
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        decodeBase64Url(asString(signingFixture["seed"])),
      ]),
      type: "pkcs8",
    });
    const signingKey: SigningKey = {
      algorithm: "Ed25519",
      keyId: asString(signingFixture["keyId"]),
      sign(bytes) {
        return signBytes(bytes, privateKey);
      },
    };

    const actual = new SignedDocumentCodec().sign(
      SignedDocumentKind.Command,
      unsigned,
      signingKey,
    );

    expect(actual).toEqual(expected);
  });

  it.each([
    {
      label: "Date",
      mutate(document: Record<string, unknown>) {
        document["hostValue"] = new Date("2026-07-15T00:00:00Z");
      },
    },
    {
      label: "BigInt",
      mutate(document: Record<string, unknown>) {
        document["hostValue"] = 1n;
      },
    },
    {
      label: "undefined",
      mutate(document: Record<string, unknown>) {
        document["hostValue"] = undefined;
      },
    },
    {
      label: "sparse array",
      mutate(document: Record<string, unknown>) {
        document["hostValue"] = new Array(1);
      },
    },
    {
      label: "cyclic object",
      mutate(document: Record<string, unknown>) {
        const cyclic: Record<string, unknown> = {};
        cyclic["self"] = cyclic;
        document["hostValue"] = cyclic;
      },
    },
    {
      label: "accessor",
      mutate(document: Record<string, unknown>) {
        Object.defineProperty(document, "hostValue", {
          enumerable: true,
          get() {
            return "coerced";
          },
        });
      },
    },
  ])("rejects non-JSON host data without coercion: $label", ({ mutate }) => {
    const unsigned = withoutTopLevelSignature(
      readJson("cryptography/vectors/signed-documents/valid/command.json"),
    ) as unknown as Record<string, unknown>;
    mutate(unsigned);

    expect(() =>
      new SignedDocumentCodec().sign(
        SignedDocumentKind.Command,
        unsigned as unknown as JsonObject,
        fixtureSigningKey("cryptography/keys/signing-coordinator.json"),
      ),
    ).toThrow(TypeError);
  });

  it("signs finite binary64 values above the safe-integer range", () => {
    const unsigned = withoutTopLevelSignature(
      readJson("cryptography/vectors/signed-documents/valid/command.json"),
    ) as Record<string, JsonValue>;
    const payload = { ...(unsigned["payload"] as JsonObject) };
    payload["largeBinary64"] = 9_007_199_254_740_992;
    unsigned["payload"] = payload;

    const signed = new SignedDocumentCodec().sign(
      SignedDocumentKind.Command,
      unsigned,
      fixtureSigningKey("cryptography/keys/signing-coordinator.json"),
    );
    const verified = new SignedDocumentCodec().verify(
      SignedDocumentKind.Command,
      Buffer.from(JSON.stringify(signed)),
      fixtureResolver("cryptography/keys/registry-valid.json"),
    );

    expect(verified.document["payload"]).toMatchObject({
      largeBinary64: 9_007_199_254_740_992,
    });
  });

  it("rejects a pre-existing top-level signature when signing", () => {
    const alreadySigned = readJson(
      "cryptography/vectors/signed-documents/valid/command.json",
    );
    expect(() =>
      new SignedDocumentCodec().sign(
        SignedDocumentKind.Command,
        alreadySigned,
        fixtureSigningKey("cryptography/keys/signing-coordinator.json"),
      ),
    ).toThrow(/already has a top-level signature/u);
  });

  it("verifies the golden Command through all six semantic stages", () => {
    const documentPath =
      "cryptography/vectors/signed-documents/valid/command.json";
    const rawDocument = readFileSync(path.join(root, documentPath));
    const registry = readJson("cryptography/keys/registry-valid.json");
    const resolver: KeyResolver = {
      resolve() {
        return {
          completeness: "organization-wide",
          ...registry,
        } as KeyRegistrySnapshot;
      },
    };

    const verified = new SignedDocumentCodec().verify(
      SignedDocumentKind.Command,
      rawDocument,
      resolver,
    );

    expect(verified.document).toEqual(parseStrictJsonObject(rawDocument));
    expect(verified.receivedBytes).toEqual(new Uint8Array(rawDocument));
    expect(verified.signingBytes).toEqual(
      new Uint8Array(
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/canonicalization/command.signing.jcs",
          ),
        ),
      ),
    );
    expect(verified.signingHash).toBe(
      "sha256:6655c5d67ae3ecc19a4ed04bda7f1372aeaafc7adf939a77715de96ef2100695",
    );
    expect(verified.signedDocumentHash).toBe(
      "sha256:1d17d0bd5379e554d48d14a6b328671f12860c6c3278bc1e7ca4e1163a74353f",
    );
    expect(verified.protectedTime).toEqual({
      instant: { epochSecond: 1_784_073_600n, fraction: "" },
      text: "2026-07-15T00:00:00Z",
    });
    expect(verified.signature.keyId).toBe(
      "urn:missionweaveprotocol:key:crypto-vector-rfc8032-1",
    );
    expect(verified.resolvedKey.principal).toEqual({
      type: "agent",
      id: "urn:missionweaveprotocol:agent:crypto-vector-coordinator",
    });
  });

  it("returns immutable evidence and defensive byte copies", () => {
    const rawDocument = readFileSync(
      path.join(
        root,
        "cryptography/vectors/signed-documents/valid/command.json",
      ),
    );
    const verified = new SignedDocumentCodec().verify(
      SignedDocumentKind.Command,
      rawDocument,
      fixtureResolver("cryptography/keys/registry-valid.json"),
    );

    expect(Object.isFrozen(verified.document)).toBe(true);
    expect(Object.isFrozen(verified.document["payload"])).toBe(true);
    const received = verified.receivedBytes;
    const publicKey = verified.resolvedPublicKeyBytes;
    const signing = verified.signingBytes;
    received[0] = 0;
    publicKey[0] = 0;
    signing[0] = 0;
    expect(verified.receivedBytes[0]).toBe(0x7b);
    expect(verified.resolvedPublicKeyBytes[0]).not.toBe(0);
    expect(verified.signingBytes[0]).toBe(0x7b);
  });

  it("keeps authentication wire errors non-oracular", () => {
    const failures = [
      {
        document: "command-created-at-mismatch.json",
        stage: "signature-envelope",
      },
      { document: "command-unknown-key.json", stage: "key-resolution" },
      { document: "command-payload-tamper.json", stage: "signature" },
    ].map(({ document, stage }) => {
      try {
        new SignedDocumentCodec().verify(
          SignedDocumentKind.Command,
          readFileSync(
            path.join(
              root,
              "cryptography/vectors/signed-documents/invalid",
              document,
            ),
          ),
          fixtureResolver("cryptography/keys/registry-valid.json"),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(SignedDocumentVerificationError);
        return { error: error as SignedDocumentVerificationError, stage };
      }
      throw new Error("Expected Signed Document verification to fail");
    });

    expect(failures.map(({ error }) => error.wireCode)).toEqual([
      "AUTH_INVALID_SIGNATURE",
      "AUTH_INVALID_SIGNATURE",
      "AUTH_INVALID_SIGNATURE",
    ]);
    expect(new Set(failures.map(({ error }) => error.message)).size).toBe(1);
    expect(
      failures.map(({ error }) => JSON.stringify(error)),
    ).not.toContainEqual(expect.stringContaining("signature-envelope"));
    expect(
      failures.map(({ error }) => JSON.stringify(error)),
    ).not.toContainEqual(expect.stringContaining("key-resolution"));
    expect(failures.map(({ error }) => error.auditDetail.stage)).toEqual(
      failures.map(({ stage }) => stage),
    );
  });

  it("uses the caller-selected kind without inferring another profile", () => {
    const verify = () =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Approval,
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/signed-documents/valid/command.json",
          ),
        ),
        fixtureResolver("cryptography/keys/registry-valid.json"),
      );

    expect(verify).toThrow(SignedDocumentVerificationError);
    try {
      verify();
    } catch (error) {
      expect(error).toMatchObject({ auditDetail: { stage: "schema" } });
    }
  });

  it("accepts only received UTF-8 bytes for verification", () => {
    const text = readFileSync(
      path.join(
        root,
        "cryptography/vectors/signed-documents/valid/command.json",
      ),
      "utf8",
    );
    expect(() =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Command,
        text as unknown as Uint8Array,
        fixtureResolver("cryptography/keys/registry-valid.json"),
      ),
    ).toThrow(TypeError);
  });

  it("fails closed on unknown runtime fields from KeyResolver", () => {
    const registry = structuredClone(
      readJson("cryptography/keys/registry-valid.json"),
    ) as unknown as {
      bindings: Array<Record<string, unknown>>;
      organizationId: string;
    };
    const firstBinding = registry.bindings[0];
    if (!firstBinding) throw new TypeError("Expected a Registry binding");
    firstBinding["unexpected"] = true;
    const resolver: KeyResolver = {
      resolve() {
        return {
          completeness: "organization-wide",
          ...registry,
        } as unknown as KeyRegistrySnapshot;
      },
    };
    const verify = () =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Command,
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/signed-documents/valid/command.json",
          ),
        ),
        resolver,
      );

    expect(verify).toThrow(SignedDocumentVerificationError);
    try {
      verify();
    } catch (error) {
      expect(error).toMatchObject({
        auditDetail: { stage: "key-resolution" },
      });
    }
  });

  it("does not treat a malformed validity boundary as absent", () => {
    const registry = structuredClone(
      readJson("cryptography/keys/registry-valid.json"),
    ) as unknown as {
      bindings: Array<{
        validityHistory: Array<Record<string, unknown>>;
      }>;
      organizationId: string;
    };
    const status = registry.bindings[0]?.validityHistory[0];
    if (!status) throw new TypeError("Expected a validity status");
    status["validUntil"] = null;
    const resolver: KeyResolver = {
      resolve() {
        return {
          completeness: "organization-wide",
          ...registry,
        } as unknown as KeyRegistrySnapshot;
      },
    };
    const verify = () =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Command,
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/signed-documents/valid/command.json",
          ),
        ),
        resolver,
      );

    expect(verify).toThrow(SignedDocumentVerificationError);
    try {
      verify();
    } catch (error) {
      expect(error).toMatchObject({
        auditDetail: { stage: "key-resolution" },
      });
    }
  });

  it("rejects incomplete validity history on an unselected Registry binding", () => {
    const registry = structuredClone(
      readJson("cryptography/keys/registry-valid.json"),
    ) as unknown as {
      bindings: Array<{
        validityHistory: Array<Record<string, unknown>>;
      }>;
      organizationId: string;
    };
    const unselected = registry.bindings[1];
    if (!unselected) throw new TypeError("Expected an unselected binding");
    unselected.validityHistory = [
      { recordedAt: "2026-07-01T00:00:00Z", sequence: 2 },
    ];
    const resolver: KeyResolver = {
      resolve() {
        return {
          completeness: "organization-wide",
          ...registry,
        } as unknown as KeyRegistrySnapshot;
      },
    };
    const verify = () =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Command,
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/signed-documents/valid/command.json",
          ),
        ),
        resolver,
      );

    expect(verify).toThrow(SignedDocumentVerificationError);
    try {
      verify();
    } catch (error) {
      expect(error).toMatchObject({
        auditDetail: { stage: "key-resolution" },
      });
    }
  });

  it("classifies non-JCS signature metadata at stage 5", () => {
    const document = structuredClone(
      readJson("cryptography/vectors/signed-documents/valid/command.json"),
    ) as Record<string, unknown>;
    const signature = document["signature"] as Record<string, unknown>;
    const nonJcsKeyId = "urn:missionweaveprotocol:key:\ud800";
    signature["keyId"] = nonJcsKeyId;

    const registry = structuredClone(
      readJson("cryptography/keys/registry-valid.json"),
    ) as unknown as {
      bindings: Array<Record<string, unknown>>;
      organizationId: string;
    };
    const firstBinding = registry.bindings[0];
    if (!firstBinding) throw new TypeError("Expected a Registry binding");
    firstBinding["keyId"] = nonJcsKeyId;
    const resolver: KeyResolver = {
      resolve() {
        return {
          completeness: "organization-wide",
          ...registry,
        } as unknown as KeyRegistrySnapshot;
      },
    };
    const verify = () =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Command,
        Buffer.from(JSON.stringify(document)),
        resolver,
      );

    expect(verify).toThrow(SignedDocumentVerificationError);
    try {
      verify();
    } catch (error) {
      expect(error).toMatchObject({
        auditDetail: { stage: "canonicalization" },
        wireCode: "PROTOCOL_VIOLATION",
      });
    }
  });

  it.each(["command-number-1e400.json", "command-unpaired-surrogate.json"])(
    "classifies JCS data-model rejection at stage 5: %s",
    (fileName) => {
      const verify = () =>
        new SignedDocumentCodec().verify(
          SignedDocumentKind.Command,
          readFileSync(
            path.join(
              root,
              "cryptography/vectors/signed-documents/invalid",
              fileName,
            ),
          ),
          fixtureResolver("cryptography/keys/registry-valid.json"),
        );

      expect(verify).toThrow(SignedDocumentVerificationError);
      try {
        verify();
      } catch (error) {
        expect(error).toMatchObject({
          auditDetail: { stage: "canonicalization" },
          wireCode: "PROTOCOL_VIOLATION",
        });
      }
    },
  );

  it.each([
    "command-padded-signature.json",
    "command-leap-second.json",
    "command-unknown-local-offset.json",
    "command-year-zero.json",
    "command-unsupported-algorithm.json",
  ])("stops at normative schema validation: %s", (fileName) => {
    const verify = () =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Command,
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/signed-documents/invalid",
            fileName,
          ),
        ),
        fixtureResolver("cryptography/keys/registry-valid.json"),
      );

    expect(verify).toThrow(SignedDocumentVerificationError);
    try {
      verify();
    } catch (error) {
      expect(error).toMatchObject({
        auditDetail: { stage: "schema" },
        wireCode: "SCHEMA_VALIDATION_FAILED",
      });
    }
  });

  it.each([
    "command-created-at-mismatch.json",
    "command-signature-r-mixed-order.json",
    "command-signature-r-negative-zero.json",
    "command-signature-r-noncanonical.json",
    "command-signature-r-off-curve.json",
    "command-signature-r-small-order.json",
    "command-signature-r-y-equals-p.json",
    "command-signature-s-out-of-range.json",
    "command-signature-wrong-length.json",
    "command-nonzero-unused-pad-bits.json",
    "command-protected-time-not-utc-z.json",
  ])("stops at the signature envelope: %s", (fileName) => {
    const verify = () =>
      new SignedDocumentCodec().verify(
        SignedDocumentKind.Command,
        readFileSync(
          path.join(
            root,
            "cryptography/vectors/signed-documents/invalid",
            fileName,
          ),
        ),
        fixtureResolver("cryptography/keys/registry-valid.json"),
      );

    expect(verify).toThrow(SignedDocumentVerificationError);
    try {
      verify();
    } catch (error) {
      expect(error).toMatchObject({
        auditDetail: { stage: "signature-envelope" },
        wireCode: "AUTH_INVALID_SIGNATURE",
      });
    }
  });

  it.each(keyResolutionEvaluations)(
    "stops at key resolution: $caseId / $faultId",
    (evaluation) => {
      const verify = () =>
        new SignedDocumentCodec().verify(
          evaluation.kind,
          readFileSync(path.join(root, evaluation.document)),
          fixtureResolver(evaluation.registry),
        );

      expect(verify).toThrow(SignedDocumentVerificationError);
      try {
        verify();
      } catch (error) {
        expect(error).toMatchObject({
          auditDetail: { stage: "key-resolution" },
          wireCode: "AUTH_INVALID_SIGNATURE",
        });
      }
    },
  );

  it.each(signatureEvaluations)(
    "rejects a failed Ed25519 equation: $caseId / $faultId",
    (evaluation) => {
      const verify = () =>
        new SignedDocumentCodec().verify(
          evaluation.kind,
          readFileSync(path.join(root, evaluation.document)),
          fixtureResolver(evaluation.registry),
        );

      expect(verify).toThrow(SignedDocumentVerificationError);
      try {
        verify();
      } catch (error) {
        expect(error).toMatchObject({
          auditDetail: { stage: "signature" },
          wireCode: "AUTH_INVALID_SIGNATURE",
        });
      }
    },
  );

  it.each(parseEvaluations)(
    "rejects strict JSON input at stage 1: $caseId / $faultId",
    (evaluation) => {
      const verify = () =>
        new SignedDocumentCodec().verify(
          evaluation.kind,
          readFileSync(path.join(root, evaluation.document)),
          fixtureResolver(evaluation.registry),
        );

      expect(verify).toThrow(SignedDocumentVerificationError);
      try {
        verify();
      } catch (error) {
        expect(error).toMatchObject({
          auditDetail: { stage: "parse" },
          wireCode: "PROTOCOL_VIOLATION",
        });
      }
    },
  );

  it.each(completeEvaluations)(
    "reproduces a complete signed evaluation: $caseId / $kind",
    (evaluation) => {
      const rawDocument = readFileSync(path.join(root, evaluation.document));
      const expectedDocument = parseStrictJsonObject(rawDocument);
      const verified = new SignedDocumentCodec().verify(
        evaluation.kind,
        rawDocument,
        fixtureResolver(evaluation.registry),
      );
      const expected = evaluation.verified;
      if (!expected || !evaluation.signingKey) {
        throw new TypeError("Complete evaluation is missing expected evidence");
      }

      expect(verified.resolvedKey.keyId).toBe(asString(expected["keyId"]));
      expect(verified.resolvedKey.principal).toEqual(expected["principal"]);
      expect(verified.protectedTime.text).toBe(
        asString(expected["protectedTime"]),
      );
      expect(verified.signingBytes).toEqual(
        new Uint8Array(
          readFileSync(path.join(root, asString(expected["signingBytes"]))),
        ),
      );
      expect(verified.signingHash).toBe(asString(expected["signingHash"]));
      expect(verified.signature.value).toBe(asString(expected["signature"]));
      expect(verified.signedDocumentHash).toBe(
        asString(expected["signedDocumentHash"]),
      );

      const signed = new SignedDocumentCodec().sign(
        evaluation.kind,
        withoutTopLevelSignature(expectedDocument),
        fixtureSigningKey(evaluation.signingKey),
      );
      expect(signed).toEqual(expectedDocument);
    },
  );
});

interface SignedEvaluation {
  readonly caseId: string;
  readonly document: string;
  readonly faultId: string;
  readonly kind: SignedDocumentKind;
  readonly registry: string;
  readonly signingKey?: string;
  readonly stage: string;
  readonly verified?: JsonObject;
}

function readJson(relativePath: string): JsonObject {
  return parseStrictJsonObject(readFileSync(path.join(root, relativePath)));
}

function withoutTopLevelSignature(document: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(document).filter(([key]) => key !== "signature"),
  );
}

function fixtureResolver(relativePath: string): KeyResolver {
  const registry = readJson(relativePath);
  return {
    resolve() {
      return {
        completeness: "organization-wide",
        ...registry,
      } as KeyRegistrySnapshot;
    },
  };
}

function loadSignedEvaluations(): readonly SignedEvaluation[] {
  const manifest = readJson("cryptography/manifest.json");
  const result: SignedEvaluation[] = [];
  for (const caseValue of asArray(manifest["cases"])) {
    const caseDocument = asObject(caseValue);
    const caseId = asString(caseDocument["id"]);
    for (const evaluationValue of asArray(caseDocument["evaluations"])) {
      const evaluation = asObject(evaluationValue);
      if (typeof evaluation["profileId"] !== "string") continue;
      const expectDocument = asObject(evaluation["expect"]);
      const fault = evaluation["fault"];
      result.push({
        caseId,
        document: asString(evaluation["document"]),
        faultId: fault === null ? "complete" : asString(asObject(fault)["id"]),
        kind: asSignedDocumentKind(evaluation["profileId"]),
        registry: asString(evaluation["registry"]),
        ...(typeof evaluation["signingKey"] === "string"
          ? { signingKey: evaluation["signingKey"] }
          : {}),
        stage: asString(expectDocument["stage"]),
        ...(typeof expectDocument["verified"] === "object" &&
        expectDocument["verified"] !== null &&
        !Array.isArray(expectDocument["verified"])
          ? { verified: asObject(expectDocument["verified"]) }
          : {}),
      });
    }
  }
  return result;
}

function fixtureSigningKey(relativePath: string): SigningKey {
  const signingFixture = readJson(relativePath);
  const privateKey = createPrivateKey({
    format: "der",
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      decodeBase64Url(asString(signingFixture["seed"])),
    ]),
    type: "pkcs8",
  });
  return {
    algorithm: "Ed25519",
    keyId: asString(signingFixture["keyId"]),
    sign(bytes) {
      return signBytes(bytes, privateKey);
    },
  };
}

function asArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected an array");
  return value;
}

function asObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected an object");
  }
  return value as JsonObject;
}

function asSignedDocumentKind(value: string): SignedDocumentKind {
  if (
    !Object.values(SignedDocumentKind).includes(value as SignedDocumentKind)
  ) {
    throw new TypeError(`Unexpected Signed Document kind: ${value}`);
  }
  return value as SignedDocumentKind;
}

function asString(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected a string");
  return value;
}
