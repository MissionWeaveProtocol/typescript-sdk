import { createPublicKey, type KeyObject } from "node:crypto";

import { canonicalJsonBytes } from "./canonical-json.js";
import {
  decodeBase64Url,
  encodeBase64Url,
  sha256Identifier,
  verifyBytes,
} from "./crypto.js";
import {
  assertStrictEd25519Point,
  ED25519_ORDER,
  littleEndianInteger,
} from "./ed25519-strict.js";
import type { JsonObject, JsonValue } from "./json-types.js";
import {
  compareRfc3339Instants,
  parseRfc3339Instant,
  type Rfc3339Instant,
} from "./rfc3339.js";
import {
  SchemaCatalog,
  SchemaValidationError,
  type SchemaName,
} from "./schema-catalog.js";
import {
  isExtremeJsonNumber,
  parseStrictJsonForVerification,
  StrictJsonSyntaxError,
  type VerificationJsonObject,
  type VerificationJsonValue,
} from "./strict-json.js";

export enum SignedDocumentKind {
  AgentCard = "agent-card",
  Approval = "approval",
  Artifact = "artifact",
  Command = "command",
  ContextPackage = "context-package",
  Event = "event",
  Evidence = "evidence",
  ExtensionProfile = "extension-profile",
  GroupSnapshot = "group-snapshot",
}

export interface SigningKey {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  sign(bytes: Uint8Array): Uint8Array;
}

export type PrincipalType = "agent" | "human" | "service";

export interface Principal {
  readonly type: PrincipalType;
  readonly id: string;
}

export interface KeyValidityRecord {
  readonly sequence: number;
  readonly recordedAt: string;
  readonly validUntil?: string;
  readonly revokedAt?: string;
}

export interface RegistrySigningKeyBinding {
  readonly keyId: string;
  readonly principal: Principal;
  readonly algorithm: "Ed25519";
  readonly publicKey: string;
  readonly validFrom: string;
  readonly validityHistory: readonly KeyValidityRecord[];
}

export interface KeyRegistrySnapshot {
  readonly completeness: "organization-wide";
  readonly organizationId: string;
  readonly bindings: readonly RegistrySigningKeyBinding[];
}

export type ExpectedSigner =
  | { readonly rule: "exact-principal"; readonly principal: Principal }
  | { readonly rule: "service-principal" };

export interface KeyResolutionRequest {
  readonly kind: SignedDocumentKind;
  readonly keyId: string;
  readonly expectedSigner: ExpectedSigner;
  readonly protectedTime: {
    readonly text: string;
    readonly instant: Rfc3339Instant;
  };
}

export interface KeyResolver {
  resolve(request: KeyResolutionRequest): KeyRegistrySnapshot;
}

export type VerificationStage =
  | "parse"
  | "schema"
  | "signature-envelope"
  | "key-resolution"
  | "canonicalization"
  | "signature";

export type VerificationWireCode =
  "AUTH_INVALID_SIGNATURE" | "PROTOCOL_VIOLATION" | "SCHEMA_VALIDATION_FAILED";

export interface VerificationAuditDetail {
  readonly stage: VerificationStage;
  readonly reason: string;
}

export class SignedDocumentVerificationError extends Error {
  readonly #auditDetail: VerificationAuditDetail;
  public readonly wireCode: VerificationWireCode;

  public constructor(
    wireCode: VerificationWireCode,
    auditDetail: VerificationAuditDetail,
  ) {
    super(wireMessage(wireCode));
    this.name = "SignedDocumentVerificationError";
    this.wireCode = wireCode;
    this.#auditDetail = Object.freeze({ ...auditDetail });
  }

  public get auditDetail(): VerificationAuditDetail {
    return this.#auditDetail;
  }
}

export interface SignedDocument extends JsonObject {
  readonly signature: {
    readonly algorithm: "Ed25519";
    readonly createdAt: string;
    readonly keyId: string;
    readonly value: string;
  };
}

interface SignedDocumentProfile {
  readonly expectedSigner:
    | { readonly rule: "agent-id"; readonly pointer: string }
    | { readonly rule: "principal-object"; readonly pointer: string }
    | { readonly rule: "service-principal" };
  readonly protectedTimePointer: string;
  readonly schemaName: SchemaName;
}

const profiles: Readonly<Record<SignedDocumentKind, SignedDocumentProfile>> = {
  [SignedDocumentKind.AgentCard]: {
    expectedSigner: { rule: "service-principal" },
    protectedTimePointer: "/issuedAt",
    schemaName: "agent-card.schema.json",
  },
  [SignedDocumentKind.Approval]: {
    expectedSigner: { rule: "principal-object", pointer: "/approver" },
    protectedTimePointer: "/occurredAt",
    schemaName: "approval.schema.json",
  },
  [SignedDocumentKind.Artifact]: {
    expectedSigner: { rule: "agent-id", pointer: "/producer/agentId" },
    protectedTimePointer: "/createdAt",
    schemaName: "artifact.schema.json",
  },
  [SignedDocumentKind.Command]: {
    expectedSigner: { rule: "principal-object", pointer: "/actor" },
    protectedTimePointer: "/issuedAt",
    schemaName: "command.schema.json",
  },
  [SignedDocumentKind.ContextPackage]: {
    expectedSigner: { rule: "principal-object", pointer: "/generatedBy" },
    protectedTimePointer: "/generatedAt",
    schemaName: "context-package.schema.json",
  },
  [SignedDocumentKind.Event]: {
    expectedSigner: { rule: "principal-object", pointer: "/acceptedBy" },
    protectedTimePointer: "/occurredAt",
    schemaName: "event.schema.json",
  },
  [SignedDocumentKind.Evidence]: {
    expectedSigner: { rule: "principal-object", pointer: "/generatedBy" },
    protectedTimePointer: "/createdAt",
    schemaName: "evidence.schema.json",
  },
  [SignedDocumentKind.ExtensionProfile]: {
    expectedSigner: { rule: "principal-object", pointer: "/approvedBy" },
    protectedTimePointer: "/approvedAt",
    schemaName: "extension-profile.schema.json",
  },
  [SignedDocumentKind.GroupSnapshot]: {
    expectedSigner: { rule: "principal-object", pointer: "/createdBy" },
    protectedTimePointer: "/createdAt",
    schemaName: "group-snapshot.schema.json",
  },
};

let defaultSchemaCatalog: SchemaCatalog | undefined;

export interface ResolvedSigningKey {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly organizationId: string;
  readonly principal: Principal;
  readonly publicKey: string;
  readonly revokedAt: Rfc3339Instant | null;
  readonly validFrom: Rfc3339Instant;
  readonly validUntil: Rfc3339Instant | null;
}

interface VerifiedSignedDocumentArguments {
  readonly document: SignedDocument;
  readonly kind: SignedDocumentKind;
  readonly protectedTime: {
    readonly instant: Rfc3339Instant;
    readonly text: string;
  };
  readonly receivedBytes: Uint8Array;
  readonly resolvedPublicKeyBytes: Uint8Array;
  readonly resolvedKey: ResolvedSigningKey;
  readonly signature: SignedDocument["signature"];
  readonly signatureBytes: Uint8Array;
  readonly signedDocumentBytes: Uint8Array;
  readonly signedDocumentHash: string;
  readonly signingBytes: Uint8Array;
  readonly signingHash: string;
}

export interface VerifiedSignedDocument {
  readonly document: SignedDocument;
  readonly kind: SignedDocumentKind;
  readonly protectedTime: {
    readonly instant: Rfc3339Instant;
    readonly text: string;
  };
  readonly receivedBytes: Uint8Array;
  readonly resolvedPublicKeyBytes: Uint8Array;
  readonly resolvedKey: ResolvedSigningKey;
  readonly signature: SignedDocument["signature"];
  readonly signatureBytes: Uint8Array;
  readonly signedDocumentBytes: Uint8Array;
  readonly signedDocumentHash: string;
  readonly signingBytes: Uint8Array;
  readonly signingHash: string;
}

class VerifiedSignedDocumentResult implements VerifiedSignedDocument {
  readonly #receivedBytes: Uint8Array;
  readonly #resolvedPublicKeyBytes: Uint8Array;
  readonly #signatureBytes: Uint8Array;
  readonly #signedDocumentBytes: Uint8Array;
  readonly #signingBytes: Uint8Array;

  public readonly document: SignedDocument;
  public readonly kind: SignedDocumentKind;
  public readonly protectedTime: {
    readonly instant: Rfc3339Instant;
    readonly text: string;
  };
  public readonly resolvedKey: ResolvedSigningKey;
  public readonly signature: SignedDocument["signature"];
  public readonly signedDocumentHash: string;
  public readonly signingHash: string;

  public constructor(arguments_: VerifiedSignedDocumentArguments) {
    this.kind = arguments_.kind;
    this.document = freezeJson(arguments_.document);
    this.protectedTime = Object.freeze({
      instant: Object.freeze({ ...arguments_.protectedTime.instant }),
      text: arguments_.protectedTime.text,
    });
    this.signature = Object.freeze({ ...arguments_.signature });
    this.resolvedKey = Object.freeze({
      ...arguments_.resolvedKey,
      principal: Object.freeze({ ...arguments_.resolvedKey.principal }),
    });
    this.signingHash = arguments_.signingHash;
    this.signedDocumentHash = arguments_.signedDocumentHash;
    this.#receivedBytes = Uint8Array.from(arguments_.receivedBytes);
    this.#resolvedPublicKeyBytes = Uint8Array.from(
      arguments_.resolvedPublicKeyBytes,
    );
    this.#signatureBytes = Uint8Array.from(arguments_.signatureBytes);
    this.#signedDocumentBytes = Uint8Array.from(arguments_.signedDocumentBytes);
    this.#signingBytes = Uint8Array.from(arguments_.signingBytes);
  }

  public get receivedBytes(): Uint8Array {
    return Uint8Array.from(this.#receivedBytes);
  }

  public get signatureBytes(): Uint8Array {
    return Uint8Array.from(this.#signatureBytes);
  }

  public get resolvedPublicKeyBytes(): Uint8Array {
    return Uint8Array.from(this.#resolvedPublicKeyBytes);
  }

  public get signedDocumentBytes(): Uint8Array {
    return Uint8Array.from(this.#signedDocumentBytes);
  }

  public get signingBytes(): Uint8Array {
    return Uint8Array.from(this.#signingBytes);
  }
}

export class SignedDocumentCodec {
  readonly #schemas = schemaCatalog();

  public sign(
    kind: SignedDocumentKind,
    unsignedDocument: JsonObject,
    signingKey: SigningKey,
  ): SignedDocument {
    const profile = profileFor(kind);
    const pureDocument = copyJsonDomain(unsignedDocument) as JsonObject;
    if (Object.hasOwn(pureDocument, "signature")) {
      throw new TypeError(
        "Unsigned document already has a top-level signature",
      );
    }
    if (signingKey.algorithm !== "Ed25519" || !signingKey.keyId) {
      throw new TypeError("SigningKey must identify one Ed25519 key");
    }
    const protectedTime = jsonPointer(
      pureDocument,
      profile.protectedTimePointer,
    );
    if (typeof protectedTime !== "string") {
      throw new TypeError("Protected signed time must be a string");
    }
    const protectedInstant = parseRfc3339Instant(protectedTime);
    if (!protectedTime.endsWith("Z")) {
      throw new TypeError("Protected signed time must use uppercase Z");
    }
    const signingBytes = canonicalJsonBytes(pureDocument);
    const signatureBytes = signingKey.sign(signingBytes);
    if (
      !(signatureBytes instanceof Uint8Array) ||
      signatureBytes.length !== 64
    ) {
      throw new TypeError(
        "SigningKey must return one 64-byte Ed25519 signature",
      );
    }
    assertSignatureEncoding(signatureBytes);
    const signedDocument: SignedDocument = {
      ...pureDocument,
      signature: {
        algorithm: "Ed25519",
        createdAt: protectedTime,
        keyId: signingKey.keyId,
        value: encodeBase64Url(signatureBytes),
      },
    };
    this.#schemas.assertValid(profile.schemaName, signedDocument);
    void protectedInstant;
    return freezeJson(signedDocument);
  }

  public verify(
    kind: SignedDocumentKind,
    rawUtf8JsonBytes: Uint8Array,
    keyResolver: KeyResolver,
  ): VerifiedSignedDocument {
    const profile = profileFor(kind);
    if (!(rawUtf8JsonBytes instanceof Uint8Array)) {
      throw new TypeError(
        "Signed Document verification requires raw UTF-8 bytes",
      );
    }
    let document: VerificationJsonValue;
    try {
      document = parseStrictJsonForVerification(rawUtf8JsonBytes);
    } catch (error) {
      if (error instanceof StrictJsonSyntaxError) {
        verificationFailure("parse", error.message);
      }
      throw error;
    }

    try {
      this.#schemas.assertValid(profile.schemaName, schemaProjection(document));
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        verificationFailure("schema", error.message);
      }
      throw error;
    }
    if (!isObject(document)) {
      verificationFailure("schema", "Signed Document is not a JSON object");
    }

    const envelope = verifyEnvelope(document, profile);
    let snapshot: KeyRegistrySnapshot;
    try {
      snapshot = keyResolver.resolve({
        expectedSigner: envelope.expectedSigner,
        keyId: envelope.signature.keyId,
        kind,
        protectedTime: {
          instant: envelope.protectedInstant,
          text: envelope.protectedTime,
        },
      });
    } catch (error) {
      verificationFailure(
        "key-resolution",
        error instanceof Error ? error.message : "KeyResolver rejected the key",
      );
    }
    const resolved = resolveSnapshot(
      snapshot,
      envelope.signature.keyId,
      envelope.expectedSigner,
      envelope.protectedInstant,
    );
    let publicKey: KeyObject;
    try {
      publicKey = createPublicKey({
        format: "der",
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"),
          resolved.publicKeyBytes,
        ]),
        type: "spki",
      });
    } catch (error) {
      verificationFailure(
        "key-resolution",
        error instanceof Error ? error.message : "Ed25519 key import failed",
      );
    }

    let materializedDocument: SignedDocument;
    let signedDocumentBytes: Uint8Array;
    let signingBytes: Uint8Array;
    try {
      signingBytes = canonicalJsonBytes(
        canonicalProjection(withoutTopLevelSignature(document)) as JsonObject,
      );
      materializedDocument = canonicalProjection(document) as SignedDocument;
      signedDocumentBytes = canonicalJsonBytes(materializedDocument);
    } catch (error) {
      verificationFailure(
        "canonicalization",
        error instanceof Error ? error.message : "Document is outside JCS",
      );
    }
    if (!verifyBytes(signingBytes, envelope.signatureBytes, publicKey)) {
      verificationFailure("signature", "Ed25519 signature does not verify");
    }

    return new VerifiedSignedDocumentResult({
      document: materializedDocument,
      kind,
      protectedTime: {
        instant: envelope.protectedInstant,
        text: envelope.protectedTime,
      },
      receivedBytes: rawUtf8JsonBytes,
      resolvedKey: resolved.key,
      resolvedPublicKeyBytes: resolved.publicKeyBytes,
      signature: envelope.signature,
      signatureBytes: envelope.signatureBytes,
      signedDocumentBytes,
      signedDocumentHash: sha256Identifier(signedDocumentBytes),
      signingBytes,
      signingHash: sha256Identifier(signingBytes),
    });
  }
}

function schemaCatalog(): SchemaCatalog {
  defaultSchemaCatalog ??= SchemaCatalog.load();
  return defaultSchemaCatalog;
}

interface EnvelopeResult {
  readonly expectedSigner: ExpectedSigner;
  readonly protectedInstant: Rfc3339Instant;
  readonly protectedTime: string;
  readonly signature: SignedDocument["signature"];
  readonly signatureBytes: Uint8Array;
}

interface NormalizedKey {
  readonly algorithm: "Ed25519";
  readonly history: Map<number, NormalizedValidityRecord>;
  readonly keyId: string;
  readonly principal: Principal;
  readonly publicKey: string;
  readonly publicKeyBytes: Uint8Array;
  readonly validFrom: Rfc3339Instant;
}

interface NormalizedValidityRecord {
  readonly recordedAt: Rfc3339Instant;
  readonly revokedAt?: Rfc3339Instant;
  readonly sequence: number;
  readonly validUntil?: Rfc3339Instant;
}

function verifyEnvelope(
  document: VerificationJsonObject,
  profile: SignedDocumentProfile,
): EnvelopeResult {
  const signatureValue = document["signature"];
  if (!isObject(signatureValue)) {
    verificationFailure("signature-envelope", "signature is not an object");
  }
  const protectedTime = jsonPointer(document, profile.protectedTimePointer);
  const createdAt = signatureValue["createdAt"];
  if (typeof protectedTime !== "string" || typeof createdAt !== "string") {
    verificationFailure(
      "signature-envelope",
      "Protected time and signature.createdAt must be strings",
    );
  }
  let protectedInstant: Rfc3339Instant;
  try {
    protectedInstant = parseRfc3339Instant(protectedTime);
    parseRfc3339Instant(createdAt);
  } catch (error) {
    verificationFailure(
      "signature-envelope",
      error instanceof Error ? error.message : "Invalid protected timestamp",
    );
  }
  if (!protectedTime.endsWith("Z") || !createdAt.endsWith("Z")) {
    verificationFailure(
      "signature-envelope",
      "Protected time and signature.createdAt must use uppercase Z",
    );
  }
  if (protectedTime !== createdAt) {
    verificationFailure(
      "signature-envelope",
      "Protected time and signature.createdAt are not byte-equal",
    );
  }

  let expectedSigner: ExpectedSigner;
  if (profile.expectedSigner.rule === "service-principal") {
    expectedSigner = { rule: "service-principal" };
  } else if (profile.expectedSigner.rule === "agent-id") {
    const agentId = jsonPointer(document, profile.expectedSigner.pointer);
    if (typeof agentId !== "string") {
      verificationFailure(
        "signature-envelope",
        "Expected Agent signer ID is not a string",
      );
    }
    expectedSigner = {
      principal: { id: agentId, type: "agent" },
      rule: "exact-principal",
    };
  } else {
    expectedSigner = {
      principal: principalFromValue(
        jsonPointer(document, profile.expectedSigner.pointer),
        "signature-envelope",
        "Expected signer",
      ),
      rule: "exact-principal",
    };
  }

  const algorithm = signatureValue["algorithm"];
  const keyId = signatureValue["keyId"];
  const value = signatureValue["value"];
  if (
    algorithm !== "Ed25519" ||
    typeof keyId !== "string" ||
    typeof value !== "string"
  ) {
    verificationFailure("signature-envelope", "Invalid signature envelope");
  }
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase64Url(value);
    assertSignatureEncoding(signatureBytes);
  } catch (error) {
    verificationFailure(
      "signature-envelope",
      error instanceof Error
        ? error.message
        : "Invalid Ed25519 signature encoding",
    );
  }
  return {
    expectedSigner,
    protectedInstant,
    protectedTime,
    signature: { algorithm, createdAt, keyId, value },
    signatureBytes,
  };
}

function resolveSnapshot(
  snapshot: KeyRegistrySnapshot,
  keyId: string,
  expectedSigner: ExpectedSigner,
  protectedTime: Rfc3339Instant,
): { readonly key: ResolvedSigningKey; readonly publicKeyBytes: Uint8Array } {
  if (!isObject(snapshot) || snapshot["completeness"] !== "organization-wide") {
    verificationFailure(
      "key-resolution",
      "KeyResolver did not establish Organization-wide completeness",
    );
  }
  assertExactRuntimeKeys(
    snapshot,
    ["bindings", "completeness", "organizationId"],
    "key-resolution",
    "Agent Registry snapshot",
  );
  if (
    typeof snapshot["organizationId"] !== "string" ||
    !Array.isArray(snapshot["bindings"]) ||
    snapshot["bindings"].length === 0
  ) {
    verificationFailure("key-resolution", "Invalid Agent Registry snapshot");
  }

  const normalized = new Map<string, NormalizedKey>();
  const publicKeyOwners = new Map<string, string>();
  const principalTuples = new Map<string, string>();
  for (const [index, rawBinding] of snapshot["bindings"].entries()) {
    const binding = normalizeBinding(rawBinding, index);
    const existing = normalized.get(binding.keyId);
    if (existing) {
      if (
        !samePrincipal(existing.principal, binding.principal) ||
        existing.algorithm !== binding.algorithm ||
        existing.publicKey !== binding.publicKey ||
        compareRfc3339Instants(existing.validFrom, binding.validFrom) !== 0
      ) {
        verificationFailure(
          "key-resolution",
          `Key ID ${binding.keyId} is reused for another immutable binding`,
        );
      }
      for (const [sequence, status] of binding.history) {
        const previous = existing.history.get(sequence);
        if (previous && !sameValidityRecord(previous, status)) {
          verificationFailure(
            "key-resolution",
            `Key ID ${binding.keyId} rewrites validity history`,
          );
        }
        existing.history.set(sequence, status);
      }
    } else {
      normalized.set(binding.keyId, binding);
    }

    const publicKeyIdentity = Buffer.from(binding.publicKeyBytes).toString(
      "hex",
    );
    const owner = `${binding.keyId}\u0000${binding.principal.type}\u0000${binding.principal.id}`;
    const previousOwner = publicKeyOwners.get(publicKeyIdentity);
    if (previousOwner && previousOwner !== owner) {
      verificationFailure(
        "key-resolution",
        "The same public key is registered under another Principal or key ID",
      );
    }
    publicKeyOwners.set(publicKeyIdentity, owner);
    const principalTuple = `${binding.principal.type}\u0000${binding.principal.id}\u0000${binding.algorithm}\u0000${publicKeyIdentity}`;
    const alias = principalTuples.get(principalTuple);
    if (alias && alias !== binding.keyId) {
      verificationFailure(
        "key-resolution",
        "Principal, algorithm, and public key have a key-ID alias",
      );
    }
    principalTuples.set(principalTuple, binding.keyId);
  }

  const effectiveValidityByKey = new Map<
    string,
    {
      readonly revokedAt: Rfc3339Instant | null;
      readonly validUntil: Rfc3339Instant | null;
    }
  >();
  for (const binding of normalized.values()) {
    effectiveValidityByKey.set(binding.keyId, effectiveValidity(binding));
  }

  const selected = normalized.get(keyId);
  if (!selected)
    verificationFailure("key-resolution", "Signing key is unknown");
  if (
    expectedSigner.rule === "service-principal"
      ? selected.principal.type !== "service"
      : !samePrincipal(selected.principal, expectedSigner.principal)
  ) {
    verificationFailure(
      "key-resolution",
      "Resolved key is bound to the wrong Principal",
    );
  }

  const effectiveValidityForSelected = effectiveValidityByKey.get(
    selected.keyId,
  );
  if (!effectiveValidityForSelected) {
    verificationFailure(
      "key-resolution",
      "Selected key has no validated validity history",
    );
  }
  const { revokedAt, validUntil } = effectiveValidityForSelected;
  if (compareRfc3339Instants(protectedTime, selected.validFrom) < 0) {
    verificationFailure("key-resolution", "Signing key is not yet valid");
  }
  if (validUntil && compareRfc3339Instants(protectedTime, validUntil) >= 0) {
    verificationFailure("key-resolution", "Signing key is expired");
  }
  if (revokedAt && compareRfc3339Instants(protectedTime, revokedAt) >= 0) {
    verificationFailure("key-resolution", "Signing key is revoked");
  }
  return {
    key: Object.freeze({
      algorithm: "Ed25519",
      keyId: selected.keyId,
      organizationId: snapshot["organizationId"],
      principal: Object.freeze({ ...selected.principal }),
      publicKey: selected.publicKey,
      revokedAt,
      validFrom: selected.validFrom,
      validUntil,
    }),
    publicKeyBytes: Uint8Array.from(selected.publicKeyBytes),
  };
}

function effectiveValidity(binding: NormalizedKey): {
  readonly revokedAt: Rfc3339Instant | null;
  readonly validUntil: Rfc3339Instant | null;
} {
  const statuses = [...binding.history.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
  if (statuses.some((status, index) => status.sequence !== index + 1)) {
    verificationFailure(
      "key-resolution",
      "Key validity history is not contiguous from sequence 1",
    );
  }
  let recordedAt: Rfc3339Instant | null = null;
  let validUntil: Rfc3339Instant | null = null;
  let revokedAt: Rfc3339Instant | null = null;
  for (const status of statuses) {
    if (
      recordedAt &&
      compareRfc3339Instants(status.recordedAt, recordedAt) < 0
    ) {
      verificationFailure(
        "key-resolution",
        "Key validity history is not ordered",
      );
    }
    recordedAt = status.recordedAt;
    if (status.validUntil) {
      if (
        validUntil &&
        compareRfc3339Instants(status.validUntil, validUntil) > 0
      ) {
        verificationFailure(
          "key-resolution",
          "Key validUntil moved later in history",
        );
      }
      validUntil = status.validUntil;
    }
    if (status.revokedAt) {
      if (
        revokedAt &&
        compareRfc3339Instants(status.revokedAt, revokedAt) > 0
      ) {
        verificationFailure(
          "key-resolution",
          "Key revokedAt moved later in history",
        );
      }
      revokedAt = status.revokedAt;
    }
  }
  return { revokedAt, validUntil };
}

function normalizeBinding(
  rawBinding: RegistrySigningKeyBinding,
  index: number,
): NormalizedKey {
  if (!isObject(rawBinding)) {
    verificationFailure(
      "key-resolution",
      `Registry binding ${index} is not an object`,
    );
  }
  assertExactRuntimeKeys(
    rawBinding,
    [
      "algorithm",
      "keyId",
      "principal",
      "publicKey",
      "validFrom",
      "validityHistory",
    ],
    "key-resolution",
    `Registry binding ${index}`,
  );
  const keyId = rawBinding["keyId"];
  const algorithm = rawBinding["algorithm"];
  const publicKey = rawBinding["publicKey"];
  const validFromText = rawBinding["validFrom"];
  const validityHistory = rawBinding["validityHistory"];
  if (
    typeof keyId !== "string" ||
    algorithm !== "Ed25519" ||
    typeof publicKey !== "string" ||
    typeof validFromText !== "string" ||
    !Array.isArray(validityHistory)
  ) {
    verificationFailure(
      "key-resolution",
      `Registry binding ${index} is invalid`,
    );
  }
  const principal = principalFromValue(
    rawBinding["principal"],
    "key-resolution",
    `Registry binding ${index} Principal`,
  );
  let publicKeyBytes: Uint8Array;
  let validFrom: Rfc3339Instant;
  try {
    publicKeyBytes = decodeBase64Url(publicKey);
    if (publicKeyBytes.length !== 32) {
      throw new TypeError("Public key must decode to 32 bytes");
    }
    assertStrictEd25519Point(publicKeyBytes, {
      allowIdentity: false,
      label: `Registry binding ${index} public key`,
    });
    validFrom = parseRfc3339Instant(validFromText);
  } catch (error) {
    verificationFailure(
      "key-resolution",
      error instanceof Error
        ? error.message
        : `Registry binding ${index} is invalid`,
    );
  }
  const history = new Map<number, NormalizedValidityRecord>();
  for (const [historyIndex, rawStatus] of validityHistory.entries()) {
    if (!isObject(rawStatus)) {
      verificationFailure(
        "key-resolution",
        `Registry binding ${index} status ${historyIndex} is not an object`,
      );
    }
    assertExactRuntimeKeys(
      rawStatus,
      ["recordedAt", "revokedAt", "sequence", "validUntil"],
      "key-resolution",
      `Registry binding ${index} status ${historyIndex}`,
      true,
    );
    const sequence = rawStatus["sequence"];
    const recordedAtText = rawStatus["recordedAt"];
    const validUntilText = rawStatus["validUntil"];
    const revokedAtText = rawStatus["revokedAt"];
    if (
      !Number.isSafeInteger(sequence) ||
      typeof sequence !== "number" ||
      sequence < 1 ||
      typeof recordedAtText !== "string" ||
      (Object.hasOwn(rawStatus, "validUntil") &&
        typeof validUntilText !== "string") ||
      (Object.hasOwn(rawStatus, "revokedAt") &&
        typeof revokedAtText !== "string")
    ) {
      verificationFailure(
        "key-resolution",
        `Registry binding ${index} status ${historyIndex} is invalid`,
      );
    }
    let status: NormalizedValidityRecord;
    try {
      status = {
        recordedAt: parseRfc3339Instant(recordedAtText),
        sequence,
        ...(typeof validUntilText === "string"
          ? { validUntil: parseRfc3339Instant(validUntilText) }
          : {}),
        ...(typeof revokedAtText === "string"
          ? { revokedAt: parseRfc3339Instant(revokedAtText) }
          : {}),
      };
    } catch (error) {
      verificationFailure(
        "key-resolution",
        error instanceof Error
          ? error.message
          : "Invalid key validity timestamp",
      );
    }
    const previous = history.get(sequence);
    if (previous && !sameValidityRecord(previous, status)) {
      verificationFailure(
        "key-resolution",
        `Registry binding ${index} repeats a status sequence inconsistently`,
      );
    }
    history.set(sequence, status);
  }
  return {
    algorithm,
    history,
    keyId,
    principal,
    publicKey,
    publicKeyBytes,
    validFrom,
  };
}

function principalFromValue(
  value: unknown,
  stage: "key-resolution" | "signature-envelope",
  label: string,
): Principal {
  if (!isObject(value)) verificationFailure(stage, `${label} is not an object`);
  assertExactRuntimeKeys(value, ["id", "type"], stage, label);
  const type = value["type"];
  const id = value["id"];
  if (
    (type !== "agent" && type !== "human" && type !== "service") ||
    typeof id !== "string"
  ) {
    verificationFailure(stage, `${label} is not a Principal`);
  }
  return { id, type };
}

function assertSignatureEncoding(signatureBytes: Uint8Array): void {
  if (signatureBytes.length !== 64) {
    throw new TypeError("Ed25519 signature must contain 64 bytes");
  }
  assertStrictEd25519Point(signatureBytes.subarray(0, 32), {
    allowIdentity: true,
    label: "Signature R",
  });
  if (littleEndianInteger(signatureBytes.subarray(32)) >= ED25519_ORDER) {
    throw new TypeError("Signature S is outside the Ed25519 scalar range");
  }
}

function withoutTopLevelSignature(
  document: VerificationJsonObject,
): VerificationJsonObject {
  const unsigned: Record<string, VerificationJsonValue> = {};
  for (const [key, value] of Object.entries(document)) {
    if (key !== "signature") {
      Object.defineProperty(unsigned, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }
  }
  return unsigned;
}

function verificationFailure(stage: VerificationStage, reason: string): never {
  throw new SignedDocumentVerificationError(wireCodeFor(stage), {
    reason,
    stage,
  });
}

function wireCodeFor(stage: VerificationStage): VerificationWireCode {
  if (stage === "parse" || stage === "canonicalization") {
    return "PROTOCOL_VIOLATION";
  }
  if (stage === "schema") return "SCHEMA_VALIDATION_FAILED";
  return "AUTH_INVALID_SIGNATURE";
}

function wireMessage(wireCode: VerificationWireCode): string {
  switch (wireCode) {
    case "AUTH_INVALID_SIGNATURE":
      return "Signed Document authentication failed";
    case "PROTOCOL_VIOLATION":
      return "Signed Document violates the protocol";
    case "SCHEMA_VALIDATION_FAILED":
      return "Signed Document failed schema validation";
  }
}

function isObject(
  value: unknown,
): value is Record<string, VerificationJsonValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isExtremeJsonNumber(value as VerificationJsonValue)
  );
}

function assertExactRuntimeKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  stage: "key-resolution" | "signature-envelope",
  label: string,
  allowMissing = false,
): void {
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !allowed.includes(key));
  const missing = allowMissing
    ? []
    : allowed.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    verificationFailure(
      stage,
      `${label} has invalid fields${
        unknown.length > 0 ? `; unknown ${unknown.sort().join(", ")}` : ""
      }${missing.length > 0 ? `; missing ${missing.sort().join(", ")}` : ""}`,
    );
  }
}

function samePrincipal(left: Principal, right: Principal): boolean {
  return left.type === right.type && left.id === right.id;
}

function sameValidityRecord(
  left: NormalizedValidityRecord,
  right: NormalizedValidityRecord,
): boolean {
  return (
    left.sequence === right.sequence &&
    compareRfc3339Instants(left.recordedAt, right.recordedAt) === 0 &&
    sameOptionalInstant(left.validUntil, right.validUntil) &&
    sameOptionalInstant(left.revokedAt, right.revokedAt)
  );
}

function sameOptionalInstant(
  left: Rfc3339Instant | undefined,
  right: Rfc3339Instant | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && compareRfc3339Instants(left, right) === 0;
}

function schemaProjection(value: VerificationJsonValue): JsonValue {
  if (isExtremeJsonNumber(value)) {
    return value.negative ? -Number.MAX_VALUE : Number.MAX_VALUE;
  }
  if (Array.isArray(value)) return value.map((item) => schemaProjection(item));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, schemaProjection(item)]),
    );
  }
  return value as JsonValue;
}

function canonicalProjection(value: VerificationJsonValue): JsonValue {
  if (isExtremeJsonNumber(value)) {
    throw new TypeError(`JCS cannot encode number ${value.raw}`);
  }
  if (Array.isArray(value))
    return value.map((item) => canonicalProjection(item));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        canonicalProjection(item),
      ]),
    );
  }
  return value as JsonValue;
}

function copyJsonDomain(
  value: unknown,
  ancestors = new Set<object>(),
): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Signed Document JSON numbers must be finite");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("Signed Document input must contain only JSON values");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Signed Document input must not contain cycles");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError("Signed Document arrays must be ordinary arrays");
      }
      const allowedKeys = new Set(["length"]);
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Signed Document arrays must not be sparse");
        }
        const key = String(index);
        allowedKeys.add(key);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) {
          throw new TypeError("Signed Document arrays must not use accessors");
        }
        result.push(copyJsonDomain(descriptor.value, ancestors));
      }
      if (
        Reflect.ownKeys(value).some(
          (key) => typeof key !== "string" || !allowedKeys.has(key),
        )
      ) {
        throw new TypeError(
          "Signed Document arrays must not have extra members",
        );
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        "Signed Document objects must be ordinary JSON objects",
      );
    }
    const result: Record<string, JsonValue> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new TypeError(
          "Signed Document objects must not have symbol members",
        );
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError(
          "Signed Document objects must contain enumerable data members only",
        );
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: copyJsonDomain(descriptor.value, ancestors),
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
  } else {
    for (const item of Object.values(value)) freezeJson(item);
  }
  return Object.freeze(value);
}

function profileFor(kind: SignedDocumentKind): SignedDocumentProfile {
  const profile = profiles[kind];
  if (!profile)
    throw new TypeError(`Unsupported Signed Document kind: ${kind}`);
  return profile;
}

function jsonPointer(
  document: VerificationJsonValue,
  pointer: string,
): VerificationJsonValue | undefined {
  let current: VerificationJsonValue | undefined = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !Object.hasOwn(current, token)
    ) {
      return undefined;
    }
    current = (current as VerificationJsonObject)[token];
  }
  return current;
}
