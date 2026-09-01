/**
 * Provider-neutral acceptance contract for exact personal-data sources.
 *
 * The template never enables an exact personal-data source by default. A
 * derived application must provide an explicit, current contract and pass it
 * through `authorizeExactPersonalDataSource` at its application boundary.
 * Exact values still belong outside model context and conversation history.
 */

export const MAX_EXACT_PERSONAL_DATA_RETENTION_DAYS = 3_650;
export const MAX_EXACT_PERSONAL_DATA_CACHE_MINUTES = 60;
export const MAX_EXACT_PERSONAL_DATA_ACCESS_REVIEW_AGE_DAYS = 90;
export const MAX_EXACT_PERSONAL_DATA_ACCESS_REVIEW_HORIZON_DAYS = 365;
export const MAX_EXACT_PERSONAL_DATA_STRUCTURED_UI_APPROVAL_AGE_DAYS = 90;
export const MAX_EXACT_PERSONAL_DATA_STRUCTURED_UI_APPROVAL_HORIZON_DAYS = 365;
export const MAX_EXACT_PERSONAL_DATA_PRIVACY_OWNER_ACCEPTANCE_AGE_DAYS = 365;
export const MAX_EXACT_PERSONAL_DATA_PRIVACY_OWNER_ACCEPTANCE_HORIZON_DAYS = 365;

const DAY_IN_MS = 86_400_000;

declare const exactPersonalDataAuthorizationBrand: unique symbol;

/** A module-issued permit; its runtime identity cannot be recreated by callers. */
export type ExactPersonalDataAuthorizationPermit = {
  readonly [exactPersonalDataAuthorizationBrand]: "exact-personal-data";
};

export type ExactPersonalDataStructuredUiApproverRole =
  | "data-owner"
  | "privacy-owner"
  | "security-reviewer";

export type ExactPersonalDataStructuredUiApprovalEvidence = {
  approvalId: string;
  approverRole: ExactPersonalDataStructuredUiApproverRole;
  approvedAt: string;
  expiresAt: string;
  policyVersion: string;
  route: string;
  routeVersion: string;
  sourceId: string;
  subject: string;
};

export type ExactPersonalDataPrivacyOwnerAcceptanceEvidence = {
  acceptanceId: string;
  acceptedAt: string;
  approverRole: "privacy-owner";
  expiresAt: string;
  policyVersion: string;
  sourceId: string;
  subject: string;
};

export type ExactPersonalDataApprovalVerifierPort = {
  verifyPrivacyOwnerAcceptance(input: {
    evidence: ExactPersonalDataPrivacyOwnerAcceptanceEvidence;
    sourceId: string;
  }):
    | ExactPersonalDataPrivacyOwnerAcceptanceEvidence
    | false
    | Promise<ExactPersonalDataPrivacyOwnerAcceptanceEvidence | false>;
  verifyStructuredUi(input: {
    evidence: ExactPersonalDataStructuredUiApprovalEvidence;
    sourceId: string;
  }):
    | ExactPersonalDataStructuredUiApprovalEvidence
    | false
    | Promise<ExactPersonalDataStructuredUiApprovalEvidence | false>;
};

export type ExactPersonalDataRegistrationDescriptor = Readonly<{
  accessReview: Readonly<ExactPersonalDataReadiness["accessReview"]>;
  deletion: Readonly<{
    port: Readonly<ExactPersonalDataDeletionPort>;
    workflowId: string;
  }>;
  privacyOwnerAcceptance: Readonly<
    Omit<
      ExactPersonalDataReadiness["privacyOwnerAcceptance"],
      "acceptanceEvidence"
    > & {
      acceptanceEvidence: Readonly<ExactPersonalDataPrivacyOwnerAcceptanceEvidence>;
    }
  >;
  retention: Readonly<ExactPersonalDataReadiness["retention"]>;
  sourceId: string;
  structuredUi: Readonly<
    Omit<ExactPersonalDataReadiness["structuredUi"], "approvalEvidence"> & {
      approvalEvidence: Readonly<ExactPersonalDataStructuredUiApprovalEvidence>;
    }
  >;
}>;

type ExactPersonalDataReadinessSnapshot = {
  approvalVerifier: ExactPersonalDataApprovalVerifierPort;
  verifyPrivacyOwnerAcceptance: ExactPersonalDataApprovalVerifierPort["verifyPrivacyOwnerAcceptance"];
  verifyStructuredUi: ExactPersonalDataApprovalVerifierPort["verifyStructuredUi"];
  deletionPort: ExactPersonalDataDeletionPort;
  requestDeletion: ExactPersonalDataDeletionPort["requestDeletion"];
  descriptor: ExactPersonalDataRegistrationDescriptor;
};

const authorizationPermitMetadata = new WeakMap<
  object,
  {
    descriptor: ExactPersonalDataRegistrationDescriptor;
    expiresAt: string;
    snapshot: ExactPersonalDataReadinessSnapshot;
  }
>();

export type ExactPersonalDataStructuredUiContract = {
  authorization: "explicit";
  authorizedAt: string;
  authorizedBy: string;
  approverRole: ExactPersonalDataStructuredUiApproverRole;
  approvalExpiresAt: string;
  approvalEvidence: ExactPersonalDataStructuredUiApprovalEvidence;
  modelAccess: "excluded";
  route: string;
  routeVersion: string;
  transport: "non-model";
};

export type ExactPersonalDataDeletionPort = {
  requestDeletion(input: {
    actor: {
      authenticated: true;
      permissions: readonly string[];
      tenantId: string;
      userId: string;
      workspaceId: string;
    };
    purpose:
      | "administrative-review"
      | "incident-response"
      | "retention-expiry"
      | "subject-request";
    requestedBy: string;
    sourceId: string;
    subjectId: string;
  }): Promise<void>;
};

export type ExactPersonalDataReadiness = {
  accessReview: {
    reviewDueAt: string;
    reviewedAt: string;
    reviewerId: string;
  };
  deletion: {
    port: ExactPersonalDataDeletionPort;
    workflowId: string;
  };
  privacyOwnerAcceptance: {
    accepted: true;
    acceptedAt: string;
    acceptanceEvidence: ExactPersonalDataPrivacyOwnerAcceptanceEvidence;
    expiresAt: string;
    ownerId: string;
  };
  retention: {
    cacheMaxMinutes: number;
    maxDays: number;
  };
  approvalVerifier: ExactPersonalDataApprovalVerifierPort;
  sourceId: string;
  structuredUi: ExactPersonalDataStructuredUiContract;
};

export type ExactPersonalDataEnablement = {
  descriptor: ExactPersonalDataRegistrationDescriptor;
  enabled: true;
  permit: ExactPersonalDataAuthorizationPermit;
  sourceId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Exact personal-data readiness requires ${label}`);
  return value;
}

function requireIsoDate(value: unknown, label: string): Date {
  const text = requireNonEmptyString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text))
    throw new Error(
      `${label} must be a canonical RFC3339 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)`,
    );
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== text)
    throw new Error(`Invalid ${label} in exact personal-data readiness`);
  return date;
}

function requireCurrentDate(value: unknown, label: string, now: Date): Date {
  const date = requireIsoDate(value, label);
  if (date.getTime() > now.getTime())
    throw new Error(`${label} cannot be in the future`);
  return date;
}

function isStructuredUiApproverRole(
  value: unknown,
): value is ExactPersonalDataStructuredUiApproverRole {
  return (
    value === "data-owner" ||
    value === "privacy-owner" ||
    value === "security-reviewer"
  );
}

function requireApprovalVerifier(
  value: unknown,
): ExactPersonalDataApprovalVerifierPort {
  if (
    !isRecord(value) ||
    typeof value.verifyStructuredUi !== "function" ||
    typeof value.verifyPrivacyOwnerAcceptance !== "function"
  )
    throw new Error(
      "Exact personal-data source requires an approval identity verifier",
    );
  return value as ExactPersonalDataApprovalVerifierPort;
}

function requireMatchingString(
  actual: unknown,
  expected: unknown,
  label: string,
): string {
  const value = requireNonEmptyString(actual, label);
  if (value !== expected)
    throw new Error(`Exact personal-data approval evidence mismatch: ${label}`);
  return value;
}

/**
 * Validate every production prerequisite for exact personal-data access.
 *
 * This function intentionally accepts `unknown`: configuration loaded from a
 * derived application's environment or deployment manifest must not be
 * trusted merely because it was cast to a TypeScript type. Missing or stale
 * evidence fails closed.
 */
export function assertExactPersonalDataSourceReady(
  value: unknown,
  options: { clock?: () => Date } = {},
): asserts value is ExactPersonalDataReadiness {
  const now = options.clock?.() ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime()))
    throw new Error("Exact personal-data readiness clock must be valid");
  if (!isRecord(value))
    throw new Error("Exact personal-data source is disabled without readiness");

  const sourceId = requireNonEmptyString(value.sourceId, "sourceId");
  if (sourceId.length > 128)
    throw new Error("Exact personal-data sourceId is too long");
  requireApprovalVerifier(value.approvalVerifier);

  const structuredUi = value.structuredUi;
  if (!isRecord(structuredUi))
    throw new Error(
      "Exact personal-data source requires structured UI approval",
    );
  if (structuredUi.transport !== "non-model")
    throw new Error("Exact personal-data UI must use non-model transport");
  if (structuredUi.modelAccess !== "excluded")
    throw new Error(
      "Exact personal-data UI must be excluded from model context",
    );
  if (structuredUi.authorization !== "explicit")
    throw new Error("Exact personal-data UI requires explicit authorization");
  const uiRoute = requireNonEmptyString(
    structuredUi.route,
    "structuredUi.route",
  );
  const uiRouteVersion = requireNonEmptyString(
    structuredUi.routeVersion,
    "structuredUi.routeVersion",
  );
  const uiAuthorizedBy = requireNonEmptyString(
    structuredUi.authorizedBy,
    "structuredUi.authorizedBy",
  );
  if (!isStructuredUiApproverRole(structuredUi.approverRole))
    throw new Error("Exact personal-data UI requires a valid approver role");
  const uiApprovalEvidence = structuredUi.approvalEvidence;
  if (!isRecord(uiApprovalEvidence))
    throw new Error("Exact personal-data UI requires approval evidence");
  requireNonEmptyString(uiApprovalEvidence.approvalId, "approvalId");
  requireMatchingString(
    uiApprovalEvidence.sourceId,
    sourceId,
    "approvalEvidence.sourceId",
  );
  requireMatchingString(
    uiApprovalEvidence.subject,
    uiAuthorizedBy,
    "approvalEvidence.subject",
  );
  requireNonEmptyString(
    uiApprovalEvidence.policyVersion,
    "approvalEvidence.policyVersion",
  );
  if (uiApprovalEvidence.approverRole !== structuredUi.approverRole)
    throw new Error(
      "Exact personal-data UI approval evidence mismatch: approverRole",
    );
  requireMatchingString(
    uiApprovalEvidence.route,
    uiRoute,
    "approvalEvidence.route",
  );
  requireMatchingString(
    uiApprovalEvidence.routeVersion,
    uiRouteVersion,
    "approvalEvidence.routeVersion",
  );
  const uiAuthorizedAt = requireCurrentDate(
    structuredUi.authorizedAt,
    "structuredUi.authorizedAt",
    now,
  );
  const uiApprovalExpiresAt = requireIsoDate(
    structuredUi.approvalExpiresAt,
    "structuredUi.approvalExpiresAt",
  );
  requireMatchingString(
    uiApprovalEvidence.approvedAt,
    structuredUi.authorizedAt,
    "approvalEvidence.approvedAt",
  );
  requireMatchingString(
    uiApprovalEvidence.expiresAt,
    structuredUi.approvalExpiresAt,
    "approvalEvidence.expiresAt",
  );
  if (
    now.getTime() - uiAuthorizedAt.getTime() >
    MAX_EXACT_PERSONAL_DATA_STRUCTURED_UI_APPROVAL_AGE_DAYS * DAY_IN_MS
  )
    throw new Error("Exact personal-data UI approval is too old");
  if (uiApprovalExpiresAt.getTime() <= now.getTime())
    throw new Error("Exact personal-data UI approval is expired");
  if (
    uiApprovalExpiresAt.getTime() - now.getTime() >
    MAX_EXACT_PERSONAL_DATA_STRUCTURED_UI_APPROVAL_HORIZON_DAYS * DAY_IN_MS
  )
    throw new Error("Exact personal-data UI approval expiry is too distant");
  if (uiApprovalExpiresAt.getTime() <= uiAuthorizedAt.getTime())
    throw new Error("Exact personal-data UI approval expiry is invalid");

  const retention = value.retention;
  if (!isRecord(retention))
    throw new Error("Exact personal-data source requires retention controls");
  const maxDays = retention.maxDays;
  if (
    typeof maxDays !== "number" ||
    !Number.isInteger(maxDays) ||
    maxDays < 1 ||
    maxDays > MAX_EXACT_PERSONAL_DATA_RETENTION_DAYS
  )
    throw new Error(
      `Exact personal-data retention must be between 1 and ${MAX_EXACT_PERSONAL_DATA_RETENTION_DAYS} days`,
    );
  const cacheMaxMinutes = retention.cacheMaxMinutes;
  if (
    typeof cacheMaxMinutes !== "number" ||
    !Number.isInteger(cacheMaxMinutes) ||
    cacheMaxMinutes < 0 ||
    cacheMaxMinutes > MAX_EXACT_PERSONAL_DATA_CACHE_MINUTES
  )
    throw new Error(
      `Exact personal-data cache retention must be between 0 and ${MAX_EXACT_PERSONAL_DATA_CACHE_MINUTES} minutes`,
    );

  const deletion = value.deletion;
  if (!isRecord(deletion))
    throw new Error("Exact personal-data source requires a deletion workflow");
  requireNonEmptyString(deletion.workflowId, "deletion.workflowId");
  if (
    !isRecord(deletion.port) ||
    typeof deletion.port.requestDeletion !== "function"
  )
    throw new Error("Exact personal-data source requires a deletion port");

  const accessReview = value.accessReview;
  if (!isRecord(accessReview))
    throw new Error("Exact personal-data source requires access review");
  requireNonEmptyString(accessReview.reviewerId, "accessReview.reviewerId");
  const reviewedAt = requireCurrentDate(
    accessReview.reviewedAt,
    "accessReview.reviewedAt",
    now,
  );
  const reviewDueAt = requireIsoDate(
    accessReview.reviewDueAt,
    "accessReview.reviewDueAt",
  );
  if (
    now.getTime() - reviewedAt.getTime() >
    MAX_EXACT_PERSONAL_DATA_ACCESS_REVIEW_AGE_DAYS * DAY_IN_MS
  )
    throw new Error("Exact personal-data access review is too old");
  if (reviewDueAt.getTime() <= now.getTime())
    throw new Error("Exact personal-data access review is expired");
  if (
    reviewDueAt.getTime() - now.getTime() >
    MAX_EXACT_PERSONAL_DATA_ACCESS_REVIEW_HORIZON_DAYS * DAY_IN_MS
  )
    throw new Error(
      "Exact personal-data access review due date is too distant",
    );
  if (reviewDueAt.getTime() <= reviewedAt.getTime())
    throw new Error("Exact personal-data access review due date is invalid");

  const acceptance = value.privacyOwnerAcceptance;
  if (!isRecord(acceptance) || acceptance.accepted !== true)
    throw new Error(
      "Exact personal-data source requires privacy-owner acceptance",
    );
  requireNonEmptyString(acceptance.ownerId, "privacyOwnerAcceptance.ownerId");
  const acceptanceEvidence = acceptance.acceptanceEvidence;
  if (!isRecord(acceptanceEvidence))
    throw new Error(
      "Exact personal-data source requires privacy-owner acceptance evidence",
    );
  requireNonEmptyString(acceptanceEvidence.acceptanceId, "acceptanceId");
  requireMatchingString(
    acceptanceEvidence.subject,
    acceptance.ownerId,
    "acceptanceEvidence.subject",
  );
  if (acceptanceEvidence.approverRole !== "privacy-owner")
    throw new Error(
      "Exact personal-data acceptance evidence requires privacy-owner role",
    );
  requireNonEmptyString(
    acceptanceEvidence.policyVersion,
    "acceptanceEvidence.policyVersion",
  );
  requireMatchingString(
    acceptanceEvidence.sourceId,
    sourceId,
    "acceptanceEvidence.sourceId",
  );
  requireCurrentDate(
    acceptance.acceptedAt,
    "privacyOwnerAcceptance.acceptedAt",
    now,
  );
  const acceptedAt = requireIsoDate(
    acceptance.acceptedAt,
    "privacyOwnerAcceptance.acceptedAt",
  );
  const acceptanceExpiresAt = requireIsoDate(
    acceptance.expiresAt,
    "privacyOwnerAcceptance.expiresAt",
  );
  requireMatchingString(
    acceptanceEvidence.acceptedAt,
    acceptance.acceptedAt,
    "acceptanceEvidence.acceptedAt",
  );
  requireMatchingString(
    acceptanceEvidence.expiresAt,
    acceptance.expiresAt,
    "acceptanceEvidence.expiresAt",
  );
  if (
    now.getTime() - acceptedAt.getTime() >
    MAX_EXACT_PERSONAL_DATA_PRIVACY_OWNER_ACCEPTANCE_AGE_DAYS * DAY_IN_MS
  )
    throw new Error("Exact personal-data privacy-owner acceptance is too old");
  if (acceptanceExpiresAt.getTime() <= now.getTime())
    throw new Error("Exact personal-data privacy-owner acceptance is expired");
  if (
    acceptanceExpiresAt.getTime() - now.getTime() >
    MAX_EXACT_PERSONAL_DATA_PRIVACY_OWNER_ACCEPTANCE_HORIZON_DAYS * DAY_IN_MS
  )
    throw new Error(
      "Exact personal-data privacy-owner acceptance expiry is too distant",
    );
  if (acceptanceExpiresAt.getTime() <= acceptedAt.getTime())
    throw new Error(
      "Exact personal-data privacy-owner acceptance expiry is invalid",
    );
}

async function verifyApprovalEvidence(
  value: ExactPersonalDataReadiness,
): Promise<void> {
  const verifier = requireApprovalVerifier(value.approvalVerifier);
  let structuredUiResult: ExactPersonalDataStructuredUiApprovalEvidence | false;
  try {
    structuredUiResult = await verifier.verifyStructuredUi({
      evidence: value.structuredUi.approvalEvidence,
      sourceId: value.sourceId,
    });
  } catch {
    throw new Error("Exact personal-data structured-UI verifier failed");
  }
  if (
    !approvalEvidenceMatches(
      structuredUiResult,
      value.structuredUi.approvalEvidence,
    )
  )
    throw new Error(
      "Exact personal-data structured-UI verifier rejected or returned mismatched evidence",
    );

  let privacyOwnerResult:
    | ExactPersonalDataPrivacyOwnerAcceptanceEvidence
    | false;
  try {
    privacyOwnerResult = await verifier.verifyPrivacyOwnerAcceptance({
      evidence: value.privacyOwnerAcceptance.acceptanceEvidence,
      sourceId: value.sourceId,
    });
  } catch {
    throw new Error("Exact personal-data privacy-owner verifier failed");
  }
  if (
    !privacyOwnerEvidenceMatches(
      privacyOwnerResult,
      value.privacyOwnerAcceptance.acceptanceEvidence,
    )
  )
    throw new Error(
      "Exact personal-data privacy-owner verifier rejected or returned mismatched evidence",
    );
}

function approvalEvidenceMatches(
  actual: unknown,
  expected: ExactPersonalDataStructuredUiApprovalEvidence,
): boolean {
  return (
    isRecord(actual) &&
    actual.approvalId === expected.approvalId &&
    actual.approverRole === expected.approverRole &&
    actual.approvedAt === expected.approvedAt &&
    actual.expiresAt === expected.expiresAt &&
    actual.policyVersion === expected.policyVersion &&
    actual.route === expected.route &&
    actual.routeVersion === expected.routeVersion &&
    actual.sourceId === expected.sourceId &&
    actual.subject === expected.subject
  );
}

function privacyOwnerEvidenceMatches(
  actual: unknown,
  expected: ExactPersonalDataPrivacyOwnerAcceptanceEvidence,
): boolean {
  return (
    isRecord(actual) &&
    actual.acceptanceId === expected.acceptanceId &&
    actual.acceptedAt === expected.acceptedAt &&
    actual.approverRole === expected.approverRole &&
    actual.expiresAt === expected.expiresAt &&
    actual.policyVersion === expected.policyVersion &&
    actual.sourceId === expected.sourceId &&
    actual.subject === expected.subject
  );
}

function createRegistrationDescriptor(
  value: ExactPersonalDataReadiness,
): ExactPersonalDataRegistrationDescriptor {
  return Object.freeze({
    accessReview: Object.freeze({ ...value.accessReview }),
    deletion: Object.freeze({
      port: Object.freeze({
        requestDeletion: value.deletion.port.requestDeletion,
      }),
      workflowId: value.deletion.workflowId,
    }),
    privacyOwnerAcceptance: Object.freeze({
      ...value.privacyOwnerAcceptance,
      acceptanceEvidence: Object.freeze({
        ...value.privacyOwnerAcceptance.acceptanceEvidence,
      }),
    }),
    retention: Object.freeze({ ...value.retention }),
    sourceId: value.sourceId,
    structuredUi: Object.freeze({
      ...value.structuredUi,
      approvalEvidence: Object.freeze({
        ...value.structuredUi.approvalEvidence,
      }),
    }),
  });
}

function createReadinessSnapshot(
  value: ExactPersonalDataReadiness,
  descriptor: ExactPersonalDataRegistrationDescriptor,
): ExactPersonalDataReadinessSnapshot {
  return Object.freeze({
    approvalVerifier: value.approvalVerifier,
    verifyPrivacyOwnerAcceptance:
      value.approvalVerifier.verifyPrivacyOwnerAcceptance,
    verifyStructuredUi: value.approvalVerifier.verifyStructuredUi,
    deletionPort: value.deletion.port,
    requestDeletion: value.deletion.port.requestDeletion,
    descriptor,
  });
}

function getPermitExpiry(value: ExactPersonalDataReadiness): string {
  const deadlines = [
    new Date(value.structuredUi.authorizedAt).getTime() +
      MAX_EXACT_PERSONAL_DATA_STRUCTURED_UI_APPROVAL_AGE_DAYS * DAY_IN_MS,
    new Date(value.structuredUi.approvalExpiresAt).getTime(),
    new Date(value.accessReview.reviewedAt).getTime() +
      MAX_EXACT_PERSONAL_DATA_ACCESS_REVIEW_AGE_DAYS * DAY_IN_MS,
    new Date(value.accessReview.reviewDueAt).getTime(),
    new Date(value.privacyOwnerAcceptance.acceptedAt).getTime() +
      MAX_EXACT_PERSONAL_DATA_PRIVACY_OWNER_ACCEPTANCE_AGE_DAYS * DAY_IN_MS,
    new Date(value.privacyOwnerAcceptance.expiresAt).getTime(),
  ];
  return new Date(Math.min(...deadlines)).toISOString();
}

function readinessSnapshotMatches(
  current: ExactPersonalDataReadiness,
  snapshot: ExactPersonalDataReadinessSnapshot,
): boolean {
  const descriptor = snapshot.descriptor;
  return (
    current.approvalVerifier === snapshot.approvalVerifier &&
    current.approvalVerifier.verifyStructuredUi ===
      snapshot.verifyStructuredUi &&
    current.approvalVerifier.verifyPrivacyOwnerAcceptance ===
      snapshot.verifyPrivacyOwnerAcceptance &&
    current.sourceId === descriptor.sourceId &&
    current.structuredUi.authorization ===
      descriptor.structuredUi.authorization &&
    current.structuredUi.authorizedAt ===
      descriptor.structuredUi.authorizedAt &&
    current.structuredUi.authorizedBy ===
      descriptor.structuredUi.authorizedBy &&
    current.structuredUi.approverRole ===
      descriptor.structuredUi.approverRole &&
    current.structuredUi.approvalExpiresAt ===
      descriptor.structuredUi.approvalExpiresAt &&
    current.structuredUi.modelAccess === descriptor.structuredUi.modelAccess &&
    current.structuredUi.route === descriptor.structuredUi.route &&
    current.structuredUi.routeVersion ===
      descriptor.structuredUi.routeVersion &&
    current.structuredUi.transport === descriptor.structuredUi.transport &&
    current.structuredUi.approvalEvidence.approvalId ===
      descriptor.structuredUi.approvalEvidence.approvalId &&
    current.structuredUi.approvalEvidence.approverRole ===
      descriptor.structuredUi.approvalEvidence.approverRole &&
    current.structuredUi.approvalEvidence.approvedAt ===
      descriptor.structuredUi.approvalEvidence.approvedAt &&
    current.structuredUi.approvalEvidence.expiresAt ===
      descriptor.structuredUi.approvalEvidence.expiresAt &&
    current.structuredUi.approvalEvidence.policyVersion ===
      descriptor.structuredUi.approvalEvidence.policyVersion &&
    current.structuredUi.approvalEvidence.route ===
      descriptor.structuredUi.approvalEvidence.route &&
    current.structuredUi.approvalEvidence.routeVersion ===
      descriptor.structuredUi.approvalEvidence.routeVersion &&
    current.structuredUi.approvalEvidence.sourceId ===
      descriptor.structuredUi.approvalEvidence.sourceId &&
    current.structuredUi.approvalEvidence.subject ===
      descriptor.structuredUi.approvalEvidence.subject &&
    current.retention.cacheMaxMinutes ===
      descriptor.retention.cacheMaxMinutes &&
    current.retention.maxDays === descriptor.retention.maxDays &&
    current.deletion.workflowId === descriptor.deletion.workflowId &&
    current.deletion.port === snapshot.deletionPort &&
    current.deletion.port.requestDeletion === snapshot.requestDeletion &&
    current.accessReview.reviewDueAt === descriptor.accessReview.reviewDueAt &&
    current.accessReview.reviewedAt === descriptor.accessReview.reviewedAt &&
    current.accessReview.reviewerId === descriptor.accessReview.reviewerId &&
    current.privacyOwnerAcceptance.accepted ===
      descriptor.privacyOwnerAcceptance.accepted &&
    current.privacyOwnerAcceptance.acceptedAt ===
      descriptor.privacyOwnerAcceptance.acceptedAt &&
    current.privacyOwnerAcceptance.expiresAt ===
      descriptor.privacyOwnerAcceptance.expiresAt &&
    current.privacyOwnerAcceptance.ownerId ===
      descriptor.privacyOwnerAcceptance.ownerId &&
    current.privacyOwnerAcceptance.acceptanceEvidence.acceptanceId ===
      descriptor.privacyOwnerAcceptance.acceptanceEvidence.acceptanceId &&
    current.privacyOwnerAcceptance.acceptanceEvidence.acceptedAt ===
      descriptor.privacyOwnerAcceptance.acceptanceEvidence.acceptedAt &&
    current.privacyOwnerAcceptance.acceptanceEvidence.approverRole ===
      descriptor.privacyOwnerAcceptance.acceptanceEvidence.approverRole &&
    current.privacyOwnerAcceptance.acceptanceEvidence.expiresAt ===
      descriptor.privacyOwnerAcceptance.acceptanceEvidence.expiresAt &&
    current.privacyOwnerAcceptance.acceptanceEvidence.policyVersion ===
      descriptor.privacyOwnerAcceptance.acceptanceEvidence.policyVersion &&
    current.privacyOwnerAcceptance.acceptanceEvidence.sourceId ===
      descriptor.privacyOwnerAcceptance.acceptanceEvidence.sourceId &&
    current.privacyOwnerAcceptance.acceptanceEvidence.subject ===
      descriptor.privacyOwnerAcceptance.acceptanceEvidence.subject
  );
}

/**
 * Application-level gate used immediately before registering/enabling a
 * source. There is no zero-argument or default-enabled path. The returned
 * descriptor is the immutable value the registration boundary should use.
 */
export async function authorizeExactPersonalDataSource(
  value: unknown,
  options: { clock?: () => Date } = {},
): Promise<ExactPersonalDataEnablement> {
  const initialNow = options.clock?.() ?? new Date();
  assertExactPersonalDataSourceReady(value, { clock: () => initialNow });
  const descriptor = createRegistrationDescriptor(value);
  const snapshot = createReadinessSnapshot(value, descriptor);
  await verifyApprovalEvidence(value);
  const finalNow = options.clock?.() ?? new Date();
  assertExactPersonalDataSourceReady(value, { clock: () => finalNow });
  if (!readinessSnapshotMatches(value, snapshot))
    throw new Error(
      "Exact personal-data readiness mutated during approval verification",
    );
  const permit = Object.freeze({}) as ExactPersonalDataAuthorizationPermit;
  authorizationPermitMetadata.set(permit, {
    descriptor,
    expiresAt: getPermitExpiry(value),
    snapshot,
  });
  return { descriptor, enabled: true, permit, sourceId: value.sourceId };
}

/**
 * Assert a permit at the derived application's source-registration boundary.
 * A copied object or TypeScript cast is not accepted by the private WeakMap.
 */
export function assertExactPersonalDataAuthorizationPermit(
  permit: unknown,
  descriptor: unknown,
  options: { clock?: () => Date } = {},
): ExactPersonalDataRegistrationDescriptor {
  const metadata =
    isRecord(permit) && authorizationPermitMetadata.get(permit) !== undefined
      ? authorizationPermitMetadata.get(permit)
      : undefined;
  if (!metadata || descriptor !== metadata.descriptor)
    throw new Error(
      "Exact personal-data source requires its module-issued permit and exact registration descriptor",
    );
  const now = options.clock?.() ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime()))
    throw new Error("Exact personal-data permit clock must be valid");
  if (new Date(metadata.expiresAt).getTime() <= now.getTime())
    throw new Error("Exact personal-data authorization permit is expired");
  if (!Object.isFrozen(metadata.descriptor))
    throw new Error("Exact personal-data registration descriptor is mutable");
  return metadata.descriptor;
}
