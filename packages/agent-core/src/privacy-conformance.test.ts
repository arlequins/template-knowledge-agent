import { describe, expect, it } from "vitest";

import {
  createSyntheticExactPersonalDataConformanceAdapter,
  EXACT_PERSONAL_DATA_CONFORMANCE_CASE_IDS,
  runExactPersonalDataConformance,
} from "./privacy-conformance";
import {
  type ExactPersonalDataReadiness,
  isExactPersonalDataContractRejection,
} from "./privacy-readiness";

describe("exact personal-data conformance kit", () => {
  it("passes every deterministic synthetic contract case", async () => {
    const report = await runExactPersonalDataConformance(
      createSyntheticExactPersonalDataConformanceAdapter(),
    );
    expect(report.passed).toBe(true);
    expect(report.passedCases).toBe(27);
    expect(report.failedCases).toBe(0);
    expect(report.cases.map((value) => value.id)).toEqual(
      EXACT_PERSONAL_DATA_CONFORMANCE_CASE_IDS,
    );
    expect(report.cases.every((value) => value.status === "passed")).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.cases)).toBe(true);
  });

  it("returns only stable safe issue codes for a failing harness", async () => {
    const adapter = createSyntheticExactPersonalDataConformanceAdapter();
    const failingAdapter = {
      ...adapter,
      createReadiness: () => {
        throw new Error("real@example.com Bearer real-secret");
      },
    };

    const report = await runExactPersonalDataConformance(failingAdapter);

    expect(report.passed).toBe(false);
    expect(report.passedCases).toBe(0);
    expect(report.failedCases).toBe(27);
    expect(
      report.cases.every(
        (value) =>
          value.status === "failed" &&
          value.issues.length === 1 &&
          value.issues[0]?.code === "unexpected_failure",
      ),
    ).toBe(true);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("real@example.com");
    expect(serialized).not.toContain("real-secret");
    expect(serialized).not.toContain("synthetic-source");
  });

  it("does not accept a rejection-shaped clock error as a contract failure", async () => {
    const adapter = createSyntheticExactPersonalDataConformanceAdapter();
    const forged = Object.assign(new Error("clock backend unavailable"), {
      code: "EXACT_PERSONAL_DATA_CONTRACT_REJECTED",
      name: "ExactPersonalDataContractRejection",
    });
    const report = await runExactPersonalDataConformance({
      ...adapter,
      clock: {
        advance: adapter.clock.advance,
        now: () => {
          throw forged;
        },
      },
    });

    expect(isExactPersonalDataContractRejection(forged)).toBe(false);
    expect(report.passed).toBe(false);
    expect(
      report.cases.every(
        (value) =>
          value.status === "failed" &&
          value.issues[0]?.code === "unexpected_failure",
      ),
    ).toBe(true);
  });

  it("does not accept a rejection-shaped deletion-port error", async () => {
    const adapter = createSyntheticExactPersonalDataConformanceAdapter();
    const forged = Object.assign(new Error("deletion backend unavailable"), {
      code: "EXACT_PERSONAL_DATA_CONTRACT_REJECTED",
      name: "ExactPersonalDataContractRejection",
    });
    const report = await runExactPersonalDataConformance({
      ...adapter,
      createReadiness: (caseId) => {
        const readiness = adapter.createReadiness(caseId) as
          | ExactPersonalDataReadiness
          | undefined;
        if (
          caseId === "exact-personal-data.scope-tenant" &&
          readiness !== undefined
        )
          readiness.deletion.port.requestDeletion = () => {
            throw forged;
          };
        return readiness;
      },
    });
    const result = report.cases.find(
      (value) => value.id === "exact-personal-data.scope-tenant",
    );
    expect(result?.status).toBe("failed");
    expect(result?.issues[0]?.code).toBe("unexpected_failure");
  });

  it("derives a distinct forged source even when the source uses the old sentinel", async () => {
    const adapter = createSyntheticExactPersonalDataConformanceAdapter();
    const report = await runExactPersonalDataConformance({
      ...adapter,
      createReadiness: (caseId) => {
        const readiness = adapter.createReadiness(caseId) as
          | ExactPersonalDataReadiness
          | undefined;
        if (readiness === undefined) return readiness;
        const sourceId = "synthetic-other-source";
        readiness.sourceId = sourceId;
        readiness.structuredUi.approvalEvidence.sourceId = sourceId;
        readiness.privacyOwnerAcceptance.acceptanceEvidence.sourceId = sourceId;
        return readiness;
      },
    });
    const result = report.cases.find(
      (value) => value.id === "exact-personal-data.deletion-source-binding",
    );
    expect(result?.status).toBe("passed");
  });
});
