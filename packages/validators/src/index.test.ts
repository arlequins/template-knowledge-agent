import { describe, expect, it } from "vitest";

import { reviewInvestigationInputSchema } from "./index";

const scope = {
  investigationId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
};

describe("investigation review validation", () => {
  it("requires a cited corrected answer before approval", () => {
    expect(
      reviewInvestigationInputSchema.safeParse({
        ...scope,
        findings: { evidenceIds: ["chunk-1"] },
        status: "approved",
      }).success,
    ).toBe(false);
    expect(
      reviewInvestigationInputSchema.safeParse({
        ...scope,
        findings: {
          correctedAnswer: "근거를 확인했습니다. [evidence:chunk-1]",
          evidenceIds: ["chunk-1"],
        },
        status: "approved",
      }).success,
    ).toBe(true);
  });

  it("allows rejection without creating training data", () => {
    expect(
      reviewInvestigationInputSchema.safeParse({
        ...scope,
        resolution: "근거가 부족함",
        status: "rejected",
      }).success,
    ).toBe(true);
  });
});
