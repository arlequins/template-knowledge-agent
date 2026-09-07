import { describe, expect, it } from "vitest";

import { runSyntheticReference } from "./reference";

describe("synthetic agent integration reference", () => {
  it("runs both provider-neutral suites without derived arguments", async () => {
    const report = await runSyntheticReference();
    expect(report.passed).toBe(true);
    expect(report.privacy.passed).toBe(true);
    expect(report.weightTraining.passed).toBe(true);
  });
});
