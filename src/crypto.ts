import {
  createHash,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from "node:crypto";

import { canonicalJsonBytes } from "./canonical-json.js";
import type { JsonObject, JsonValue } from "./json-types.js";
import { isJsonObject } from "./json-types.js";

export type NodeKey = Buffer | KeyObject | string;

export type ProtocolSignature = {
  readonly algorithm: "Ed25519";
  readonly createdAt: string;
  readonly keyId: string;
  readonly value: string;
};

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Identifier(value: string | Uint8Array): string {
  return `sha256:${sha256Hex(value)}`;
}

export function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError("Expected unpadded base64url data");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new TypeError("Expected canonical unpadded base64url data");
  }
  return new Uint8Array(decoded);
}

export function signBytes(value: Uint8Array, privateKey: NodeKey): Uint8Array {
  return nodeSign(null, value, privateKey);
}

export function verifyBytes(
  value: Uint8Array,
  signature: Uint8Array,
  publicKey: NodeKey,
): boolean {
  return nodeVerify(null, value, publicKey, signature);
}

export function signatureInput(document: JsonObject): Uint8Array {
  const unsigned: Record<string, JsonValue> = {};
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
  return canonicalJsonBytes(unsigned);
}

export function signDocument<T extends JsonObject>(
  document: T,
  privateKey: NodeKey,
  metadata: Omit<ProtocolSignature, "algorithm" | "value">,
): T & { readonly signature: ProtocolSignature } {
  const signature: ProtocolSignature = {
    algorithm: "Ed25519",
    createdAt: metadata.createdAt,
    keyId: metadata.keyId,
    value: encodeBase64Url(signBytes(signatureInput(document), privateKey)),
  };
  return { ...document, signature };
}

export function verifyDocumentSignature(
  document: JsonObject,
  publicKey: NodeKey,
): boolean {
  const signature = document["signature"];
  if (!isProtocolSignature(signature)) return false;
  return verifyBytes(
    signatureInput(document),
    decodeBase64Url(signature.value),
    publicKey,
  );
}

function isProtocolSignature(
  value: JsonValue | undefined,
): value is ProtocolSignature {
  if (!isJsonObject(value)) return false;
  return (
    value["algorithm"] === "Ed25519" &&
    typeof value["createdAt"] === "string" &&
    typeof value["keyId"] === "string" &&
    typeof value["value"] === "string"
  );
}
