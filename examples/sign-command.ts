import { generateKeyPairSync } from "node:crypto";

import {
  SchemaCatalog,
  signDocument,
  verifyDocumentSignature,
  type JsonObject,
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
} satisfies JsonObject;

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const command = signDocument(unsignedCommand, privateKey, {
  keyId: "urn:missionweaveprotocol:key:coordinator",
  createdAt: "2026-07-17T08:00:00Z",
});

SchemaCatalog.load().assertValid("command.schema.json", command);
if (!verifyDocumentSignature(command, publicKey)) {
  throw new Error("Command signature did not verify");
}

console.log(command.signature.keyId);
