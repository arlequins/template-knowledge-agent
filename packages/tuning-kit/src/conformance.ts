import { createHash } from "node:crypto";

import { compareCanonicalText } from "./canonical-text";
import type { PatternBatch, PatternSplit, ReviewedPattern } from "./index";
import {
  assertWeightTrainingActivationReady,
  assertWeightTrainingAuthorizationPermit,
  authorizeWeightTraining,
  authorizeWeightTrainingCandidate,
  createTrainingDatasetIdentity,
  createWeightTrainingIdempotencyKey,
  createWeightTrainingRunSpecDigest,
  isWeightTrainingContractRejection,
  type TrainingDatasetIdentity,
  type TrainingDatasetIdentityVerifierPort,
  type WeightTrainingArtifactResolution,
  type WeightTrainingContractOptions,
  type WeightTrainingRunSpec,
} from "./weight-training";

export const WEIGHT_TRAINING_CONFORMANCE_CASE_IDS = [
  "WT-CONFORMANCE-001-default-deny",
  "WT-CONFORMANCE-002-dataset-nfc-split",
  "WT-CONFORMANCE-003-deterministic-identity",
  "WT-CONFORMANCE-004-approval-deadline",
  "WT-CONFORMANCE-005-artifact-content",
  "WT-CONFORMANCE-006-strict-verifiers",
  "WT-CONFORMANCE-007-async-freshness",
  "WT-CONFORMANCE-008-provenance",
  "WT-CONFORMANCE-009-activation-order",
  "WT-CONFORMANCE-010-permit-binding",
  "WT-CONFORMANCE-PROP-001-seeded-determinism",
  "WT-CONFORMANCE-PROP-002-seeded-determinism",
  "WT-CONFORMANCE-PROP-003-seeded-determinism",
] as const;

export type WeightTrainingConformanceCaseId =
  (typeof WEIGHT_TRAINING_CONFORMANCE_CASE_IDS)[number];

export type WeightTrainingConformanceCase = Readonly<{
  caseId: WeightTrainingConformanceCaseId;
  issues: readonly Readonly<{ code: string }>[];
  status: "failed" | "passed";
}>;

export type WeightTrainingConformanceReport = Readonly<{
  cases: readonly WeightTrainingConformanceCase[];
  passed: boolean;
  schemaVersion: 1;
  seed: number;
}>;

export type WeightTrainingConformanceFixture = Readonly<{
  activation: unknown;
  artifactResolution: WeightTrainingArtifactResolution;
  batch: PatternBatch;
  candidate: unknown;
  identity: TrainingDatasetIdentity;
  identityVerifier: TrainingDatasetIdentityVerifierPort;
  options: WeightTrainingConformanceOptions;
  sourceId: string;
}>;

export type WeightTrainingConformanceOptions = WeightTrainingContractOptions & {
  signatureVerifier: NonNullable<
    Parameters<typeof authorizeWeightTrainingCandidate>[1]["signatureVerifier"]
  >;
};

export type WeightTrainingConformanceHarness = {
  createFixture(
    seed: number,
  ):
    | WeightTrainingConformanceFixture
    | Promise<WeightTrainingConformanceFixture>;
};

const SYNTHETIC_KINDS = [
  "grounded-answer",
  "insufficient-evidence",
  "conflicting-evidence",
  "citation-required",
  "static-vs-live",
  "code-navigation",
  "clarification",
  "prompt-injection-resistance",
] as const;
const SYNTHETIC_LANGUAGES = ["en", "ja", "ko"] as const;

function syntheticDigest(value: string | readonly number[]) {
  const hash = createHash("sha256");
  if (typeof value === "string") hash.update(value, "utf8");
  else hash.update(Uint8Array.from(value));
  return hash.digest("hex");
}

function createSyntheticPatternBatch(seed: number): PatternBatch {
  const patterns = Array.from({ length: 12 }, (_, index) => {
    const id = `synthetic-pattern-${seed}-${index}`;
    const evidenceId = `${id}-evidence`;
    const kind = SYNTHETIC_KINDS[index % SYNTHETIC_KINDS.length]!;
    const language = SYNTHETIC_LANGUAGES[index % SYNTHETIC_LANGUAGES.length]!;
    return {
      answer: `Synthetic answer ${index} [evidence:${evidenceId}]`,
      evidenceIds: [evidenceId],
      forbiddenClaims: [],
      generatedBy: "tuning-kit-synthetic",
      groupKey: `synthetic-group-${seed}-${index}`,
      id,
      language,
      patternKind: kind,
      question: `Synthetic question ${index} for ${kind} (${language})?`,
      requiredTerms: [],
      reviewedAt: "2026-08-02T00:00:00.000Z",
      reviewedBy: "tuning-kit-synthetic",
      split: (index < 10
        ? "train"
        : index === 10
          ? "validation"
          : "test") as PatternSplit,
      status: "reviewed" as const,
    };
  });
  const evidence = patterns.map((pattern) => ({
    id: pattern.evidenceIds[0]!,
    label: `Synthetic evidence ${pattern.id}`,
    locator: `synthetic://${pattern.id}`,
    text: `Synthetic evidence text ${pattern.id}`,
  }));
  return { evidence, patterns, schemaVersion: 1 };
}

/** Returns a deterministic, content-free fixture harness for derived-app qualification and tests. */
export function createSyntheticWeightTrainingConformanceHarness(): WeightTrainingConformanceHarness {
  return {
    createFixture: async (seed) => {
      const batch = createSyntheticPatternBatch(seed);
      const sourceId = `synthetic-weight-source-${seed}`;
      const identityVerifier = { verify: async () => true };
      const identity = (
        await createTrainingDatasetIdentity({
          batch,
          identityVerifier,
          sourceId,
        })
      ).identity;
      const runId = `synthetic-weight-run-${seed}`;
      const baseWeightsSha256 = "a".repeat(64);
      const specWithoutKey: WeightTrainingRunSpec = {
        approvals: {
          license: {
            approvedAt: "2026-08-01T00:00:00.000Z",
            approvedBy: "synthetic-license",
            approvalId: `synthetic-license-${seed}`,
            baseWeightsSha256,
            datasetSha256: identity.datasetSha256,
            decision: "approved",
            expiresAt: "2026-09-30T00:00:00.000Z",
            policyVersion: "synthetic-v1",
            runId,
            sourceId,
          },
          privacy: {
            approvedAt: "2026-08-01T00:00:00.000Z",
            approvedBy: "synthetic-privacy",
            approvalId: `synthetic-privacy-${seed}`,
            baseWeightsSha256,
            datasetSha256: identity.datasetSha256,
            decision: "approved",
            expiresAt: "2026-09-30T00:00:00.000Z",
            policyVersion: "synthetic-v1",
            runId,
            sourceId,
          },
        },
        baseModel: {
          modelId: "synthetic-model",
          quantization: "q4",
          runtime: "synthetic-runtime",
          weightsSha256: baseWeightsSha256,
        },
        budget: {
          leaseSeconds: 300,
          maxConcurrentRuns: 1,
          maxCostUsd: 10,
          maxDurationSeconds: 3_600,
        },
        coordination: { idempotencyKey: "", leaseKey: "" },
        createdAt: "2026-08-01T00:00:00.000Z",
        dataset: identity,
        runId,
        schemaVersion: 2,
        trainer: {
          codeSha256: "b".repeat(64),
          configSha256: "c".repeat(64),
          id: "synthetic-trainer",
          version: "1.0.0",
        },
      };
      const idempotencyKey = createWeightTrainingIdempotencyKey({
        spec: specWithoutKey,
      });
      const spec = {
        ...specWithoutKey,
        coordination: { idempotencyKey, leaseKey: idempotencyKey },
      };
      const artifactBytes = [
        ...new TextEncoder().encode(`synthetic-artifact-${seed}`),
      ];
      const manifestBytes = [
        ...new TextEncoder().encode(`synthetic-manifest-${seed}`),
      ];
      const artifactSha256 = syntheticDigest(artifactBytes);
      const manifestSha256 = syntheticDigest(manifestBytes);
      const artifact = {
        artifactSha256,
        locator: `protected://sha256/${artifactSha256}`,
        manifestSha256,
        registryId: "synthetic-registry",
        provenance: {
          baseModelId: spec.baseModel.modelId,
          baseWeightsSha256,
          createdAt: "2026-08-02T00:00:00.000Z",
          datasetSha256: identity.datasetSha256,
          manifestSha256,
          quantization: spec.baseModel.quantization,
          runId,
          runSpecSha256: createWeightTrainingRunSpecDigest({ spec }),
          runtime: spec.baseModel.runtime,
          sourceBatchSha256: identity.sourceBatchSha256,
          trainerCodeSha256: spec.trainer.codeSha256,
          trainerConfigSha256: spec.trainer.configSha256,
        },
        signature: {
          algorithm: "synthetic",
          keyId: "synthetic-key",
          value: "synthetic-signature",
        },
        version: `sha256-${artifactSha256}`,
      };
      const gates = Object.fromEntries(
        [
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
        ].map((gate) => [
          gate,
          {
            artifactSha256,
            baseWeightsSha256,
            datasetSha256: identity.datasetSha256,
            evaluatedAt: "2026-08-03T00:00:00.000Z",
            gate,
            passed: true,
            reportSha256: "d".repeat(64),
            runId,
            suiteId: `weight-training-${gate}-v1`,
            trainerConfigSha256: spec.trainer.configSha256,
          },
        ]),
      );
      const activation = {
        active: {
          artifactSha256,
          observedAt: "2026-08-07T00:00:00.000Z",
          runId,
          version: artifact.version,
        },
        applicationReplay: {
          artifactSha256,
          completedAt: "2026-08-06T00:00:00.000Z",
          passed: true,
          reportSha256: "e".repeat(64),
          runId,
          suiteId: "application-rag-citation-v1",
        },
        reload: {
          readinessReportSha256: "f".repeat(64),
          readyAt: "2026-08-05T00:00:00.000Z",
          servedArtifactSha256: artifactSha256,
          serverId: "synthetic-server",
          runId,
        },
        rollback: {
          targetArtifactSha256: "1".repeat(64),
          targetAvailable: true,
          verifiedAt: "2026-08-04T00:00:00.000Z",
          runId,
        },
      };
      const artifactResolution = {
        artifactBytes,
        manifestBytes,
        registryId: artifact.registryId,
      };
      const options: WeightTrainingConformanceOptions = {
        approvalVerifier: {
          verifyLicense: async () => true,
          verifyPrivacy: async () => true,
        },
        artifactResolver: {
          resolve: async () => artifactResolution,
        },
        gateVerifier: { verify: async () => true },
        now: () => new Date("2026-08-10T00:00:00.000Z"),
        signatureVerifier: { verify: async () => true },
        verifyDatasetIdentity: identityVerifier,
      };
      return {
        activation,
        artifactResolution,
        batch,
        candidate: { artifact, gates, spec },
        identity,
        identityVerifier,
        options,
        sourceId,
      };
    },
  };
}

const DAY_MS = 86_400_000;

class ConformanceFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ConformanceFailure";
  }
}

function failure(code: string): never {
  throw new ConformanceFailure(code);
}

async function mustReject(work: () => unknown | Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    if (!isWeightTrainingContractRejection(error))
      failure("unexpected_failure");
    return;
  }
  failure("expected_rejection");
}

function cloneCandidate(value: unknown): {
  artifact: Record<string, unknown>;
  gates: Record<string, unknown>;
  spec: Record<string, unknown>;
} {
  if (!isRecord(value) || !isRecord(value.spec) || !isRecord(value.artifact))
    failure("fixture-candidate-shape");
  return {
    artifact: {
      ...value.artifact,
      provenance: isRecord(value.artifact.provenance)
        ? { ...value.artifact.provenance }
        : value.artifact.provenance,
      signature: isRecord(value.artifact.signature)
        ? { ...value.artifact.signature }
        : value.artifact.signature,
    },
    gates: isRecord(value.gates) ? { ...value.gates } : {},
    spec: {
      ...value.spec,
      approvals: isRecord(value.spec.approvals)
        ? {
            ...value.spec.approvals,
            license: isRecord(value.spec.approvals.license)
              ? { ...value.spec.approvals.license }
              : value.spec.approvals.license,
            privacy: isRecord(value.spec.approvals.privacy)
              ? { ...value.spec.approvals.privacy }
              : value.spec.approvals.privacy,
          }
        : value.spec.approvals,
      coordination: isRecord(value.spec.coordination)
        ? { ...value.spec.coordination }
        : value.spec.coordination,
      dataset: value.spec.dataset,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rebindCandidate(candidate: {
  artifact: Record<string, unknown>;
  spec: Record<string, unknown>;
  gates: Record<string, unknown>;
}) {
  const spec = candidate.spec as unknown as WeightTrainingRunSpec;
  const key = createWeightTrainingIdempotencyKey({ spec });
  candidate.spec.coordination = { idempotencyKey: key, leaseKey: key };
  if (isRecord(candidate.artifact.provenance))
    candidate.artifact.provenance.runSpecSha256 =
      createWeightTrainingRunSpecDigest({ spec });
}

function cloneActivation(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) failure("fixture-activation-shape");
  return {
    ...value,
    active: isRecord(value.active) ? { ...value.active } : value.active,
    applicationReplay: isRecord(value.applicationReplay)
      ? { ...value.applicationReplay }
      : value.applicationReplay,
    reload: isRecord(value.reload) ? { ...value.reload } : value.reload,
    rollback: isRecord(value.rollback) ? { ...value.rollback } : value.rollback,
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function seededPermutation<T>(values: readonly T[], seed: number) {
  const random = seededRandom(seed);
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function expectSameIdentity(
  left: TrainingDatasetIdentity,
  right: TrainingDatasetIdentity,
) {
  if (
    left.datasetSha256 !== right.datasetSha256 ||
    left.sourceBatchSha256 !== right.sourceBatchSha256 ||
    left.splitSha256.test !== right.splitSha256.test ||
    left.splitSha256.train !== right.splitSha256.train ||
    left.splitSha256.validation !== right.splitSha256.validation
  )
    failure("identity-not-deterministic");
}

async function runCase(
  caseId: WeightTrainingConformanceCaseId,
  check: () => unknown | Promise<unknown>,
): Promise<WeightTrainingConformanceCase> {
  try {
    await check();
    return Object.freeze({ caseId, issues: [], status: "passed" });
  } catch (error) {
    const code =
      error instanceof ConformanceFailure ? error.code : "unexpected_failure";
    return Object.freeze({
      caseId,
      issues: Object.freeze([{ code }]),
      status: "failed",
    });
  }
}

/** Runs provider-neutral, default-deny checks against a derived app's fixture ports. */
export async function runWeightTrainingConformanceSuite(
  harness: WeightTrainingConformanceHarness,
  options: { seed?: number } = {},
): Promise<WeightTrainingConformanceReport> {
  const seed = options.seed ?? 0x51_7a_9d_31;
  let fixture: WeightTrainingConformanceFixture;
  try {
    fixture = await harness.createFixture(seed);
  } catch {
    const cases = WEIGHT_TRAINING_CONFORMANCE_CASE_IDS.map((caseId) =>
      Object.freeze({
        caseId,
        issues: Object.freeze([{ code: "harness-unavailable" }]),
        status: "failed" as const,
      }),
    );
    return Object.freeze({
      cases: Object.freeze(cases),
      passed: false,
      schemaVersion: 1 as const,
      seed,
    });
  }

  const cases: WeightTrainingConformanceCase[] = [];
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[0], () =>
      mustReject(() =>
        authorizeWeightTrainingCandidate(
          structuredClone(fixture.candidate),
          fixture.options,
        ),
      ),
    ),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[1], async () => {
      const batch = structuredClone(fixture.batch) as PatternBatch;
      const test = batch.patterns.find(
        (pattern): pattern is ReviewedPattern =>
          pattern.status === "reviewed" && pattern.split === "test",
      );
      const train = batch.patterns.find(
        (pattern): pattern is ReviewedPattern =>
          pattern.status === "reviewed" && pattern.split === "train",
      );
      if (!test || !train) failure("missing-held-out-pattern");
      test.groupKey = "conformance-é";
      train.groupKey = "conformance-e\u0301";
      await mustReject(() =>
        createTrainingDatasetIdentity({
          batch,
          identityVerifier: fixture.identityVerifier,
          sourceId: fixture.sourceId,
        }),
      );
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[2], async () => {
      const first = await createTrainingDatasetIdentity({
        batch: fixture.batch,
        identityVerifier: fixture.identityVerifier,
        sourceId: fixture.sourceId,
      });
      const second = await createTrainingDatasetIdentity({
        batch: {
          ...fixture.batch,
          patterns: [...fixture.batch.patterns].reverse(),
        },
        identityVerifier: fixture.identityVerifier,
        sourceId: fixture.sourceId,
      });
      expectSameIdentity(first.identity, second.identity);
      const candidate = cloneCandidate(fixture.candidate);
      const spec = candidate.spec as unknown as WeightTrainingRunSpec;
      const key = createWeightTrainingIdempotencyKey({
        spec,
      });
      const reorderedSpec = {
        ...spec,
        approvals: {
          privacy: spec.approvals.privacy,
          license: spec.approvals.license,
        },
        baseModel: { ...spec.baseModel },
        budget: { ...spec.budget },
        trainer: { ...spec.trainer },
      };
      if (createWeightTrainingIdempotencyKey({ spec: reorderedSpec }) !== key)
        failure("idempotency-not-deterministic");
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[3], () => {
      const candidate = cloneCandidate(fixture.candidate);
      const approvals = candidate.spec.approvals as Record<string, unknown>;
      const privacy = approvals.privacy as Record<string, unknown>;
      privacy.expiresAt = "2000-01-01T00:00:00.000Z";
      rebindCandidate(candidate);
      return mustReject(() =>
        authorizeWeightTrainingCandidate(candidate, fixture.options),
      ).then(async () => {
        const binding = cloneCandidate(fixture.candidate);
        const bindingApprovals = binding.spec.approvals as Record<
          string,
          unknown
        >;
        (bindingApprovals.license as Record<string, unknown>).runId =
          "different-run";
        rebindCandidate(binding);
        await mustReject(() =>
          authorizeWeightTrainingCandidate(binding, fixture.options),
        );
      });
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[4], () => {
      // Read the harness payload outside the contract call so backend failures
      // are reported as unexpected failures, never as successful rejections.
      void fixture.artifactResolution;
      const badArtifactBytes = {
        ...fixture.options,
        artifactResolver: {
          resolve: async () => ({
            ...fixture.artifactResolution,
            artifactBytes: [...fixture.artifactResolution.artifactBytes, 0],
          }),
        },
      };
      return mustReject(() =>
        authorizeWeightTrainingCandidate(fixture.candidate, badArtifactBytes),
      ).then(async () => {
        const badManifest = {
          ...fixture.options,
          artifactResolver: {
            resolve: async () => ({
              ...fixture.artifactResolution,
              manifestBytes: [...fixture.artifactResolution.manifestBytes, 0],
            }),
          },
        };
        await mustReject(() =>
          authorizeWeightTrainingCandidate(fixture.candidate, badManifest),
        );
        const badRegistry = {
          ...fixture.options,
          artifactResolver: {
            resolve: async () => ({
              ...fixture.artifactResolution,
              registryId: "untrusted-registry",
            }),
          },
        };
        await mustReject(() =>
          authorizeWeightTrainingCandidate(fixture.candidate, badRegistry),
        );
      });
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[5], async () => {
      await mustReject(() =>
        authorizeWeightTrainingCandidate(fixture.candidate, {
          ...fixture.options,
          signatureVerifier: {
            verify: async () => "truthy" as unknown as boolean,
          },
        }),
      );
      await mustReject(() =>
        authorizeWeightTrainingCandidate(fixture.candidate, {
          ...fixture.options,
          gateVerifier: { verify: async () => "truthy" as unknown as boolean },
        }),
      );
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[6], () => {
      let now = fixture.options.now?.()?.getTime() ?? Date.now();
      const delayedOptions = {
        ...fixture.options,
        now: () => new Date(now),
        artifactResolver: {
          resolve: async () => {
            now += 31 * DAY_MS;
            return fixture.artifactResolution;
          },
        },
      };
      return mustReject(() =>
        authorizeWeightTrainingCandidate(fixture.candidate, delayedOptions),
      );
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[7], () => {
      const candidate = cloneCandidate(fixture.candidate);
      if (!isRecord(candidate.artifact.provenance))
        failure("missing-provenance");
      candidate.artifact.provenance.datasetSha256 = "0".repeat(64);
      return mustReject(() =>
        authorizeWeightTrainingCandidate(candidate, fixture.options),
      );
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[8], async () => {
      const accepted = await authorizeWeightTrainingCandidate(
        fixture.candidate,
        fixture.options,
      );
      const activation = cloneActivation(fixture.activation);
      const active = activation.active as Record<string, unknown>;
      const replayEvidence = activation.applicationReplay as Record<
        string,
        unknown
      >;
      replayEvidence.completedAt = active.observedAt;
      active.observedAt = "2026-01-01T00:00:00.000Z";
      await mustReject(() =>
        assertWeightTrainingActivationReady(
          accepted,
          activation,
          fixture.options,
        ),
      );
      const rollback = cloneActivation(fixture.activation);
      (rollback.rollback as Record<string, unknown>).targetAvailable = false;
      await mustReject(() =>
        assertWeightTrainingActivationReady(
          accepted,
          rollback,
          fixture.options,
        ),
      );
      const invalidReplay = cloneActivation(fixture.activation);
      (invalidReplay.applicationReplay as Record<string, unknown>).passed =
        false;
      await mustReject(() =>
        assertWeightTrainingActivationReady(
          accepted,
          invalidReplay,
          fixture.options,
        ),
      );
    }),
  );
  cases.push(
    await runCase(WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[9], async () => {
      const authorized = await authorizeWeightTraining(
        fixture.candidate,
        fixture.activation,
        fixture.options,
      );
      await mustReject(() =>
        assertWeightTrainingAuthorizationPermit(authorized.permit, {
          ...authorized.descriptor,
        }),
      );
      const gate = (fixture.candidate as Record<string, unknown>)
        .gates as Record<string, unknown>;
      const costGate = gate.cost as {
        evaluatedAt: string;
      };
      const expiresAt = new Date(
        Date.parse(costGate.evaluatedAt) + 30 * DAY_MS,
      );
      await mustReject(() =>
        assertWeightTrainingAuthorizationPermit(
          authorized.permit,
          authorized.descriptor,
          { now: () => expiresAt },
        ),
      );
    }),
  );
  for (let index = 0; index < 3; index += 1) {
    const caseId = WEIGHT_TRAINING_CONFORMANCE_CASE_IDS[10 + index];
    if (!caseId) failure("missing-property-case-id");
    const fixtureCandidate = fixture.candidate as Record<string, unknown>;
    const fixtureSpec = fixtureCandidate.spec as WeightTrainingRunSpec;
    cases.push(
      await runCase(caseId, async () => {
        const first = await createTrainingDatasetIdentity({
          batch: fixture.batch,
          identityVerifier: fixture.identityVerifier,
          sourceId: fixture.sourceId,
        });
        const shuffled = {
          ...fixture.batch,
          patterns: seededPermutation(fixture.batch.patterns, seed + index + 1),
        };
        const second = await createTrainingDatasetIdentity({
          batch: shuffled,
          identityVerifier: fixture.identityVerifier,
          sourceId: fixture.sourceId,
        });
        expectSameIdentity(first.identity, second.identity);
        if (
          compareCanonicalText("e\u0301", "é") !== 0 ||
          createWeightTrainingIdempotencyKey({
            spec: fixtureSpec,
          }) !==
            createWeightTrainingIdempotencyKey({
              spec: JSON.parse(JSON.stringify(fixtureSpec)),
            })
        )
          failure("seeded-determinism-failed");
      }),
    );
  }

  const frozenCases = Object.freeze(cases);
  return Object.freeze({
    cases: frozenCases,
    passed: frozenCases.every((result) => result.status === "passed"),
    schemaVersion: 1 as const,
    seed,
  });
}
