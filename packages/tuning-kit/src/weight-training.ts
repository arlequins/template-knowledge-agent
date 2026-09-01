import { createHash } from "node:crypto";

import {
  compareCanonicalText,
  evaluateReviewedBehaviorPack,
  type PatternBatch,
  type ReviewedPattern,
} from "./index";

export const WEIGHT_TRAINING_GATES = [
  "split-integrity",
  "held-out",
  "citation",
  "unsupported-claims",
  "repetition",
  "language",
  "privacy",
  "authorization",
  "latency",
  "cost",
] as const;

export type WeightTrainingGate = (typeof WEIGHT_TRAINING_GATES)[number];
type VerificationResult = boolean | Promise<boolean>;

export type TrainingDatasetIdentity = Readonly<{
  canonicalization: "reviewed-pattern-batch-v2";
  datasetSha256: string;
  groups: number;
  rows: Readonly<{ test: number; train: number; validation: number }>;
  schemaVersion: 2;
  sourceBatchSha256: string;
  sourceId: string;
  splitSha256: Readonly<{ test: string; train: string; validation: string }>;
}>;

export type TrainingApproval = Readonly<{
  approvedAt: string;
  approvedBy: string;
  approvalId: string;
  baseWeightsSha256: string;
  datasetSha256: string;
  decision: "approved";
  expiresAt: string;
  policyVersion: string;
  runId: string;
  sourceId: string;
}>;

export type WeightTrainingRunSpec = Readonly<{
  approvals: Readonly<{ license: TrainingApproval; privacy: TrainingApproval }>;
  baseModel: Readonly<{
    modelId: string;
    quantization?: string;
    runtime: string;
    weightsSha256: string;
  }>;
  budget: Readonly<{
    leaseSeconds: number;
    maxConcurrentRuns: number;
    maxCostUsd: number;
    maxDurationSeconds: number;
  }>;
  coordination: Readonly<{ idempotencyKey: string; leaseKey: string }>;
  createdAt: string;
  dataset: TrainingDatasetIdentity;
  runId: string;
  schemaVersion: 2;
  trainer: Readonly<{
    codeSha256: string;
    configSha256: string;
    id: string;
    version: string;
  }>;
}>;

export type WeightTrainingArtifact = Readonly<{
  artifactSha256: string;
  locator: string;
  manifestSha256: string;
  registryId: string;
  provenance: Readonly<{
    baseModelId: string;
    baseWeightsSha256: string;
    createdAt: string;
    datasetSha256: string;
    manifestSha256: string;
    quantization?: string;
    runId: string;
    runSpecSha256: string;
    runtime: string;
    sourceBatchSha256: string;
    trainerCodeSha256: string;
    trainerConfigSha256: string;
  }>;
  signature: Readonly<{ algorithm: string; keyId: string; value: string }>;
  version: string;
}>;

export type WeightTrainingGateResult = Readonly<{
  artifactSha256: string;
  baseWeightsSha256: string;
  datasetSha256: string;
  evaluatedAt: string;
  gate: WeightTrainingGate;
  passed: true;
  reportSha256: string;
  runId: string;
  suiteId: string;
  trainerConfigSha256: string;
}>;

export type WeightTrainingCandidate = Readonly<{
  artifact: WeightTrainingArtifact;
  gates: Readonly<Record<WeightTrainingGate, WeightTrainingGateResult>>;
  spec: WeightTrainingRunSpec;
}>;

export type WeightTrainingActivation = Readonly<{
  active: Readonly<{
    artifactSha256: string;
    observedAt: string;
    runId: string;
    version: string;
  }>;
  applicationReplay: Readonly<{
    artifactSha256: string;
    completedAt: string;
    passed: true;
    reportSha256: string;
    runId: string;
    suiteId: string;
  }>;
  reload: Readonly<{
    readinessReportSha256: string;
    readyAt: string;
    servedArtifactSha256: string;
    serverId: string;
    runId: string;
  }>;
  rollback: Readonly<{
    targetArtifactSha256: string;
    targetAvailable: true;
    verifiedAt: string;
    runId: string;
  }>;
}>;

export type WeightTrainingAuthorizationPermit = {
  readonly __weightTrainingAuthorization: unique symbol;
};

export type WeightTrainingAuthorizationDescriptor = Readonly<{
  activationSha256: string;
  artifactSha256: string;
  artifactVersion: string;
  datasetSha256: string;
  runId: string;
  runSpecSha256: string;
}>;

export type WeightTrainingAuthorization = Readonly<{
  descriptor: WeightTrainingAuthorizationDescriptor;
  permit: WeightTrainingAuthorizationPermit;
}>;

export type WeightTrainingIssue = {
  code:
    | "approval-expired"
    | "approval-invalid"
    | "artifact-invalid"
    | "artifact-mismatch"
    | "budget-invalid"
    | "candidate-invalid"
    | "date-invalid"
    | "dataset-invalid"
    | "gate-invalid"
    | "identity-invalid"
    | "provenance-invalid"
    | "signature-invalid"
    | "activation-invalid";
  message: string;
  path?: string;
};

export type WeightTrainingValidationReport = Readonly<{
  issues: readonly WeightTrainingIssue[];
  passed: boolean;
}>;

export type TrainingDatasetIdentityVerifierPort = {
  verify(input: {
    canonicalSourceBytes: string;
    canonicalTrainJsonl: string;
    identity: TrainingDatasetIdentity;
    sourceId: string;
  }): VerificationResult;
};

export type WeightTrainingApprovalVerifierPort = {
  verifyLicense(input: {
    approval: TrainingApproval;
    spec: WeightTrainingRunSpec;
  }): VerificationResult;
  verifyPrivacy(input: {
    approval: TrainingApproval;
    spec: WeightTrainingRunSpec;
  }): VerificationResult;
};

export type WeightTrainingGateEvidenceVerifierPort = {
  verify(input: {
    artifact: WeightTrainingArtifact;
    evidence: WeightTrainingGateResult;
    gate: WeightTrainingGate;
    spec: WeightTrainingRunSpec;
  }): VerificationResult;
};

export type WeightTrainingArtifactSignatureVerifier = {
  verify(input: {
    artifact: WeightTrainingArtifact;
    artifactBytes: readonly number[];
    canonicalArtifactBytes: string;
    manifestBytes: readonly number[];
    registryId: string;
  }): VerificationResult;
};

export type WeightTrainingArtifactResolution = Readonly<{
  artifactBytes: readonly number[];
  manifestBytes: readonly number[];
  registryId: string;
}>;

export type WeightTrainingArtifactResolverPort = {
  resolve(input: {
    artifact: WeightTrainingArtifact;
    canonicalArtifactBytes: string;
  }):
    | WeightTrainingArtifactResolution
    | Promise<WeightTrainingArtifactResolution>;
};

export type WeightTrainingContractOptions = {
  approvalVerifier: WeightTrainingApprovalVerifierPort;
  gateVerifier: WeightTrainingGateEvidenceVerifierPort;
  now?: () => Date;
  artifactResolver: WeightTrainingArtifactResolverPort;
  verifyDatasetIdentity: TrainingDatasetIdentityVerifierPort;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const UTC_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_APPROVAL_AGE_MS = 365 * 86_400_000;
const MAX_APPROVAL_HORIZON_MS = 365 * 86_400_000;
const MAX_EVIDENCE_AGE_MS = 30 * 86_400_000;
const MAX_TRAINING_SECONDS = 30 * 86_400;
const MAX_LEASE_SECONDS = 86_400;
const MAX_CONCURRENT_RUNS = 32;
const IDENTITY_METADATA = new WeakMap<
  object,
  { canonicalSourceBytes: string; canonicalTrainJsonl: string }
>();
const OWNED_IDENTITIES = new WeakSet<object>();
const OWNED_CANDIDATES = new WeakSet<object>();
const PERMIT_METADATA = new WeakMap<
  object,
  { descriptor: WeightTrainingAuthorizationDescriptor; expiresAt: string }
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max = 512): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function isUtcDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UTC_DATE.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function currentNow(options: { now?: () => Date }) {
  const value = options.now?.() ?? new Date();
  return value instanceof Date ? value.getTime() : Number.NaN;
}

function recordClockAfterAwait(
  issues: WeightTrainingIssue[],
  options: { now?: () => Date },
) {
  if (!Number.isFinite(currentNow(options)))
    issue(issues, "date-invalid", "Validation clock is invalid");
}

function issue(
  issues: WeightTrainingIssue[],
  code: WeightTrainingIssue["code"],
  message: string,
  path?: string,
) {
  issues.push({ code, message, ...(path ? { path } : {}) });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return Object.freeze(value);
}

function canonical(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Cannot canonicalize non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort(compareCanonicalText)
      .map((key) => `${canonical(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  throw new Error("Cannot canonicalize unsupported value");
}

function sortedById<T extends { id: string }>(values: readonly T[]) {
  return [...values].sort((left, right) =>
    compareCanonicalText(left.id, right.id),
  );
}

function assertCanonicalUnique<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
) {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = key(value).normalize("NFC");
    if (seen.has(normalized))
      throw new Error(`${label} must be unique after NFC normalization`);
    seen.add(normalized);
  }
}

function trainingRow(pattern: ReviewedPattern) {
  return {
    messages: [
      {
        content:
          "Answer from supplied evidence, cite it, and say when it is insufficient.",
        role: "system",
      },
      { content: pattern.question, role: "user" },
      { content: pattern.answer, role: "assistant" },
    ],
    metadata: {
      groupKey: pattern.groupKey,
      language: pattern.language,
      patternId: pattern.id,
      patternKind: pattern.patternKind,
    },
  };
}

function sortedReviewed(
  batch: PatternBatch,
  split?: "test" | "train" | "validation",
) {
  return sortedById(
    batch.patterns.filter(
      (pattern): pattern is ReviewedPattern =>
        pattern.status === "reviewed" && (!split || pattern.split === split),
    ),
  );
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function digestBytes(value: readonly number[]) {
  return createHash("sha256").update(Uint8Array.from(value)).digest("hex");
}

function runIdentityValue(spec: WeightTrainingRunSpec) {
  return {
    approvals: spec.approvals,
    baseModel: spec.baseModel,
    budget: spec.budget,
    createdAt: spec.createdAt,
    dataset: spec.dataset,
    runId: spec.runId,
    schemaVersion: spec.schemaVersion,
    trainer: spec.trainer,
  };
}

export function createWeightTrainingIdempotencyKey(input: {
  spec: WeightTrainingRunSpec;
}) {
  return digest(canonical(runIdentityValue(input.spec)));
}

function runSpecSha256(spec: WeightTrainingRunSpec) {
  return digest(canonical(spec));
}

export function createWeightTrainingRunSpecDigest(input: {
  spec: WeightTrainingRunSpec;
}) {
  return runSpecSha256(input.spec);
}

/** Builds and externally verifies an immutable identity from a reviewed batch. */
export async function createTrainingDatasetIdentity(input: {
  batch: PatternBatch;
  identityVerifier: TrainingDatasetIdentityVerifierPort;
  sourceId: string;
}): Promise<{ identity: TrainingDatasetIdentity; jsonl: string }> {
  if (!isText(input.sourceId, 256))
    throw new Error("Dataset sourceId is required");
  const evaluation = evaluateReviewedBehaviorPack(input.batch);
  if (!evaluation.passed)
    throw new Error(
      `Training dataset failed quality gates: ${evaluation.issues[0]?.message}`,
    );
  const allPatterns = sortedById(input.batch.patterns);
  const sourceId = input.sourceId.normalize("NFC");
  const evidence = [...input.batch.evidence].sort((left, right) =>
    compareCanonicalText(left.id, right.id),
  );
  assertCanonicalUnique(allPatterns, (pattern) => pattern.id, "Pattern ids");
  assertCanonicalUnique(evidence, (entry) => entry.id, "Evidence ids");
  const splits = {
    test: sortedReviewed(input.batch, "test"),
    train: sortedReviewed(input.batch, "train"),
    validation: sortedReviewed(input.batch, "validation"),
  };
  const jsonl = splits.train
    .map((pattern) => canonical(trainingRow(pattern)))
    .join("\n");
  const canonicalSourceBytes = canonical({
    evidence,
    patterns: allPatterns,
    schemaVersion: 1,
    sourceId,
  });
  const identity = deepFreeze({
    canonicalization: "reviewed-pattern-batch-v2" as const,
    datasetSha256: digest(jsonl),
    groups: new Set(
      sortedReviewed(input.batch).map((pattern) =>
        pattern.groupKey.normalize("NFC"),
      ),
    ).size,
    rows: {
      test: splits.test.length,
      train: splits.train.length,
      validation: splits.validation.length,
    },
    schemaVersion: 2 as const,
    sourceBatchSha256: digest(canonicalSourceBytes),
    sourceId,
    splitSha256: {
      test: digest(canonical(splits.test)),
      train: digest(canonical(splits.train)),
      validation: digest(canonical(splits.validation)),
    },
  });
  let verified: boolean;
  try {
    verified = await input.identityVerifier.verify({
      canonicalSourceBytes,
      canonicalTrainJsonl: jsonl,
      identity,
      sourceId: identity.sourceId,
    });
  } catch {
    throw new Error("Dataset identity verifier failed");
  }
  if (verified !== true)
    throw new Error("Dataset identity verifier rejected the protected source");
  OWNED_IDENTITIES.add(identity);
  IDENTITY_METADATA.set(identity, {
    canonicalSourceBytes,
    canonicalTrainJsonl: jsonl,
  });
  return { identity, jsonl };
}

function validateDate(
  issues: WeightTrainingIssue[],
  value: unknown,
  path: string,
): value is string {
  if (!isUtcDate(value)) {
    issue(
      issues,
      "date-invalid",
      "Date must be canonical UTC RFC3339 with milliseconds",
      path,
    );
    return false;
  }
  return true;
}

function validateApproval(
  issues: WeightTrainingIssue[],
  value: unknown,
  path: string,
  spec: Record<string, unknown>,
  now: number,
) {
  if (!isRecord(value) || value.decision !== "approved") {
    issue(
      issues,
      "approval-invalid",
      "Approval must be explicitly approved",
      path,
    );
    return;
  }
  for (const field of [
    "approvalId",
    "approvedBy",
    "policyVersion",
    "runId",
    "sourceId",
  ])
    if (!isText(value[field]))
      issue(
        issues,
        "approval-invalid",
        `${field} is required`,
        `${path}.${field}`,
      );
  for (const field of ["datasetSha256", "baseWeightsSha256"])
    if (!isSha256(value[field]))
      issue(
        issues,
        "approval-invalid",
        `${field} must be SHA-256`,
        `${path}.${field}`,
      );
  const dataset = spec.dataset as Record<string, unknown>;
  const baseModel = spec.baseModel as Record<string, unknown>;
  if (
    value.runId !== spec.runId ||
    value.sourceId !== dataset.sourceId ||
    value.datasetSha256 !== dataset.datasetSha256 ||
    value.baseWeightsSha256 !== baseModel.weightsSha256
  )
    issue(
      issues,
      "approval-invalid",
      "Approval is not bound to this run, source, dataset, and base model",
      path,
    );
  const approvedAt = validateDate(
    issues,
    value.approvedAt,
    `${path}.approvedAt`,
  )
    ? Date.parse(value.approvedAt)
    : Number.NaN;
  const expiresAt = validateDate(issues, value.expiresAt, `${path}.expiresAt`)
    ? Date.parse(value.expiresAt)
    : Number.NaN;
  if (
    Number.isNaN(approvedAt) ||
    Number.isNaN(expiresAt) ||
    approvedAt > now ||
    expiresAt <= now ||
    expiresAt <= approvedAt ||
    now - approvedAt > MAX_APPROVAL_AGE_MS ||
    expiresAt - now > MAX_APPROVAL_HORIZON_MS ||
    (isUtcDate(spec.createdAt) && approvedAt > Date.parse(spec.createdAt))
  )
    issue(
      issues,
      "approval-expired",
      "Approval must be fresh and have a bounded future expiry",
      path,
    );
}

function validateIdentity(
  issues: WeightTrainingIssue[],
  value: unknown,
  path: string,
): value is TrainingDatasetIdentity {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.canonicalization !== "reviewed-pattern-batch-v2" ||
    !OWNED_IDENTITIES.has(value)
  ) {
    issue(
      issues,
      "identity-invalid",
      "Dataset identity must be a module-issued immutable identity",
      path,
    );
    return false;
  }
  if (!isText(value.sourceId, 256))
    issue(
      issues,
      "identity-invalid",
      "sourceId is required",
      `${path}.sourceId`,
    );
  for (const field of ["datasetSha256", "sourceBatchSha256"])
    if (!isSha256(value[field]))
      issue(
        issues,
        "identity-invalid",
        `${field} must be SHA-256`,
        `${path}.${field}`,
      );
  if (!isRecord(value.splitSha256))
    issue(
      issues,
      "identity-invalid",
      "Split hashes are required",
      `${path}.splitSha256`,
    );
  else
    for (const split of ["train", "validation", "test"])
      if (!isSha256(value.splitSha256[split]))
        issue(
          issues,
          "identity-invalid",
          `${split} split hash must be SHA-256`,
          `${path}.splitSha256.${split}`,
        );
  if (!isRecord(value.rows))
    issue(
      issues,
      "dataset-invalid",
      "Split row counts are required",
      `${path}.rows`,
    );
  else
    for (const split of ["train", "validation", "test"])
      if (!Number.isInteger(value.rows[split]) || Number(value.rows[split]) < 1)
        issue(
          issues,
          "dataset-invalid",
          `${split} must be non-empty`,
          `${path}.rows.${split}`,
        );
  if (!Number.isInteger(value.groups) || Number(value.groups) < 6)
    issue(
      issues,
      "dataset-invalid",
      "At least six semantic groups are required",
      `${path}.groups`,
    );
  return true;
}

function structuralRunValidation(
  value: unknown,
  options: { now?: () => Date },
  nowOverride?: number,
): WeightTrainingValidationReport {
  const issues: WeightTrainingIssue[] = [];
  const now = nowOverride ?? currentNow(options);
  if (!Number.isFinite(now))
    issue(issues, "date-invalid", "Validation clock is invalid");
  if (!isRecord(value) || value.schemaVersion !== 2) {
    issue(issues, "identity-invalid", "Run specification schema is invalid");
    return { issues, passed: false };
  }
  if (!isText(value.runId, 160))
    issue(issues, "identity-invalid", "runId is required", "runId");
  const hasIdentity = validateIdentity(issues, value.dataset, "dataset");
  if (
    !validateDate(issues, value.createdAt, "createdAt") ||
    (hasIdentity && Date.parse(value.createdAt) > now)
  )
    issue(issues, "date-invalid", "Run creation date is invalid", "createdAt");
  if (
    hasIdentity &&
    isUtcDate(value.createdAt) &&
    Date.parse(value.createdAt) < now - MAX_APPROVAL_AGE_MS
  )
    issue(issues, "date-invalid", "Run identity is too old", "createdAt");
  if (!isRecord(value.baseModel))
    issue(issues, "identity-invalid", "baseModel is required", "baseModel");
  else {
    for (const field of ["modelId", "runtime"])
      if (!isText(value.baseModel[field]))
        issue(
          issues,
          "identity-invalid",
          `${field} is required`,
          `baseModel.${field}`,
        );
    if (!isSha256(value.baseModel.weightsSha256))
      issue(
        issues,
        "identity-invalid",
        "Base weights must be SHA-256",
        "baseModel.weightsSha256",
      );
    if (
      value.baseModel.quantization !== undefined &&
      !isText(value.baseModel.quantization)
    )
      issue(
        issues,
        "identity-invalid",
        "quantization is invalid",
        "baseModel.quantization",
      );
  }
  if (!isRecord(value.trainer))
    issue(issues, "identity-invalid", "trainer is required", "trainer");
  else {
    for (const field of ["id", "version"])
      if (!isText(value.trainer[field]))
        issue(
          issues,
          "identity-invalid",
          `${field} is required`,
          `trainer.${field}`,
        );
    for (const field of ["codeSha256", "configSha256"])
      if (!isSha256(value.trainer[field]))
        issue(
          issues,
          "identity-invalid",
          `${field} must be SHA-256`,
          `trainer.${field}`,
        );
  }
  if (!isRecord(value.approvals))
    issue(
      issues,
      "approval-invalid",
      "Privacy and license approvals are required",
      "approvals",
    );
  else {
    validateApproval(
      issues,
      value.approvals.privacy,
      "approvals.privacy",
      value,
      now,
    );
    validateApproval(
      issues,
      value.approvals.license,
      "approvals.license",
      value,
      now,
    );
  }
  if (!isRecord(value.budget))
    issue(
      issues,
      "budget-invalid",
      "Explicit training budget is required",
      "budget",
    );
  else {
    if (
      !Number.isFinite(value.budget.maxCostUsd) ||
      Number(value.budget.maxCostUsd) <= 0
    )
      issue(
        issues,
        "budget-invalid",
        "maxCostUsd must be finite and positive",
        "budget.maxCostUsd",
      );
    if (
      !Number.isInteger(value.budget.maxDurationSeconds) ||
      Number(value.budget.maxDurationSeconds) < 1 ||
      Number(value.budget.maxDurationSeconds) > MAX_TRAINING_SECONDS
    )
      issue(
        issues,
        "budget-invalid",
        "maxDurationSeconds is outside the bounded range",
        "budget.maxDurationSeconds",
      );
    if (
      !Number.isInteger(value.budget.maxConcurrentRuns) ||
      Number(value.budget.maxConcurrentRuns) < 1 ||
      Number(value.budget.maxConcurrentRuns) > MAX_CONCURRENT_RUNS
    )
      issue(
        issues,
        "budget-invalid",
        "maxConcurrentRuns is outside the bounded range",
        "budget.maxConcurrentRuns",
      );
    if (
      !Number.isInteger(value.budget.leaseSeconds) ||
      Number(value.budget.leaseSeconds) < 1 ||
      Number(value.budget.leaseSeconds) > MAX_LEASE_SECONDS
    )
      issue(
        issues,
        "budget-invalid",
        "leaseSeconds is outside the bounded range",
        "budget.leaseSeconds",
      );
  }
  if (!isRecord(value.coordination))
    issue(
      issues,
      "budget-invalid",
      "Idempotency and lease keys are required",
      "coordination",
    );
  else {
    let expected: string | undefined;
    if (
      hasIdentity &&
      isRecord(value.baseModel) &&
      isRecord(value.trainer) &&
      isRecord(value.approvals) &&
      isRecord(value.budget) &&
      isUtcDate(value.createdAt) &&
      isText(value.runId)
    )
      expected = createWeightTrainingIdempotencyKey({
        spec: value as unknown as WeightTrainingRunSpec,
      });
    if (
      !isSha256(value.coordination.idempotencyKey) ||
      value.coordination.idempotencyKey !== expected
    )
      issue(
        issues,
        "budget-invalid",
        "idempotencyKey must equal the canonical run identity digest",
        "coordination.idempotencyKey",
      );
    if (value.coordination.leaseKey !== value.coordination.idempotencyKey)
      issue(
        issues,
        "budget-invalid",
        "leaseKey must equal idempotencyKey",
        "coordination.leaseKey",
      );
  }
  return { issues, passed: issues.length === 0 };
}

async function verifyRunEvidence(
  spec: WeightTrainingRunSpec,
  options: WeightTrainingContractOptions,
  issues: WeightTrainingIssue[],
) {
  const identityMetadata = IDENTITY_METADATA.get(spec.dataset);
  if (!identityMetadata) {
    issue(
      issues,
      "identity-invalid",
      "Dataset identity metadata is unavailable",
      "dataset",
    );
    return;
  }
  try {
    const verified = await options.verifyDatasetIdentity.verify({
      canonicalSourceBytes: identityMetadata.canonicalSourceBytes,
      canonicalTrainJsonl: identityMetadata.canonicalTrainJsonl,
      identity: spec.dataset,
      sourceId: spec.dataset.sourceId,
    });
    if (verified !== true)
      issue(
        issues,
        "identity-invalid",
        "Protected dataset identity verifier rejected the source",
        "dataset",
      );
  } catch {
    issue(
      issues,
      "identity-invalid",
      "Protected dataset identity verifier failed",
      "dataset",
    );
  }
  recordClockAfterAwait(issues, options);
  for (const [kind, approval, verify] of [
    [
      "privacy",
      spec.approvals.privacy,
      (input: { approval: TrainingApproval; spec: WeightTrainingRunSpec }) =>
        options.approvalVerifier.verifyPrivacy(input),
    ],
    [
      "license",
      spec.approvals.license,
      (input: { approval: TrainingApproval; spec: WeightTrainingRunSpec }) =>
        options.approvalVerifier.verifyLicense(input),
    ],
  ] as const) {
    try {
      const verified = await verify({ approval, spec });
      if (verified !== true)
        issue(
          issues,
          "approval-invalid",
          `${kind} approval verifier rejected the evidence`,
          `approvals.${kind}`,
        );
    } catch {
      issue(
        issues,
        "approval-invalid",
        `${kind} approval verifier failed`,
        `approvals.${kind}`,
      );
    }
    recordClockAfterAwait(issues, options);
  }
}

function cloneRunSpec(value: WeightTrainingRunSpec): WeightTrainingRunSpec {
  const parsed = JSON.parse(canonical(value)) as WeightTrainingRunSpec;
  return deepFreeze({ ...parsed, dataset: value.dataset });
}

/** Validates a complete run contract and externally verifies its protected evidence. */
export async function validateWeightTrainingRunSpec(
  value: unknown,
  options: WeightTrainingContractOptions,
): Promise<WeightTrainingValidationReport> {
  const report = structuralRunValidation(value, options);
  if (!report.passed) return report;
  const issues = [...report.issues];
  // Freeze one detached snapshot before the first await. Every verifier and
  // the final validation must observe this exact snapshot, never the caller's
  // mutable object.
  const snapshot = cloneRunSpec(value as WeightTrainingRunSpec);
  await verifyRunEvidence(snapshot, options, issues);
  const final = structuralRunValidation(snapshot, options);
  issues.push(...final.issues);
  return { issues, passed: issues.length === 0 };
}

function cloneCandidate(
  value: Record<string, unknown>,
): WeightTrainingCandidate {
  const originalSpec = value.spec as WeightTrainingRunSpec;
  const parsedSpec = JSON.parse(
    canonical(originalSpec),
  ) as WeightTrainingRunSpec;
  const spec = { ...parsedSpec, dataset: originalSpec.dataset };
  const artifact = JSON.parse(
    canonical(value.artifact),
  ) as WeightTrainingArtifact;
  const gates = JSON.parse(canonical(value.gates)) as Record<
    WeightTrainingGate,
    WeightTrainingGateResult
  >;
  return deepFreeze({ artifact, gates, spec });
}

function validateArtifact(
  issues: WeightTrainingIssue[],
  value: unknown,
  spec: WeightTrainingRunSpec,
  now: number,
): value is WeightTrainingArtifact {
  if (!isRecord(value)) {
    issue(
      issues,
      "artifact-invalid",
      "Artifact attestation is required",
      "artifact",
    );
    return false;
  }
  for (const field of ["artifactSha256", "manifestSha256"])
    if (!isSha256(value[field]))
      issue(
        issues,
        "artifact-invalid",
        `${field} must be SHA-256`,
        `artifact.${field}`,
      );
  if (!isText(value.locator, 1_024) || !isText(value.version, 256))
    issue(
      issues,
      "artifact-invalid",
      "Artifact locator and version are required",
      "artifact",
    );
  if (!isText(value.registryId, 256))
    issue(
      issues,
      "artifact-invalid",
      "Protected artifact registry identity is required",
      "artifact.registryId",
    );
  const artifactSha =
    typeof value.artifactSha256 === "string" ? value.artifactSha256 : "";
  if (
    !isSha256(value.artifactSha256) ||
    value.locator !== `protected://sha256/${artifactSha}` ||
    value.version !== `sha256-${artifactSha}`
  )
    issue(
      issues,
      "artifact-invalid",
      "Artifact locator and version must be content-addressed and immutable",
      "artifact.locator",
    );
  if (!isRecord(value.signature))
    issue(
      issues,
      "signature-invalid",
      "Artifact signature is required",
      "artifact.signature",
    );
  else
    for (const field of ["algorithm", "keyId", "value"])
      if (!isText(value.signature[field], 2_048))
        issue(
          issues,
          "signature-invalid",
          `${field} is required`,
          `artifact.signature.${field}`,
        );
  if (!isRecord(value.provenance))
    issue(
      issues,
      "provenance-invalid",
      "Artifact provenance is required",
      "artifact.provenance",
    );
  else {
    const expected: Record<string, unknown> = {
      baseModelId: spec.baseModel.modelId,
      baseWeightsSha256: spec.baseModel.weightsSha256,
      datasetSha256: spec.dataset.datasetSha256,
      manifestSha256: value.manifestSha256,
      quantization: spec.baseModel.quantization,
      runId: spec.runId,
      runSpecSha256: runSpecSha256(spec),
      runtime: spec.baseModel.runtime,
      sourceBatchSha256: spec.dataset.sourceBatchSha256,
      trainerCodeSha256: spec.trainer.codeSha256,
      trainerConfigSha256: spec.trainer.configSha256,
    };
    for (const [field, expectedValue] of Object.entries(expected))
      if (value.provenance[field] !== expectedValue)
        issue(
          issues,
          "provenance-invalid",
          `${field} does not match the run`,
          `artifact.provenance.${field}`,
        );
    if (
      !validateDate(
        issues,
        value.provenance.createdAt,
        "artifact.provenance.createdAt",
      )
    )
      return false;
    const createdAt = Date.parse(value.provenance.createdAt);
    if (
      createdAt > now ||
      createdAt < Date.parse(spec.createdAt) ||
      now - createdAt > MAX_EVIDENCE_AGE_MS
    )
      issue(
        issues,
        "date-invalid",
        "Artifact provenance date is outside the run and evidence window",
        "artifact.provenance.createdAt",
      );
  }
  return true;
}

function validSuiteId(value: unknown) {
  return (
    typeof value === "string" &&
    /^weight-training-[a-z0-9-]+-v\d+$/u.test(value)
  );
}

function freezeBytes(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (
    value.some(
      (byte) =>
        !Number.isInteger(byte) || Number(byte) < 0 || Number(byte) > 255,
    )
  )
    return undefined;
  return Object.freeze(value.map(Number));
}

async function resolveArtifactContent(
  artifact: WeightTrainingArtifact,
  canonicalArtifactBytes: string,
  options: WeightTrainingContractOptions,
  issues: WeightTrainingIssue[],
) {
  try {
    const resolved = await options.artifactResolver.resolve({
      artifact,
      canonicalArtifactBytes,
    });
    recordClockAfterAwait(issues, options);
    if (!isRecord(resolved)) throw new Error("resolution is not an object");
    const artifactBytes = freezeBytes(resolved.artifactBytes);
    const manifestBytes = freezeBytes(resolved.manifestBytes);
    if (
      !artifactBytes ||
      !manifestBytes ||
      resolved.registryId !== artifact.registryId
    )
      throw new Error("protected artifact metadata does not match");
    if (
      digestBytes(artifactBytes) !== artifact.artifactSha256 ||
      digestBytes(manifestBytes) !== artifact.manifestSha256
    )
      throw new Error("protected artifact bytes do not match declared hashes");
    return { artifactBytes, manifestBytes, registryId: artifact.registryId };
  } catch {
    issue(
      issues,
      "artifact-invalid",
      "Protected artifact and manifest bytes failed immutable content verification",
      "artifact",
    );
    recordClockAfterAwait(issues, options);
    return undefined;
  }
}

async function verifyGates(
  spec: WeightTrainingRunSpec,
  artifact: WeightTrainingArtifact,
  gates: Readonly<Record<WeightTrainingGate, WeightTrainingGateResult>>,
  options: WeightTrainingContractOptions,
  issues: WeightTrainingIssue[],
) {
  for (const gate of WEIGHT_TRAINING_GATES) {
    try {
      const verified = await options.gateVerifier.verify({
        artifact,
        evidence: gates[gate],
        gate,
        spec,
      });
      if (verified !== true)
        issue(
          issues,
          "gate-invalid",
          `${gate} evidence verifier rejected the evidence`,
          `gates.${gate}`,
        );
    } catch {
      issue(
        issues,
        "gate-invalid",
        `${gate} evidence verifier failed`,
        `gates.${gate}`,
      );
    }
    recordClockAfterAwait(issues, options);
  }
}

function validateGates(
  issues: WeightTrainingIssue[],
  value: unknown,
  spec: WeightTrainingRunSpec,
  artifact: WeightTrainingArtifact,
  now: number,
) {
  if (!isRecord(value)) {
    issue(issues, "gate-invalid", "All evaluation gates are required", "gates");
    return false;
  }
  const expected = new Set<string>(WEIGHT_TRAINING_GATES);
  for (const gate of WEIGHT_TRAINING_GATES) {
    const result = value[gate];
    if (
      !isRecord(result) ||
      result.passed !== true ||
      result.gate !== gate ||
      result.runId !== spec.runId ||
      result.artifactSha256 !== artifact.artifactSha256 ||
      result.datasetSha256 !== spec.dataset.datasetSha256 ||
      result.baseWeightsSha256 !== spec.baseModel.weightsSha256 ||
      result.trainerConfigSha256 !== spec.trainer.configSha256 ||
      !validSuiteId(result.suiteId) ||
      !isSha256(result.reportSha256) ||
      !validateDate(issues, result.evaluatedAt, `gates.${gate}.evaluatedAt`)
    ) {
      issue(
        issues,
        "gate-invalid",
        `${gate} gate must pass with exact run, artifact, dataset, suite, report, and timestamp bindings`,
        `gates.${gate}`,
      );
      continue;
    }
    const evaluatedAt = Date.parse(result.evaluatedAt);
    if (
      evaluatedAt > now ||
      evaluatedAt < Date.parse(spec.createdAt) ||
      evaluatedAt < Date.parse(artifact.provenance.createdAt) ||
      now - evaluatedAt > MAX_EVIDENCE_AGE_MS
    )
      issue(
        issues,
        "date-invalid",
        `${gate} evidence is outside the run and freshness window`,
        `gates.${gate}.evaluatedAt`,
      );
  }
  for (const key of Object.keys(value))
    if (!expected.has(key))
      issue(
        issues,
        "gate-invalid",
        `Unknown evaluation gate: ${key}`,
        `gates.${key}`,
      );
  return true;
}

/** Validates a candidate and externally verifies every artifact and gate claim. */
export async function authorizeWeightTrainingCandidate(
  value: unknown,
  options: WeightTrainingContractOptions & {
    signatureVerifier: WeightTrainingArtifactSignatureVerifier;
  },
): Promise<WeightTrainingCandidate> {
  const issues: WeightTrainingIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "candidate-invalid", "Candidate is required");
    throw new Error(
      `Weight-training candidate rejected: ${issues[0]?.message}`,
    );
  }
  const structural = structuralRunValidation(value.spec, options);
  issues.push(...structural.issues);
  if (issues.length > 0)
    throw new Error(
      `Weight-training candidate rejected: ${issues[0]?.message}`,
    );
  const snapshot = cloneCandidate(value);
  const report = await validateWeightTrainingRunSpec(snapshot.spec, options);
  issues.push(...report.issues);
  if (issues.length > 0)
    throw new Error(
      `Weight-training candidate rejected: ${issues[0]?.message}`,
    );
  const now = currentNow(options);
  const artifactValid = validateArtifact(
    issues,
    snapshot.artifact,
    snapshot.spec,
    now,
  );
  const gatesValid =
    artifactValid &&
    validateGates(
      issues,
      snapshot.gates,
      snapshot.spec,
      snapshot.artifact,
      now,
    );
  let resolvedContent:
    | Awaited<ReturnType<typeof resolveArtifactContent>>
    | undefined;
  const canonicalArtifactBytes = canonical(snapshot.artifact);
  if (issues.length === 0 && artifactValid && gatesValid) {
    resolvedContent = await resolveArtifactContent(
      snapshot.artifact,
      canonicalArtifactBytes,
      options,
      issues,
    );
  }
  if (issues.length === 0 && artifactValid && gatesValid && resolvedContent) {
    try {
      const verified = await options.signatureVerifier.verify({
        artifact: snapshot.artifact,
        artifactBytes: resolvedContent.artifactBytes,
        canonicalArtifactBytes,
        manifestBytes: resolvedContent.manifestBytes,
        registryId: resolvedContent.registryId,
      });
      if (verified !== true)
        issue(
          issues,
          "signature-invalid",
          "Artifact signature verifier rejected the artifact",
          "artifact.signature",
        );
    } catch {
      issue(
        issues,
        "signature-invalid",
        "Artifact signature verifier failed",
        "artifact.signature",
      );
    }
    recordClockAfterAwait(issues, options);
    await verifyGates(
      snapshot.spec,
      snapshot.artifact,
      snapshot.gates,
      options,
      issues,
    );
    if (
      resolvedContent &&
      (digestBytes(resolvedContent.artifactBytes) !==
        snapshot.artifact.artifactSha256 ||
        digestBytes(resolvedContent.manifestBytes) !==
          snapshot.artifact.manifestSha256 ||
        resolvedContent.registryId !== snapshot.artifact.registryId)
    )
      issue(
        issues,
        "artifact-invalid",
        "Protected artifact content changed during verification",
        "artifact",
      );
    const postVerificationIssues: WeightTrainingIssue[] = [];
    const postNow = currentNow(options);
    const postRun = structuralRunValidation(snapshot.spec, options, postNow);
    postVerificationIssues.push(...postRun.issues);
    const postArtifactValid = validateArtifact(
      postVerificationIssues,
      snapshot.artifact,
      snapshot.spec,
      postNow,
    );
    if (postArtifactValid)
      validateGates(
        postVerificationIssues,
        snapshot.gates,
        snapshot.spec,
        snapshot.artifact,
        postNow,
      );
    issues.push(...postVerificationIssues);
  }
  if (issues.length > 0)
    throw new Error(
      `Weight-training candidate rejected: ${issues[0]?.message}`,
    );
  OWNED_CANDIDATES.add(snapshot);
  return snapshot;
}

function activationIssues(
  candidate: WeightTrainingCandidate,
  value: unknown,
  now: number,
) {
  const issues: WeightTrainingIssue[] = [];
  if (!Number.isFinite(now)) {
    issue(issues, "activation-invalid", "Activation clock is invalid");
    return issues;
  }
  if (!isRecord(value)) {
    issue(issues, "activation-invalid", "Activation evidence is required");
    return issues;
  }
  const artifactSha256 = candidate.artifact.artifactSha256;
  const runId = candidate.spec.runId;
  const active = value.active;
  const reload = value.reload;
  const rollback = value.rollback;
  const replay = value.applicationReplay;
  if (
    !isRecord(active) ||
    active.artifactSha256 !== artifactSha256 ||
    active.version !== candidate.artifact.version ||
    active.runId !== runId ||
    !validateDate(issues, active.observedAt, "active.observedAt")
  )
    issue(
      issues,
      "activation-invalid",
      "Active artifact and observation must match the candidate",
      "active",
    );
  if (
    !isRecord(reload) ||
    reload.servedArtifactSha256 !== artifactSha256 ||
    reload.runId !== runId ||
    !isSha256(reload.readinessReportSha256) ||
    !isText(reload.serverId) ||
    !validateDate(issues, reload.readyAt, "reload.readyAt")
  )
    issue(
      issues,
      "activation-invalid",
      "Reload readiness must match the candidate",
      "reload",
    );
  if (
    !isRecord(rollback) ||
    rollback.targetAvailable !== true ||
    rollback.runId !== runId ||
    !isSha256(rollback.targetArtifactSha256) ||
    rollback.targetArtifactSha256 === artifactSha256 ||
    !validateDate(issues, rollback.verifiedAt, "rollback.verifiedAt")
  )
    issue(
      issues,
      "activation-invalid",
      "A distinct available rollback artifact is required",
      "rollback",
    );
  if (
    !isRecord(replay) ||
    replay.passed !== true ||
    replay.artifactSha256 !== artifactSha256 ||
    replay.runId !== runId ||
    !/^application-rag-citation-v\d+$/u.test(String(replay.suiteId)) ||
    !isSha256(replay.reportSha256) ||
    !validateDate(issues, replay.completedAt, "applicationReplay.completedAt")
  )
    issue(
      issues,
      "activation-invalid",
      "A passing full application RAG/citation replay is required",
      "applicationReplay",
    );
  if (
    isRecord(active) &&
    isRecord(reload) &&
    isRecord(rollback) &&
    isRecord(replay)
  ) {
    const dates = [
      Date.parse(candidate.spec.createdAt),
      Date.parse(candidate.artifact.provenance.createdAt),
      Date.parse(reload.readyAt as string),
      Date.parse(replay.completedAt as string),
      Date.parse(rollback.verifiedAt as string),
      Date.parse(active.observedAt as string),
    ];
    if (
      dates.some(
        (date) =>
          Number.isNaN(date) || date > now || now - date > MAX_EVIDENCE_AGE_MS,
      ) ||
      dates[4]! < dates[0]! ||
      dates[2]! < dates[1]! ||
      dates[3]! < dates[2]! ||
      dates[4]! > dates[5]! ||
      dates[5]! < dates[3]!
    )
      issue(
        issues,
        "activation-invalid",
        "Activation evidence must be fresh and chronologically ordered",
        "activation",
      );
  }
  return issues;
}

/** Confirms post-reload readiness and replay evidence without performing activation. */
export function assertWeightTrainingActivationReady(
  candidate: WeightTrainingCandidate,
  value: unknown,
  options: { now?: () => Date } = {},
): asserts value is WeightTrainingActivation {
  if (!OWNED_CANDIDATES.has(candidate))
    throw new Error(
      "Weight-training activation requires a module-authorized candidate",
    );
  const issues = activationIssues(
    candidate,
    value,
    (options.now?.() ?? new Date()).getTime(),
  );
  if (issues.length > 0)
    throw new Error(
      `Weight-training activation rejected: ${issues[0]?.message}`,
    );
}

/** Issues a descriptor-bound permit only after all candidate and activation evidence pass. */
export async function authorizeWeightTraining(
  candidate: unknown,
  activation: unknown,
  options: WeightTrainingContractOptions & {
    signatureVerifier: WeightTrainingArtifactSignatureVerifier;
  },
): Promise<WeightTrainingAuthorization> {
  const accepted = await authorizeWeightTrainingCandidate(candidate, options);
  assertWeightTrainingActivationReady(accepted, activation, options);
  const activationSnapshot = deepFreeze(
    JSON.parse(canonical(activation)) as WeightTrainingActivation,
  );
  const activationSha256 = digest(canonical(activationSnapshot));
  const descriptor = deepFreeze({
    activationSha256,
    artifactSha256: accepted.artifact.artifactSha256,
    artifactVersion: accepted.artifact.version,
    datasetSha256: accepted.spec.dataset.datasetSha256,
    runId: accepted.spec.runId,
    runSpecSha256: runSpecSha256(accepted.spec),
  });
  const permit = Object.freeze({});
  const freshnessDeadlines = [
    accepted.spec.approvals.privacy.expiresAt,
    accepted.spec.approvals.license.expiresAt,
  ];
  const approvalAndRunDeadlines = [
    accepted.spec.approvals.privacy.approvedAt,
    accepted.spec.approvals.license.approvedAt,
    accepted.spec.createdAt,
  ].map((timestamp) => {
    const value = Date.parse(timestamp);
    if (!Number.isFinite(value)) throw new Error("Invalid run timestamp");
    return new Date(value + MAX_APPROVAL_AGE_MS).toISOString();
  });
  const evidenceFreshness = [
    accepted.artifact.provenance.createdAt,
    ...WEIGHT_TRAINING_GATES.map((gate) => accepted.gates[gate].evaluatedAt),
    activationSnapshot.reload.readyAt,
    activationSnapshot.applicationReplay.completedAt,
    activationSnapshot.rollback.verifiedAt,
    activationSnapshot.active.observedAt,
  ].map((timestamp) => {
    const value = Date.parse(timestamp);
    if (!Number.isFinite(value)) throw new Error("Invalid evidence timestamp");
    return new Date(value + MAX_EVIDENCE_AGE_MS).toISOString();
  });
  freshnessDeadlines.push(...approvalAndRunDeadlines);
  freshnessDeadlines.push(...evidenceFreshness);
  PERMIT_METADATA.set(permit, {
    descriptor,
    expiresAt: freshnessDeadlines.sort(compareCanonicalText)[0] as string,
  });
  return { descriptor, permit: permit as WeightTrainingAuthorizationPermit };
}

export function assertWeightTrainingAuthorizationPermit(
  permit: unknown,
  descriptor: unknown,
  options: { now?: () => Date } = {},
): asserts descriptor is WeightTrainingAuthorizationDescriptor {
  const metadata = isRecord(permit) ? PERMIT_METADATA.get(permit) : undefined;
  if (!metadata || descriptor !== metadata.descriptor)
    throw new Error(
      "Weight-training authorization requires its module-issued permit and exact descriptor",
    );
  const now = options.now?.() ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime()))
    throw new Error("Weight-training permit clock must be valid");
  if (Date.parse(metadata.expiresAt) <= now.getTime())
    throw new Error("Weight-training authorization permit is expired");
  if (!Object.isFrozen(metadata.descriptor))
    throw new Error("Weight-training authorization descriptor is mutable");
}
