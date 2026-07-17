export const protocolVersion = "0.1" as const;
export const wireNamespace = "missionweaveprotocol" as const;

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
