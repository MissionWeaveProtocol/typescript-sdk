import { describe, expect, it } from "vitest";

import { runConformance } from "../src/conformance.js";

describe("MissionWeaveProtocol schema-and-vector conformance", () => {
  it("passes all 43 canonical vectors", () => {
    const report = runConformance();
    expect(report).toMatchObject({
      failed: 0,
      invalidCases: 21,
      passed: 43,
      total: 43,
      validCases: 22,
    });
  });
});
