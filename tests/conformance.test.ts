import { describe, expect, it } from "vitest";

import { runConformance } from "../src/conformance.js";

describe("MissionWeaveProtocol schema-and-vector conformance", () => {
  it("passes all 52 canonical vectors", () => {
    const report = runConformance();
    expect(report).toMatchObject({
      failed: 0,
      invalidCases: 27,
      passed: 52,
      total: 52,
      validCases: 25,
    });
  });
});
