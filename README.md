# MissionWeaveProtocol TypeScript SDK

**English** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) |
[日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

The official Node.js SDK for validating, canonicalizing, signing, and testing
MissionWeaveProtocol 0.1 data.

> Conformance claim: schema-and-vector conformance only.

## Install

```bash
npm install @missionweaveprotocol/sdk
```

The package requires Node.js 20 or newer. It ships ESM, CommonJS, and TypeScript
declarations from the same package. Use
`import { FrameCodec } from "@missionweaveprotocol/sdk"` in ESM or
`const { FrameCodec } = require("@missionweaveprotocol/sdk")` in CommonJS. The
SDK uses Node.js file-system and cryptography APIs; it does not claim browser or
Deno support.

## Protocol compatibility

SDK version `0.1.0` targets MissionWeaveProtocol `0.1`. Its protocol bundle is
pinned to commit
[`6f10987627d62fb296e3490ceceb5539b1e94b70`](https://github.com/missionweaveprotocol/missionweaveprotocol/commit/6f10987627d62fb296e3490ceceb5539b1e94b70).
See [PROTOCOL_PIN.json](PROTOCOL_PIN.json) for the complete artifact digests.

The package contains 21 schemas and 52 conformance vectors: 25 valid and 27
invalid. The manifest is the 53rd file in the bundled `conformance` directory.
CI verifies the vendored schema and conformance bytes against the pin.

## Strict frame validation

`FrameCodec.decode` parses UTF-8 JSON strictly and validates it against the
bundled WebSocket-frame schema. `FrameCodec.encode` validates a frame and emits
RFC 8785 JSON Canonicalization Scheme (JCS) bytes. It does not create or manage
a WebSocket connection.

<!-- example: examples/strict-frame-validation.ts -->

```ts
import { FrameCodec } from "@missionweaveprotocol/sdk";

const incoming = new TextEncoder().encode(`{
  "protocolVersion": "0.1",
  "frameId": "urn:uuid:00000000-0000-4000-8000-000000000010",
  "frameType": "PING",
  "nonce": "cGluZw",
  "sentAt": "2026-07-17T08:00:00Z"
}`);

const codec = new FrameCodec();
const frame = codec.decode(incoming);
const canonicalBytes = codec.encode(frame);

console.log(frame["frameType"], new TextDecoder().decode(canonicalBytes));
```

For other protocol documents, load the offline catalog once and use
`catalog.validate(schemaName, value)` for a result or
`catalog.assertValid(schemaName, value)` to throw `SchemaValidationError`.
`parseStrictJson` and `parseStrictJsonObject` are available when the original
untrusted JSON bytes are not WebSocket frames.

The strict parser rejects duplicate object members, invalid UTF-8, a UTF-8 BOM,
trailing data, malformed or non-representable numbers, unpaired Unicode
surrogates, and nesting deeper than 512 levels.

## Signed Document signing and verification

`SignedDocumentCodec` implements the fixed nine-kind Signed Document
Verification Profile. `sign` accepts only pure JSON-domain values and a
`SigningKey`; `verify` accepts the received UTF-8 bytes and a `KeyResolver`,
then stops at the first of the six normative verification stages. A verified
result includes immutable document evidence, canonical signing and complete
document bytes and hashes, exact protected time, signature material, and the
resolved key and Principal. The First-Admission Record, Command freshness, and
role authorization remain separate checks.

<!-- example: examples/sign-command.ts -->

```ts
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
```

Lower-level exports include `canonicalizeJson`, `canonicalJsonBytes`,
`sha256Hex`, `sha256Identifier`, strict unpadded base64url helpers, `signBytes`,
`verifyBytes`, `signatureInput`, `signDocument`, and `verifyDocumentSignature`.

## Conformance runner

Run the bundled vectors programmatically:

<!-- example: examples/run-conformance.ts -->

```ts
import { runConformance } from "@missionweaveprotocol/sdk";

const report = runConformance();
console.log(
  `${report.passed}/${report.total} vectors passed ` +
    `(${report.validCases} valid, ${report.invalidCases} invalid)`,
);

if (report.failed > 0) process.exitCode = 1;
```

Or use the installed CLI:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --json
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --root ./path/to/protocol-bundle
```

`--root` must point to a bundle containing the canonical `schemas` directory and
`conformance/manifest.json` plus its vectors.

## Packaged resources

Published tarballs include these paths:

- `schemas/` — 21 Draft 2020-12 JSON Schemas.
- `conformance/` — the manifest and 52 JSON vectors.
- `PROTOCOL_PIN.json` — protocol version, source commit, and artifact digests.
- `examples/` — the type-checked examples shown above.
- `dist/` — ESM, CommonJS, declaration files, source maps, and the CLI.

`packageRoot()` returns the installed package root. `SchemaCatalog.load()` and
`runConformance()` use that root by default; pass another root only when testing
a bundle with the same layout.

## Security and behavioral boundaries

- Schema validation checks document shape and formats. It does not grant
  authority, authenticate an agent, enforce organization policy, or prove that a
  mission action is allowed.
- Passing an already-created JavaScript object to `SchemaCatalog` cannot detect
  duplicate JSON keys or invalid source bytes that were lost during an earlier
  parse. Use the strict parser at the trust boundary.
- Signature helpers do not provide key generation policy, key storage, key
  discovery, trust decisions, revocation, timestamp policy, replay prevention,
  or session/membership/lease fencing. The application owns those controls.
- Validate untrusted signed documents before verification and treat parsing,
  base64url decoding, and verification errors as rejection.
- `FrameCodec` is a frame serializer, not a transport, session client,
  coordinator, worker scheduler, durable store, or retry engine.
- Passing all bundled vectors demonstrates schema-and-vector conformance only.
  It is not a claim of complete protocol behavior, interoperability, security,
  or production readiness.

## Development

```bash
npm ci
npm run check
npm audit --audit-level=low
```

`npm run check` verifies repository naming policy, the protocol pin,
documentation, formatting, linting, all examples, tests, build output, package
metadata, and a packed-install smoke test for ESM, CommonJS, resources, and the
CLI.

## License

Apache-2.0. See [LICENSE](LICENSE).
