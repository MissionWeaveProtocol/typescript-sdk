export const protocolVersion = "0.1" as const;
export const wireNamespace = "missionweaveprotocol" as const;

export * from "./canonical-json.js";
export * from "./conformance.js";
export * from "./crypto.js";
export * from "./frame-codec.js";
export * from "./json-types.js";
export * from "./package-root.js";
export * from "./schema-catalog.js";
export * from "./signed-document-codec.js";
export type { Rfc3339Instant } from "./rfc3339.js";
export {
  parseStrictJson,
  parseStrictJsonObject,
  StrictJsonSyntaxError,
} from "./strict-json.js";

export interface SdkMetadata {
  readonly packageName: "@missionweaveprotocol/sdk";
  readonly protocolVersion: typeof protocolVersion;
  readonly wireNamespace: typeof wireNamespace;
}

export function sdkMetadata(): SdkMetadata {
  return {
    packageName: "@missionweaveprotocol/sdk",
    protocolVersion,
    wireNamespace,
  };
}
