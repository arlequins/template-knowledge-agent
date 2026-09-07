import {
  assertExactPersonalDataAuthorizationPermit,
  authorizeExactPersonalDataSource,
  type ExactPersonalDataApprovalVerifierPort,
  type ExactPersonalDataDeletionPort,
  type ExactPersonalDataStructuredUiApprovalEvidence,
  isExactPersonalDataContractRejection,
  type ExactPersonalDataReadiness as Readiness,
} from "./privacy-readiness";

/** Stable, provider-neutral contract cases for derived repository harnesses. */
export const EXACT_PERSONAL_DATA_CONFORMANCE_CASE_IDS = [
  "exact-personal-data.default-deny",
  "exact-personal-data.missing-verifier",
  "exact-personal-data.forged-approval",
  "exact-personal-data.cross-source-approval",
  "exact-personal-data.scope-tenant",
  "exact-personal-data.scope-workspace",
  "exact-personal-data.scope-actor",
  "exact-personal-data.scope-purpose",
  "exact-personal-data.retention-bounds",
  "exact-personal-data.cache-bounds",
  "exact-personal-data.deletion-propagation",
  "exact-personal-data.deletion-source-binding",
  "exact-personal-data.stale-approval",
  "exact-personal-data.future-approval",
  "exact-personal-data.stale-access-review",
  "exact-personal-data.future-access-review",
  "exact-personal-data.stale-owner-acceptance",
  "exact-personal-data.future-owner-acceptance",
  "exact-personal-data.slow-verifier-expiry",
  "exact-personal-data.descriptor-forgery",
  "exact-personal-data.permit-copy",
  "exact-personal-data.descriptor-mutation",
  "exact-personal-data.permit-mutation",
  "exact-personal-data.permit-reuse",
  "exact-personal-data.source-mutation",
  "exact-personal-data.earliest-expiry",
  "exact-personal-data.no-model-context-exposure",
] as const;

export type ExactPersonalDataConformanceCaseId =
  (typeof EXACT_PERSONAL_DATA_CONFORMANCE_CASE_IDS)[number];

export type ExactPersonalDataConformanceIssueCode =
  | "authorization_unexpectedly_succeeded"
  | "authorization_unexpectedly_failed"
  | "scope_not_observed"
  | "deletion_not_idempotent"
  | "deletion_not_audited"
  | "deletion_not_propagated"
  | "model_context_exposed"
  | "permit_not_rejected"
  | "descriptor_not_rejected"
  | "descriptor_not_immutable"
  | "permit_not_immutable"
  | "permit_not_bound"
  | "mutation_not_isolated"
  | "expiry_not_enforced"
  | "unexpected_failure";

export type ExactPersonalDataConformanceCaseResult = Readonly<{
  id: ExactPersonalDataConformanceCaseId;
  issues: readonly Readonly<{ code: ExactPersonalDataConformanceIssueCode }>[];
  status: "passed" | "failed";
}>;

export type ExactPersonalDataConformanceReport = Readonly<{
  cases: readonly ExactPersonalDataConformanceCaseResult[];
  contractVersion: "exact-personal-data-conformance-v1";
  failedCases: number;
  passed: boolean;
  passedCases: number;
}>;

export type ExactPersonalDataConformanceDeletionObservation = Readonly<{
  actorBound: boolean;
  actorAuthenticated: boolean;
  audited: boolean;
  idempotent: boolean;
  propagated: boolean;
  purposeBound: boolean;
  requestCount: number;
  tenantBound: boolean;
  workspaceBound: boolean;
}>;

export type ExactPersonalDataConformanceDeletionRequest = Parameters<
  ExactPersonalDataDeletionPort["requestDeletion"]
>[0];

/**
 * A synthetic-only boundary supplied by a derived application. Its methods
 * intentionally expose booleans and counts, never personal values or raw
 * adapter errors, so the report remains safe to publish in CI artifacts.
 */
export type ExactPersonalDataConformanceAdapter = {
  clock: {
    advance(caseId: ExactPersonalDataConformanceCaseId): void | Promise<void>;
    now(): Date;
  };
  createReadiness(caseId: ExactPersonalDataConformanceCaseId): unknown;
  deletion: {
    createRequest(input: {
      sourceId: string;
    }): ExactPersonalDataConformanceDeletionRequest;
    observe(): ExactPersonalDataConformanceDeletionObservation;
    reset(): void | Promise<void>;
  };
  modelContext: {
    isSourceExcluded(input: { sourceId: string }): boolean | Promise<boolean>;
  };
};

const DELETION_INPUT = {
  actor: {
    authenticated: true as const,
    permissions: ["synthetic:privacy-delete"] as const,
    tenantId: "synthetic-tenant",
    userId: "synthetic-actor",
    workspaceId: "synthetic-workspace",
  },
  purpose: "subject-request" as const,
  requestedBy: "synthetic-actor",
  sourceId: "synthetic-source",
  subjectId: "synthetic-subject",
};

const issue = (
  code: ExactPersonalDataConformanceIssueCode,
): Readonly<{ code: ExactPersonalDataConformanceIssueCode }> =>
  Object.freeze({ code });

function passed(
  id: ExactPersonalDataConformanceCaseId,
): ExactPersonalDataConformanceCaseResult {
  return Object.freeze({ id, issues: Object.freeze([]), status: "passed" });
}

function failed(
  id: ExactPersonalDataConformanceCaseId,
  code: ExactPersonalDataConformanceIssueCode,
): ExactPersonalDataConformanceCaseResult {
  return Object.freeze({
    id,
    issues: Object.freeze([issue(code)]),
    status: "failed",
  });
}

async function authorize(
  adapter: ExactPersonalDataConformanceAdapter,
  caseId: ExactPersonalDataConformanceCaseId,
) {
  const readiness = adapter.createReadiness(caseId);
  const enablement = await authorizeExactPersonalDataSource(readiness, {
    clock: adapter.clock.now,
  });
  return { enablement, readiness };
}

async function expectAuthorizationFailure(
  adapter: ExactPersonalDataConformanceAdapter,
  caseId: ExactPersonalDataConformanceCaseId,
): Promise<ExactPersonalDataConformanceCaseResult> {
  try {
    await authorize(adapter, caseId);
    return failed(caseId, "authorization_unexpectedly_succeeded");
  } catch (error) {
    return isExactPersonalDataContractRejection(error)
      ? passed(caseId)
      : failed(caseId, "unexpected_failure");
  }
}

async function runCase(
  adapter: ExactPersonalDataConformanceAdapter,
  caseId: ExactPersonalDataConformanceCaseId,
): Promise<ExactPersonalDataConformanceCaseResult> {
  try {
    await adapter.deletion.reset();

    if (
      caseId === "exact-personal-data.default-deny" ||
      caseId === "exact-personal-data.missing-verifier" ||
      caseId === "exact-personal-data.forged-approval" ||
      caseId === "exact-personal-data.cross-source-approval" ||
      caseId === "exact-personal-data.retention-bounds" ||
      caseId === "exact-personal-data.cache-bounds" ||
      caseId === "exact-personal-data.stale-approval" ||
      caseId === "exact-personal-data.future-approval" ||
      caseId === "exact-personal-data.stale-access-review" ||
      caseId === "exact-personal-data.future-access-review" ||
      caseId === "exact-personal-data.stale-owner-acceptance" ||
      caseId === "exact-personal-data.future-owner-acceptance" ||
      caseId === "exact-personal-data.slow-verifier-expiry"
    )
      return await expectAuthorizationFailure(adapter, caseId);

    if (
      caseId === "exact-personal-data.scope-tenant" ||
      caseId === "exact-personal-data.scope-workspace" ||
      caseId === "exact-personal-data.scope-actor" ||
      caseId === "exact-personal-data.scope-purpose"
    ) {
      const { enablement } = await authorize(adapter, caseId);
      await enablement.descriptor.deletion.port.requestDeletion(
        adapter.deletion.createRequest({ sourceId: enablement.sourceId }),
      );
      const observation = adapter.deletion.observe();
      const scoped =
        (caseId !== "exact-personal-data.scope-tenant" ||
          observation.tenantBound) &&
        (caseId !== "exact-personal-data.scope-workspace" ||
          observation.workspaceBound) &&
        (caseId !== "exact-personal-data.scope-actor" ||
          observation.actorBound) &&
        (caseId !== "exact-personal-data.scope-purpose" ||
          observation.purposeBound);
      return scoped ? passed(caseId) : failed(caseId, "scope_not_observed");
    }

    if (caseId === "exact-personal-data.deletion-propagation") {
      const { enablement } = await authorize(adapter, caseId);
      const deletionRequest = adapter.deletion.createRequest({
        sourceId: enablement.sourceId,
      });
      await enablement.descriptor.deletion.port.requestDeletion(
        deletionRequest,
      );
      await enablement.descriptor.deletion.port.requestDeletion(
        deletionRequest,
      );
      const observation = adapter.deletion.observe();
      const result = passed(caseId);
      const issues = [
        observation.idempotent ? undefined : issue("deletion_not_idempotent"),
        observation.audited ? undefined : issue("deletion_not_audited"),
        observation.propagated ? undefined : issue("deletion_not_propagated"),
      ].filter(
        (
          value,
        ): value is Readonly<{ code: ExactPersonalDataConformanceIssueCode }> =>
          value !== undefined,
      );
      return issues.length === 0
        ? result
        : Object.freeze({
            id: caseId,
            issues: Object.freeze(issues),
            status: "failed",
          });
    }

    if (caseId === "exact-personal-data.deletion-source-binding") {
      const { enablement } = await authorize(adapter, caseId);
      const deletionRequest = adapter.deletion.createRequest({
        sourceId: enablement.sourceId,
      });
      const forgedSourceId = `${enablement.sourceId}::conformance-forged`;
      try {
        await enablement.descriptor.deletion.port.requestDeletion({
          ...deletionRequest,
          sourceId: forgedSourceId,
        });
        return failed(caseId, "authorization_unexpectedly_succeeded");
      } catch (error) {
        return isExactPersonalDataContractRejection(error)
          ? passed(caseId)
          : failed(caseId, "unexpected_failure");
      }
    }

    if (caseId === "exact-personal-data.no-model-context-exposure") {
      const { enablement } = await authorize(adapter, caseId);
      return (await adapter.modelContext.isSourceExcluded({
        sourceId: enablement.sourceId,
      }))
        ? passed(caseId)
        : failed(caseId, "model_context_exposed");
    }

    if (caseId === "exact-personal-data.earliest-expiry") {
      const { enablement } = await authorize(adapter, caseId);
      await adapter.clock.advance(caseId);
      try {
        assertExactPersonalDataAuthorizationPermit(
          enablement.permit,
          enablement.descriptor,
          { clock: adapter.clock.now },
        );
        return failed(caseId, "expiry_not_enforced");
      } catch (error) {
        return isExactPersonalDataContractRejection(error)
          ? passed(caseId)
          : failed(caseId, "unexpected_failure");
      }
    }

    if (caseId === "exact-personal-data.descriptor-forgery") {
      const { enablement } = await authorize(adapter, caseId);
      try {
        assertExactPersonalDataAuthorizationPermit(
          enablement.permit,
          { ...enablement.descriptor },
          { clock: adapter.clock.now },
        );
        return failed(caseId, "descriptor_not_rejected");
      } catch (error) {
        return isExactPersonalDataContractRejection(error)
          ? passed(caseId)
          : failed(caseId, "unexpected_failure");
      }
    }

    if (caseId === "exact-personal-data.permit-copy") {
      const { enablement } = await authorize(adapter, caseId);
      try {
        assertExactPersonalDataAuthorizationPermit(
          { ...enablement.permit },
          enablement.descriptor,
          { clock: adapter.clock.now },
        );
        return failed(caseId, "permit_not_rejected");
      } catch (error) {
        return isExactPersonalDataContractRejection(error)
          ? passed(caseId)
          : failed(caseId, "unexpected_failure");
      }
    }

    if (caseId === "exact-personal-data.descriptor-mutation") {
      const { enablement } = await authorize(adapter, caseId);
      return Object.isFrozen(enablement.descriptor)
        ? passed(caseId)
        : failed(caseId, "descriptor_not_immutable");
    }

    if (caseId === "exact-personal-data.permit-mutation") {
      const { enablement } = await authorize(adapter, caseId);
      return Object.isFrozen(enablement.permit)
        ? passed(caseId)
        : failed(caseId, "permit_not_immutable");
    }

    if (caseId === "exact-personal-data.permit-reuse") {
      const first = await authorize(adapter, caseId);
      const second = await authorize(adapter, caseId);
      try {
        assertExactPersonalDataAuthorizationPermit(
          first.enablement.permit,
          second.enablement.descriptor,
          { clock: adapter.clock.now },
        );
        return failed(caseId, "permit_not_bound");
      } catch (error) {
        return isExactPersonalDataContractRejection(error)
          ? passed(caseId)
          : failed(caseId, "unexpected_failure");
      }
    }

    if (caseId === "exact-personal-data.source-mutation") {
      const { enablement, readiness } = await authorize(adapter, caseId);
      (readiness as Readiness).structuredUi.routeVersion = "forged-version";
      try {
        const descriptor = assertExactPersonalDataAuthorizationPermit(
          enablement.permit,
          enablement.descriptor,
          { clock: adapter.clock.now },
        );
        return descriptor.structuredUi.routeVersion === "synthetic-v1"
          ? passed(caseId)
          : failed(caseId, "mutation_not_isolated");
      } catch {
        return failed(caseId, "mutation_not_isolated");
      }
    }

    return failed(caseId, "unexpected_failure");
  } catch {
    return failed(caseId, "unexpected_failure");
  }
}

/** Execute every deterministic synthetic conformance case. */
export async function runExactPersonalDataConformance(
  adapter: ExactPersonalDataConformanceAdapter,
): Promise<ExactPersonalDataConformanceReport> {
  const cases = [] as ExactPersonalDataConformanceCaseResult[];
  for (const caseId of EXACT_PERSONAL_DATA_CONFORMANCE_CASE_IDS)
    cases.push(await runCase(adapter, caseId));
  const frozenCases = Object.freeze(cases);
  const passedCases = cases.filter((value) => value.status === "passed").length;
  const failedCases = cases.length - passedCases;
  return Object.freeze({
    cases: frozenCases,
    contractVersion: "exact-personal-data-conformance-v1" as const,
    failedCases,
    passed: failedCases === 0,
    passedCases,
  });
}

type SyntheticState = {
  auditEvents: number;
  deletionEffects: number;
  replicasDeleted: boolean;
  requests: number;
  scope: ExactPersonalDataConformanceDeletionObservation;
};

const SYNTHETIC_NOW = new Date("2026-09-01T00:00:00.000Z");
const SYNTHETIC_EXPIRED_AT = "2026-09-02T00:00:00.000Z";

/**
 * Public synthetic fixture for CI and derived-repository contract checks.
 * It contains no real personal data, credentials, or provider SDK state.
 */
export function createSyntheticExactPersonalDataConformanceAdapter(): ExactPersonalDataConformanceAdapter {
  let currentNow = new Date(SYNTHETIC_NOW);
  let state = createSyntheticState();
  const reset = () => {
    currentNow = new Date(SYNTHETIC_NOW);
    state = createSyntheticState();
  };
  const clock = {
    now: () => new Date(currentNow),
    advance: (caseId: ExactPersonalDataConformanceCaseId) => {
      if (
        caseId === "exact-personal-data.earliest-expiry" ||
        caseId === "exact-personal-data.slow-verifier-expiry"
      )
        currentNow = new Date(SYNTHETIC_EXPIRED_AT);
    },
  };
  return {
    clock,
    createReadiness: (caseId) => createSyntheticReadiness(caseId, clock, state),
    deletion: {
      createRequest: ({ sourceId }) => ({ ...DELETION_INPUT, sourceId }),
      observe: () => state.scope,
      reset,
    },
    modelContext: {
      isSourceExcluded: () => true,
    },
  };
}

function createSyntheticState(): SyntheticState {
  return {
    auditEvents: 0,
    deletionEffects: 0,
    replicasDeleted: false,
    requests: 0,
    scope: {
      actorAuthenticated: false,
      actorBound: false,
      audited: false,
      idempotent: false,
      propagated: false,
      purposeBound: false,
      requestCount: 0,
      tenantBound: false,
      workspaceBound: false,
    },
  };
}

function createSyntheticReadiness(
  caseId: ExactPersonalDataConformanceCaseId,
  clock: {
    now(): Date;
    advance(caseId: ExactPersonalDataConformanceCaseId): void;
  },
  state: SyntheticState,
): Readiness | undefined {
  if (caseId === "exact-personal-data.default-deny") return undefined;
  const sourceId = "synthetic-source";
  const requestDeletion = async (
    input: Parameters<Readiness["deletion"]["port"]["requestDeletion"]>[0],
  ) => {
    state.requests += 1;
    state.scope = {
      ...state.scope,
      actorAuthenticated: input.actor.authenticated === true,
      actorBound:
        input.actor.authenticated === true &&
        input.actor.userId === "synthetic-actor" &&
        input.requestedBy === "synthetic-actor",
      purposeBound: input.purpose === "subject-request",
      requestCount: state.requests,
      tenantBound: input.actor.tenantId === "synthetic-tenant",
      workspaceBound: input.actor.workspaceId === "synthetic-workspace",
    };
    if (state.deletionEffects === 0) {
      state.deletionEffects = 1;
      state.auditEvents += 1;
      state.replicasDeleted = true;
    }
    state.scope = {
      ...state.scope,
      audited: state.auditEvents === 1,
      idempotent: state.requests >= 2 && state.deletionEffects === 1,
      propagated: state.replicasDeleted,
    };
  };
  const structuredUi = {
    authorization: "explicit" as const,
    authorizedAt: "2026-08-31T00:00:00.000Z",
    authorizedBy: "synthetic-security-reviewer",
    approverRole: "security-reviewer" as const,
    approvalExpiresAt: "2026-10-01T00:00:00.000Z",
    approvalEvidence: {
      approvalId: "synthetic-ui-approval",
      approverRole: "security-reviewer" as const,
      approvedAt: "2026-08-31T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      policyVersion: "synthetic-policy-v1",
      route: "synthetic-contact-card",
      routeVersion: "synthetic-v1",
      sourceId,
      subject: "synthetic-security-reviewer",
    },
    modelAccess: "excluded" as const,
    route: "synthetic-contact-card",
    routeVersion: "synthetic-v1",
    transport: "non-model" as const,
  };
  const acceptance = {
    accepted: true as const,
    acceptedAt: "2026-08-31T00:00:00.000Z",
    acceptanceEvidence: {
      acceptanceId: "synthetic-owner-acceptance",
      acceptedAt: "2026-08-31T00:00:00.000Z",
      approverRole: "privacy-owner" as const,
      expiresAt: "2026-10-01T00:00:00.000Z",
      policyVersion: "synthetic-policy-v1",
      sourceId,
      subject: "synthetic-privacy-owner",
    },
    expiresAt: "2026-10-01T00:00:00.000Z",
    ownerId: "synthetic-privacy-owner",
  };
  const verifier: ExactPersonalDataApprovalVerifierPort = {
    verifyPrivacyOwnerAcceptance: (input) => input.evidence,
    verifyStructuredUi: async (input) => {
      const { evidence } = input;
      if (caseId === "exact-personal-data.slow-verifier-expiry") {
        await Promise.resolve();
        clock.advance(caseId);
      }
      if (
        caseId === "exact-personal-data.forged-approval" &&
        typeof evidence === "object" &&
        evidence !== null
      )
        return {
          ...evidence,
          subject: "synthetic-forged-subject",
        } as ExactPersonalDataStructuredUiApprovalEvidence;
      return evidence;
    },
  };
  const result: Readiness = {
    accessReview: {
      reviewDueAt: "2026-10-01T00:00:00.000Z",
      reviewedAt: "2026-08-31T00:00:00.000Z",
      reviewerId: "synthetic-security-reviewer",
    },
    deletion: {
      port: { requestDeletion },
      workflowId: "synthetic-deletion-v1",
    },
    privacyOwnerAcceptance: acceptance,
    retention: { cacheMaxMinutes: 15, maxDays: 30 },
    approvalVerifier: verifier,
    sourceId,
    structuredUi,
  };

  switch (caseId) {
    case "exact-personal-data.missing-verifier":
      return { ...result, approvalVerifier: undefined as never };
    case "exact-personal-data.cross-source-approval":
      return {
        ...result,
        structuredUi: {
          ...structuredUi,
          approvalEvidence: {
            ...structuredUi.approvalEvidence,
            sourceId: "synthetic-other-source",
          },
        },
      };
    case "exact-personal-data.retention-bounds":
      return { ...result, retention: { cacheMaxMinutes: 15, maxDays: 0 } };
    case "exact-personal-data.cache-bounds":
      return { ...result, retention: { cacheMaxMinutes: 61, maxDays: 30 } };
    case "exact-personal-data.stale-approval":
      return {
        ...result,
        structuredUi: {
          ...structuredUi,
          authorizedAt: "2026-05-31T00:00:00.000Z",
          approvalEvidence: {
            ...structuredUi.approvalEvidence,
            approvedAt: "2026-05-31T00:00:00.000Z",
          },
        },
      };
    case "exact-personal-data.future-approval":
      return {
        ...result,
        structuredUi: {
          ...structuredUi,
          authorizedAt: SYNTHETIC_EXPIRED_AT,
          approvalEvidence: {
            ...structuredUi.approvalEvidence,
            approvedAt: SYNTHETIC_EXPIRED_AT,
          },
        },
      };
    case "exact-personal-data.stale-access-review":
      return {
        ...result,
        accessReview: {
          ...result.accessReview,
          reviewedAt: "2026-05-31T00:00:00.000Z",
        },
      };
    case "exact-personal-data.future-access-review":
      return {
        ...result,
        accessReview: {
          ...result.accessReview,
          reviewedAt: SYNTHETIC_EXPIRED_AT,
        },
      };
    case "exact-personal-data.stale-owner-acceptance":
      return {
        ...result,
        privacyOwnerAcceptance: {
          ...acceptance,
          acceptedAt: "2025-08-31T00:00:00.000Z",
          acceptanceEvidence: {
            ...acceptance.acceptanceEvidence,
            acceptedAt: "2025-08-31T00:00:00.000Z",
          },
        },
      };
    case "exact-personal-data.future-owner-acceptance":
      return {
        ...result,
        privacyOwnerAcceptance: {
          ...acceptance,
          acceptedAt: SYNTHETIC_EXPIRED_AT,
          acceptanceEvidence: {
            ...acceptance.acceptanceEvidence,
            acceptedAt: SYNTHETIC_EXPIRED_AT,
          },
        },
      };
    case "exact-personal-data.earliest-expiry":
    case "exact-personal-data.slow-verifier-expiry":
      return {
        ...result,
        structuredUi: {
          ...structuredUi,
          approvalExpiresAt: SYNTHETIC_EXPIRED_AT,
          approvalEvidence: {
            ...structuredUi.approvalEvidence,
            expiresAt: SYNTHETIC_EXPIRED_AT,
          },
        },
      };
    case "exact-personal-data.descriptor-forgery":
    case "exact-personal-data.permit-copy":
    case "exact-personal-data.descriptor-mutation":
    case "exact-personal-data.permit-mutation":
    case "exact-personal-data.permit-reuse":
    case "exact-personal-data.source-mutation":
      return result;
    default:
      return result;
  }
}
