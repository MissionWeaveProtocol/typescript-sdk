import { generateKeyPairSync } from "node:crypto";

import {
  encodeBase64Url,
  SignedDocumentCodec,
  SignedDocumentKind,
  signBytes,
  type JsonObject,
  type KeyResolver,
  type SigningKey,
} from "@missionweaveprotocol/sdk";

const unsignedCommand = {
  protocolVersion: "0.1",
  actionId: "urn:uuid:00000000-0000-4000-8000-000000000011",
  actor: {
    type: "agent",
    id: "urn:missionweaveprotocol:agent:coordinator",
  },
  sessionEpoch: 7,
  membershipEpoch: 3,
  groupId: "urn:missionweaveprotocol:group:mission-one",
  conversationId: "urn:missionweaveprotocol:conversation:planning",
  kind: "message.post",
  expectedRevision: 4,
  correlationId: "urn:uuid:00000000-0000-4000-8000-000000000012",
  issuedAt: "2026-07-17T08:00:00Z",
  payload: {
    messageId: "urn:missionweaveprotocol:message:one",
    authority: false,
  },
} as const satisfies JsonObject;

const keyId = "urn:missionweaveprotocol:key:coordinator";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signingKey: SigningKey = {
  algorithm: "Ed25519",
  keyId,
  sign(bytes) {
    return signBytes(bytes, privateKey);
  },
};
const publicKeyBytes = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32);
const keyResolver: KeyResolver = {
  resolve() {
    return {
      completeness: "organization-wide",
      organizationId: "urn:missionweaveprotocol:organization:acme",
      bindings: [
        {
          algorithm: "Ed25519",
          keyId,
          principal: unsignedCommand.actor,
          publicKey: encodeBase64Url(publicKeyBytes),
          validFrom: "2026-01-01T00:00:00Z",
          validityHistory: [],
        },
      ],
    };
  },
};

const codec = new SignedDocumentCodec();
const command = codec.sign(
  SignedDocumentKind.Command,
  unsignedCommand,
  signingKey,
);
const verified = codec.verify(
  SignedDocumentKind.Command,
  Buffer.from(JSON.stringify(command)),
  keyResolver,
);

console.log(verified.signingHash);
