import { describe, expect, it } from "vitest";

import { protocolVersion, sdkMetadata, wireNamespace } from "../src/index.js";

describe("SDK metadata", () => {
  it("uses the canonical MissionWeaveProtocol identity", () => {
    expect(sdkMetadata()).toEqual({
      packageName: "@missionweaveprotocol/sdk",
      protocolVersion,
      wireNamespace,
    });
  });
});
