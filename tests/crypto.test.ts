import { createPrivateKey, createPublicKey } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decodeBase64Url,
  encodeBase64Url,
  sha256Hex,
  signBytes,
  signDocument,
  signatureInput,
  verifyBytes,
  verifyDocumentSignature,
} from "../src/crypto.js";
import type { JsonObject } from "../src/json-types.js";

const privateSeed = Buffer.from(
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
  "hex",
);
const publicBytes = Buffer.from(
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  "hex",
);
const expectedSignature =
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
  "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";
const privateKey = createPrivateKey({
  format: "der",
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    privateSeed,
  ]),
  type: "pkcs8",
});
const publicKey = createPublicKey({
  format: "der",
  key: Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    publicBytes,
  ]),
  type: "spki",
});

describe("cryptographic protocol primitives", () => {
  it("matches RFC 8032 Ed25519 test vector 1", () => {
    const signature = signBytes(new Uint8Array(), privateKey);
    expect(Buffer.from(signature).toString("hex")).toBe(expectedSignature);
    expect(verifyBytes(new Uint8Array(), signature, publicKey)).toBe(true);
  });

  it("encodes canonical unpadded base64url", () => {
    const encoded = encodeBase64Url(Uint8Array.from([0xfb, 0xff]));
    expect(encoded).toBe("-_8");
    expect(decodeBase64Url(encoded)).toEqual(Uint8Array.from([0xfb, 0xff]));
    expect(() => decodeBase64Url("-_8=")).toThrow(/unpadded/u);
  });

  it("hashes with lowercase SHA-256", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("signs the JCS object after omitting the top-level signature", () => {
    const document: JsonObject = {
      actionId: "urn:uuid:00000000-0000-4000-8000-000000000001",
      issuedAt: "2026-07-15T00:00:00Z",
      signature: {
        algorithm: "Ed25519",
        createdAt: "2026-07-14T00:00:00Z",
        keyId: "urn:missionweaveprotocol:key:old",
        value: "AA",
      },
    };
    expect(new TextDecoder().decode(signatureInput(document))).toBe(
      '{"actionId":"urn:uuid:00000000-0000-4000-8000-000000000001","issuedAt":"2026-07-15T00:00:00Z"}',
    );

    const signed = signDocument(document, privateKey, {
      createdAt: "2026-07-15T00:00:00Z",
      keyId: "urn:missionweaveprotocol:key:test",
    });
    expect(verifyDocumentSignature(signed, publicKey)).toBe(true);
    expect(
      verifyDocumentSignature(
        { ...signed, issuedAt: "2026-07-15T00:00:01Z" },
        publicKey,
      ),
    ).toBe(false);
  });
});
