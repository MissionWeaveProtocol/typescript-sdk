import { describe, expect, it } from "vitest";

import { runConformance } from "../src/conformance.js";

describe("MissionWeaveProtocol schema-and-vector conformance", () => {
  it("passes all 56 canonical vectors", () => {
    const report = runConformance();
    expect(report).toMatchObject({
      failed: 0,
      invalidCases: 30,
      passed: 56,
      total: 56,
      validCases: 26,
    });
  });
});
