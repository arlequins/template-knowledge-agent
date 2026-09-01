import { describe, expect, it, vi } from "vitest";

import {
  assertExactPersonalDataAuthorizationPermit,
  assertExactPersonalDataSourceReady,
  authorizeExactPersonalDataSource,
} from "./privacy-readiness";

const now = new Date("2026-09-01T00:00:00.000Z");

function readiness(overrides: Record<string, unknown> = {}) {
  return {
    accessReview: {
      reviewDueAt: "2026-10-01T00:00:00.000Z",
      reviewedAt: "2026-08-31T00:00:00.000Z",
      reviewerId: "security-reviewer",
    },
    deletion: {
      port: { requestDeletion: vi.fn(async () => undefined) },
      workflowId: "privacy-delete-v1",
    },
    privacyOwnerAcceptance: {
      accepted: true,
      acceptedAt: "2026-08-31T00:00:00.000Z",
      acceptanceEvidence: {
        acceptanceId: "privacy-acceptance-1",
        acceptedAt: "2026-08-31T00:00:00.000Z",
        approverRole: "privacy-owner",
        expiresAt: "2026-10-01T00:00:00.000Z",
        policyVersion: "privacy-policy-v1",
        sourceId: "customer-contact",
        subject: "privacy-owner",
      },
      expiresAt: "2026-10-01T00:00:00.000Z",
      ownerId: "privacy-owner",
    },
    retention: { cacheMaxMinutes: 15, maxDays: 30 },
    sourceId: "customer-contact",
    structuredUi: {
      authorization: "explicit",
      authorizedAt: "2026-08-31T00:00:00.000Z",
      authorizedBy: "security-reviewer",
      approverRole: "security-reviewer",
      approvalExpiresAt: "2026-10-01T00:00:00.000Z",
      approvalEvidence: {
        approvalId: "ui-approval-1",
        approverRole: "security-reviewer",
        approvedAt: "2026-08-31T00:00:00.000Z",
        expiresAt: "2026-10-01T00:00:00.000Z",
        policyVersion: "privacy-policy-v1",
        route: "customerContactCard",
        routeVersion: "v1",
        sourceId: "customer-contact",
        subject: "security-reviewer",
      },
      modelAccess: "excluded",
      route: "customerContactCard",
      routeVersion: "v1",
      transport: "non-model",
    },
    approvalVerifier: {
      verifyPrivacyOwnerAcceptance: ({ evidence }: { evidence: unknown }) =>
        evidence,
      verifyStructuredUi: ({ evidence }: { evidence: unknown }) => evidence,
    },
    ...overrides,
  };
}

describe("exact personal-data readiness", () => {
  it("authorizes only a complete, current contract", async () => {
    const contract = readiness();

    const enablement = await authorizeExactPersonalDataSource(contract, {
      clock: () => now,
    });
    expect(enablement).toMatchObject({
      enabled: true,
      sourceId: "customer-contact",
    });
    expect(Object.isFrozen(enablement.permit)).toBe(true);
    const descriptor = assertExactPersonalDataAuthorizationPermit(
      enablement.permit,
      enablement.descriptor,
      { clock: () => now },
    );
    expect(descriptor).toBe(enablement.descriptor);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(() =>
      assertExactPersonalDataAuthorizationPermit(
        { ...enablement.permit },
        enablement.descriptor,
        { clock: () => now },
      ),
    ).toThrow("module-issued permit");
    expect(() =>
      assertExactPersonalDataAuthorizationPermit(
        enablement.permit,
        { ...enablement.descriptor, sourceId: "other-source" },
        { clock: () => now },
      ),
    ).toThrow("exact registration descriptor");
    expect(() =>
      assertExactPersonalDataSourceReady(undefined, { clock: () => now }),
    ).toThrow("disabled without readiness");
  });

  it.each([
    ["structured UI", { structuredUi: { transport: "model" } }, "non-model"],
    [
      "model exclusion",
      { structuredUi: { ...readiness().structuredUi, modelAccess: "allowed" } },
      "excluded from model context",
    ],
    [
      "retention",
      { retention: { cacheMaxMinutes: 15, maxDays: 0 } },
      "retention must be between",
    ],
    [
      "deletion workflow",
      { deletion: { workflowId: "", port: {} } },
      "deletion.workflowId",
    ],
    [
      "access review",
      {
        accessReview: {
          ...readiness().accessReview,
          reviewDueAt: "2026-08-31T00:00:00.000Z",
        },
      },
      "access review is expired",
    ],
    [
      "privacy owner acceptance",
      {
        privacyOwnerAcceptance: {
          accepted: false,
          acceptedAt: "2026-08-31T00:00:00.000Z",
          ownerId: "privacy-owner",
        },
      },
      "privacy-owner acceptance",
    ],
  ])(
    "fails closed when %s is missing or invalid",
    (_name, override, message) => {
      expect(() =>
        assertExactPersonalDataSourceReady(readiness(override), {
          clock: () => now,
        }),
      ).toThrow(message);
    },
  );

  it("rechecks freshness after delayed approval verification", async () => {
    let currentNow = new Date("2026-08-31T00:00:00.000Z");
    const contract = readiness({
      structuredUi: {
        ...readiness().structuredUi,
        authorizedAt: "2026-06-03T00:00:00.000Z",
        approvalExpiresAt: "2027-01-01T00:00:00.000Z",
        approvalEvidence: {
          ...readiness().structuredUi.approvalEvidence,
          approvedAt: "2026-06-03T00:00:00.000Z",
          expiresAt: "2027-01-01T00:00:00.000Z",
        },
      },
      approvalVerifier: {
        verifyPrivacyOwnerAcceptance: ({ evidence }: { evidence: unknown }) =>
          evidence,
        verifyStructuredUi: async ({ evidence }: { evidence: unknown }) => {
          await Promise.resolve();
          currentNow = new Date("2026-09-02T00:00:00.000Z");
          return evidence;
        },
      },
    });
    await expect(
      authorizeExactPersonalDataSource(contract, { clock: () => currentNow }),
    ).rejects.toThrow("UI approval is too old");
  });

  it("rechecks explicit expiry after delayed approval verification", async () => {
    let currentNow = now;
    const contract = readiness({
      structuredUi: {
        ...readiness().structuredUi,
        approvalExpiresAt: "2026-09-02T00:00:00.000Z",
        approvalEvidence: {
          ...readiness().structuredUi.approvalEvidence,
          expiresAt: "2026-09-02T00:00:00.000Z",
        },
      },
      approvalVerifier: {
        verifyPrivacyOwnerAcceptance: ({ evidence }: { evidence: unknown }) =>
          evidence,
        verifyStructuredUi: async ({ evidence }: { evidence: unknown }) => {
          await Promise.resolve();
          currentNow = new Date("2026-09-02T00:00:00.000Z");
          return evidence;
        },
      },
    });
    await expect(
      authorizeExactPersonalDataSource(contract, { clock: () => currentNow }),
    ).rejects.toThrow("UI approval is expired");
  });

  it("requires an injected approval identity verifier", () => {
    expect(() =>
      assertExactPersonalDataSourceReady(
        readiness({ approvalVerifier: undefined }),
        { clock: () => now },
      ),
    ).toThrow("approval identity verifier");
  });

  it.each([
    ["structured UI false", "verifyStructuredUi", "structured-UI verifier"],
    [
      "privacy-owner false",
      "verifyPrivacyOwnerAcceptance",
      "privacy-owner verifier",
    ],
  ])(
    "fails closed when %s verifier rejects",
    async (_name, method, message) => {
      const contract = readiness({
        approvalVerifier: {
          verifyPrivacyOwnerAcceptance: ({
            evidence,
          }: {
            evidence: unknown;
          }) => (method === "verifyPrivacyOwnerAcceptance" ? false : evidence),
          verifyStructuredUi: ({ evidence }: { evidence: unknown }) =>
            method === "verifyStructuredUi" ? false : evidence,
        },
      });
      await expect(
        authorizeExactPersonalDataSource(contract, { clock: () => now }),
      ).rejects.toThrow(message);
    },
  );

  it("fails closed when a verifier throws or returns forged evidence", async () => {
    const throwing = readiness({
      approvalVerifier: {
        verifyPrivacyOwnerAcceptance: () => {
          throw new Error("backend unavailable");
        },
        verifyStructuredUi: ({ evidence }: { evidence: unknown }) => evidence,
      },
    });
    await expect(
      authorizeExactPersonalDataSource(throwing, { clock: () => now }),
    ).rejects.toThrow("privacy-owner verifier failed");

    const forged = readiness({
      approvalVerifier: {
        verifyPrivacyOwnerAcceptance: ({
          evidence,
        }: {
          evidence: Record<string, unknown>;
        }) => evidence,
        verifyStructuredUi: ({
          evidence,
        }: {
          evidence: Record<string, unknown>;
        }) => ({
          ...evidence,
          subject: "forged-signer",
        }),
      },
    });
    await expect(
      authorizeExactPersonalDataSource(forged, { clock: () => now }),
    ).rejects.toThrow("rejected or returned mismatched evidence");
  });

  it("fails closed when the readiness contract mutates during verification", async () => {
    const contract = readiness();
    contract.approvalVerifier = {
      verifyPrivacyOwnerAcceptance: ({ evidence }: { evidence: unknown }) =>
        evidence,
      verifyStructuredUi: ({ evidence }: { evidence: unknown }) => {
        contract.retention.maxDays = 31;
        return evidence;
      },
    };
    await expect(
      authorizeExactPersonalDataSource(contract, { clock: () => now }),
    ).rejects.toThrow("mutated during approval verification");
  });

  it("rejects future evidence and a missing deletion port", () => {
    expect(() =>
      assertExactPersonalDataSourceReady(
        readiness({
          structuredUi: {
            ...readiness().structuredUi,
            authorizedAt: "2026-09-02T00:00:00.000Z",
            approvalEvidence: {
              ...readiness().structuredUi.approvalEvidence,
              approvedAt: "2026-09-02T00:00:00.000Z",
            },
          },
        }),
        { clock: () => now },
      ),
    ).toThrow("cannot be in the future");
    expect(() =>
      assertExactPersonalDataSourceReady(
        readiness({ deletion: { port: {}, workflowId: "delete" } }),
        { clock: () => now },
      ),
    ).toThrow("deletion port");
  });

  it("rejects structured-UI approval evidence replayed across sources", () => {
    expect(() =>
      assertExactPersonalDataSourceReady(
        readiness({
          sourceId: "other-source",
          privacyOwnerAcceptance: {
            ...readiness().privacyOwnerAcceptance,
            acceptanceEvidence: {
              ...readiness().privacyOwnerAcceptance.acceptanceEvidence,
              sourceId: "other-source",
            },
          },
          structuredUi: {
            ...readiness().structuredUi,
            approvalEvidence: {
              ...readiness().structuredUi.approvalEvidence,
              sourceId: "customer-contact",
            },
          },
        }),
        { clock: () => now },
      ),
    ).toThrow("approvalEvidence.sourceId");
  });

  it("rejects a verifier result replayed from another source", async () => {
    const contract = readiness({
      approvalVerifier: {
        verifyPrivacyOwnerAcceptance: ({ evidence }: { evidence: unknown }) =>
          evidence,
        verifyStructuredUi: ({
          evidence,
        }: {
          evidence: Record<string, unknown>;
        }) => ({ ...evidence, sourceId: "other-source" }),
      },
    });
    await expect(
      authorizeExactPersonalDataSource(contract, { clock: () => now }),
    ).rejects.toThrow("structured-UI verifier rejected");
  });

  it("keeps the registration descriptor safe after source-contract mutation", async () => {
    const contract = readiness();
    const enablement = await authorizeExactPersonalDataSource(contract, {
      clock: () => now,
    });
    contract.structuredUi.routeVersion = "v2";
    const descriptor = assertExactPersonalDataAuthorizationPermit(
      enablement.permit,
      enablement.descriptor,
      { clock: () => now },
    );
    expect(descriptor.structuredUi.routeVersion).toBe("v1");
  });

  it("keeps the deletion function identity safe after source-contract mutation", async () => {
    const contract = readiness();
    const enablement = await authorizeExactPersonalDataSource(contract, {
      clock: () => now,
    });
    const originalDelete = enablement.descriptor.deletion.port.requestDeletion;
    contract.deletion.port.requestDeletion = vi.fn(async () => undefined);
    const descriptor = assertExactPersonalDataAuthorizationPermit(
      enablement.permit,
      enablement.descriptor,
      { clock: () => now },
    );
    expect(descriptor.deletion.port.requestDeletion).toBe(originalDelete);
  });

  it("rejects a different contract even when its values match", async () => {
    const contract = readiness();
    const enablement = await authorizeExactPersonalDataSource(contract, {
      clock: () => now,
    });
    expect(() =>
      assertExactPersonalDataAuthorizationPermit(
        enablement.permit,
        { ...enablement.descriptor },
        { clock: () => now },
      ),
    ).toThrow("registration descriptor");
    expect(() =>
      assertExactPersonalDataAuthorizationPermit(
        enablement.permit,
        {
          ...enablement.descriptor,
          structuredUi: {
            ...enablement.descriptor.structuredUi,
            routeVersion: "v2",
          },
        },
        { clock: () => now },
      ),
    ).toThrow("registration descriptor");
  });

  it.each([
    "2026-09-01T00:00:00Z",
    "2026-09-01T00:00:00.000+00:00",
    "2026-09-01 00:00:00.000Z",
    "September 1, 2026 00:00:00 UTC",
    "2026-02-31T00:00:00.000Z",
  ])("rejects non-canonical or calendar-invalid timestamp %s", (timestamp) => {
    expect(() =>
      assertExactPersonalDataSourceReady(
        readiness({
          structuredUi: {
            ...readiness().structuredUi,
            authorizedAt: timestamp,
          },
        }),
        { clock: () => now },
      ),
    ).toThrow();
  });

  it.each([
    [
      "stale approval",
      {
        authorizedAt: "2026-05-31T00:00:00.000Z",
        approvalEvidence: {
          ...readiness().structuredUi.approvalEvidence,
          approvedAt: "2026-05-31T00:00:00.000Z",
        },
      },
      "UI approval is too old",
    ],
    [
      "future approval",
      {
        authorizedAt: "2026-09-02T00:00:00.000Z",
        approvalEvidence: {
          ...readiness().structuredUi.approvalEvidence,
          approvedAt: "2026-09-02T00:00:00.000Z",
        },
      },
      "cannot be in the future",
    ],
    [
      "expired approval",
      {
        approvalExpiresAt: "2026-08-31T00:00:00.000Z",
        approvalEvidence: {
          ...readiness().structuredUi.approvalEvidence,
          expiresAt: "2026-08-31T00:00:00.000Z",
        },
      },
      "UI approval is expired",
    ],
    [
      "distant approval expiry",
      {
        approvalExpiresAt: "2027-09-02T00:00:00.000Z",
        approvalEvidence: {
          ...readiness().structuredUi.approvalEvidence,
          expiresAt: "2027-09-02T00:00:00.000Z",
        },
      },
      "UI approval expiry is too distant",
    ],
    [
      "invalid approver role",
      { approverRole: "developer" },
      "valid approver role",
    ],
    ["route version missing", { routeVersion: "" }, "routeVersion"],
  ])("rejects %s", (_name, uiOverride, message) => {
    expect(() =>
      assertExactPersonalDataSourceReady(
        readiness({
          structuredUi: {
            ...readiness().structuredUi,
            ...uiOverride,
          },
        }),
        { clock: () => now },
      ),
    ).toThrow(message);
  });

  it.each([
    [
      "stale access review",
      { reviewedAt: "2026-05-31T00:00:00.000Z" },
      "too old",
    ],
    [
      "distant access review",
      { reviewDueAt: "2027-09-02T00:00:00.000Z" },
      "too distant",
    ],
    [
      "stale privacy-owner acceptance",
      {
        acceptedAt: "2025-08-31T00:00:00.000Z",
        acceptanceEvidence: {
          ...readiness().privacyOwnerAcceptance.acceptanceEvidence,
          acceptedAt: "2025-08-31T00:00:00.000Z",
        },
      },
      "privacy-owner acceptance is too old",
    ],
    [
      "expired privacy-owner acceptance",
      {
        expiresAt: "2026-08-31T00:00:00.000Z",
        acceptanceEvidence: {
          ...readiness().privacyOwnerAcceptance.acceptanceEvidence,
          expiresAt: "2026-08-31T00:00:00.000Z",
        },
      },
      "privacy-owner acceptance is expired",
    ],
  ])("rejects %s", (_name, override, message) => {
    const contract = readiness();
    const updated =
      _name === "stale privacy-owner acceptance" ||
      _name === "expired privacy-owner acceptance"
        ? {
            ...contract,
            privacyOwnerAcceptance: {
              ...contract.privacyOwnerAcceptance,
              ...override,
            },
          }
        : {
            ...contract,
            accessReview: { ...contract.accessReview, ...override },
          };
    expect(() =>
      assertExactPersonalDataSourceReady(updated, { clock: () => now }),
    ).toThrow(message);
  });

  it("rejects an expired authorization permit at the registration boundary", async () => {
    const contract = readiness();
    const enablement = await authorizeExactPersonalDataSource(contract, {
      clock: () => now,
    });
    expect(() =>
      assertExactPersonalDataAuthorizationPermit(
        enablement.permit,
        enablement.descriptor,
        {
          clock: () => new Date("2026-10-02T00:00:00.000Z"),
        },
      ),
    ).toThrow("authorization permit is expired");
  });

  it.each([
    [
      "structured UI approval freshness",
      {
        structuredUi: {
          ...readiness().structuredUi,
          authorizedAt: "2026-06-04T00:00:00.000Z",
          approvalExpiresAt: "2027-01-01T00:00:00.000Z",
          approvalEvidence: {
            ...readiness().structuredUi.approvalEvidence,
            approvedAt: "2026-06-04T00:00:00.000Z",
            expiresAt: "2027-01-01T00:00:00.000Z",
          },
        },
      },
    ],
    [
      "structured UI approval explicit expiry",
      {
        structuredUi: {
          ...readiness().structuredUi,
          approvalExpiresAt: "2026-09-02T00:00:00.000Z",
          approvalEvidence: {
            ...readiness().structuredUi.approvalEvidence,
            expiresAt: "2026-09-02T00:00:00.000Z",
          },
        },
      },
    ],
    [
      "access review freshness",
      {
        accessReview: {
          ...readiness().accessReview,
          reviewedAt: "2026-06-04T00:00:00.000Z",
          reviewDueAt: "2027-01-01T00:00:00.000Z",
        },
      },
    ],
    [
      "access review due date",
      {
        accessReview: {
          ...readiness().accessReview,
          reviewDueAt: "2026-09-02T00:00:00.000Z",
        },
      },
    ],
    [
      "privacy-owner acceptance freshness",
      {
        privacyOwnerAcceptance: {
          ...readiness().privacyOwnerAcceptance,
          acceptedAt: "2025-09-02T00:00:00.000Z",
          expiresAt: "2027-01-01T00:00:00.000Z",
          acceptanceEvidence: {
            ...readiness().privacyOwnerAcceptance.acceptanceEvidence,
            acceptedAt: "2025-09-02T00:00:00.000Z",
            expiresAt: "2027-01-01T00:00:00.000Z",
          },
        },
      },
    ],
    [
      "privacy-owner acceptance explicit expiry",
      {
        privacyOwnerAcceptance: {
          ...readiness().privacyOwnerAcceptance,
          expiresAt: "2026-09-02T00:00:00.000Z",
          acceptanceEvidence: {
            ...readiness().privacyOwnerAcceptance.acceptanceEvidence,
            expiresAt: "2026-09-02T00:00:00.000Z",
          },
        },
      },
    ],
  ])(
    "expires the permit at the %s deadline even before explicit expiry",
    async (_name, override) => {
      const enablement = await authorizeExactPersonalDataSource(
        readiness(override),
        { clock: () => now },
      );
      expect(() =>
        assertExactPersonalDataAuthorizationPermit(
          enablement.permit,
          enablement.descriptor,
          { clock: () => new Date("2026-09-02T00:00:00.000Z") },
        ),
      ).toThrow("authorization permit is expired");
    },
  );
});
