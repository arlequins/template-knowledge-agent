import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assignDeterministicSplits,
  type PatternBatch,
  validatePatternBatch,
} from "./index";
import {
  assertWeightTrainingActivationReady,
  assertWeightTrainingAuthorizationPermit,
  authorizeWeightTraining,
  authorizeWeightTrainingCandidate,
  createTrainingDatasetIdentity,
  createWeightTrainingIdempotencyKey,
  createWeightTrainingRunSpecDigest,
  type TrainingDatasetIdentity,
  validateWeightTrainingRunSpec,
  type WeightTrainingCandidate,
} from "./weight-training";

const now = new Date("2026-09-01T00:00:00.000Z");

function digestBytes(value: readonly number[]) {
  return createHash("sha256").update(Uint8Array.from(value)).digest("hex");
}

function publicBatch(): PatternBatch {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../examples/tuning/reviewed-patterns.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as PatternBatch;
}

const identityVerifier = { verify: async () => true };
const approvalVerifier = {
  verifyLicense: async () => true,
  verifyPrivacy: async () => true,
};
const gateVerifier = { verify: async () => true };
const artifactBytes = [...new TextEncoder().encode("artifact-v1")];
const manifestBytes = [...new TextEncoder().encode("manifest-v1")];

async function identity(batch = publicBatch()) {
  return (
    await createTrainingDatasetIdentity({
      batch,
      identityVerifier,
      sourceId: "protected-reviewed-source-v1",
    })
  ).identity;
}

function approval(
  kind: string,
  dataset: TrainingDatasetIdentity,
  runId: string,
  baseWeightsSha256: string,
) {
  return {
    approvedAt: "2026-08-20T00:00:00.000Z",
    approvedBy: `${kind}-owner`,
    approvalId: `${kind}-approval`,
    baseWeightsSha256,
    datasetSha256: dataset.datasetSha256,
    decision: "approved" as const,
    expiresAt: "2026-12-20T00:00:00.000Z",
    policyVersion: `${kind}-policy-v1`,
    runId,
    sourceId: dataset.sourceId,
  };
}

function makeSpec(
  dataset: TrainingDatasetIdentity,
): WeightTrainingCandidate["spec"] {
  const runId = "run-example-1";
  const baseWeightsSha256 = "a".repeat(64);
  const withoutKey = {
    approvals: {
      license: approval("license", dataset, runId, baseWeightsSha256),
      privacy: approval("privacy", dataset, runId, baseWeightsSha256),
    },
    baseModel: {
      modelId: "example-model-1",
      quantization: "q4",
      runtime: "example-runtime",
      weightsSha256: baseWeightsSha256,
    },
    budget: {
      leaseSeconds: 300,
      maxConcurrentRuns: 1,
      maxCostUsd: 10,
      maxDurationSeconds: 3_600,
    },
    coordination: { idempotencyKey: "", leaseKey: "" },
    createdAt: "2026-08-20T00:00:00.000Z",
    dataset,
    runId,
    schemaVersion: 2 as const,
    trainer: {
      codeSha256: "c".repeat(64),
      configSha256: "d".repeat(64),
      id: "example-trainer",
      version: "1.0.0",
    },
  };
  const idempotencyKey = createWeightTrainingIdempotencyKey({
    spec: withoutKey,
  });
  return {
    ...withoutKey,
    coordination: { idempotencyKey, leaseKey: idempotencyKey },
  };
}

async function candidate(): Promise<WeightTrainingCandidate> {
  const dataset = await identity();
  const spec = makeSpec(dataset);
  const artifactSha256 = digestBytes(artifactBytes);
  const manifestSha256 = digestBytes(manifestBytes);
  const artifact = {
    artifactSha256,
    locator: `protected://sha256/${artifactSha256}`,
    manifestSha256,
    registryId: "training-registry-v1",
    provenance: {
      baseModelId: spec.baseModel.modelId,
      baseWeightsSha256: spec.baseModel.weightsSha256,
      createdAt: "2026-08-21T00:00:00.000Z",
      datasetSha256: dataset.datasetSha256,
      manifestSha256,
      quantization: spec.baseModel.quantization,
      runId: spec.runId,
      runSpecSha256: createWeightTrainingRunSpecDigest({
        spec,
      }),
      runtime: spec.baseModel.runtime,
      sourceBatchSha256: dataset.sourceBatchSha256,
      trainerCodeSha256: spec.trainer.codeSha256,
      trainerConfigSha256: spec.trainer.configSha256,
    },
    signature: { algorithm: "ed25519", keyId: "training-key-1", value: "sig" },
    version: `sha256-${artifactSha256}`,
  };
  const gate = (
    gateName: typeof import("./weight-training")["WEIGHT_TRAINING_GATES"][number],
    reportSha256: string,
  ) => ({
    artifactSha256,
    baseWeightsSha256: spec.baseModel.weightsSha256,
    datasetSha256: spec.dataset.datasetSha256,
    evaluatedAt: "2026-08-21T00:00:00.000Z",
    gate: gateName,
    passed: true as const,
    reportSha256,
    runId: spec.runId,
    suiteId: `weight-training-${gateName}-v1`,
    trainerConfigSha256: spec.trainer.configSha256,
  });
  const gates = {
    authorization: gate("authorization", "1".repeat(64)),
    citation: gate("citation", "2".repeat(64)),
    cost: gate("cost", "3".repeat(64)),
    "held-out": gate("held-out", "4".repeat(64)),
    language: gate("language", "5".repeat(64)),
    latency: gate("latency", "6".repeat(64)),
    privacy: gate("privacy", "7".repeat(64)),
    repetition: gate("repetition", "8".repeat(64)),
    "split-integrity": gate("split-integrity", "9".repeat(64)),
    "unsupported-claims": gate("unsupported-claims", "a".repeat(64)),
  };
  return { artifact, gates, spec };
}

function activation(input: WeightTrainingCandidate) {
  const at = "2026-08-22T00:00:00.000Z";
  return {
    active: {
      artifactSha256: input.artifact.artifactSha256,
      observedAt: at,
      runId: input.spec.runId,
      version: input.artifact.version,
    },
    applicationReplay: {
      artifactSha256: input.artifact.artifactSha256,
      completedAt: at,
      passed: true as const,
      reportSha256: "1".repeat(64),
      runId: input.spec.runId,
      suiteId: "application-rag-citation-v1",
    },
    reload: {
      readinessReportSha256: "2".repeat(64),
      readyAt: at,
      servedArtifactSha256: input.artifact.artifactSha256,
      serverId: "server-1",
      runId: input.spec.runId,
    },
    rollback: {
      targetArtifactSha256: "3".repeat(64),
      targetAvailable: true as const,
      verifiedAt: at,
      runId: input.spec.runId,
    },
  };
}

const options = {
  approvalVerifier,
  artifactResolver: {
    resolve: async () => ({
      artifactBytes,
      manifestBytes,
      registryId: "training-registry-v1",
    }),
  },
  gateVerifier,
  now: () => now,
  signatureVerifier: { verify: async () => true },
  verifyDatasetIdentity: identityVerifier,
};

describe("weight-training readiness contract", () => {
  it("requires external identity verification and freezes canonical identity", async () => {
    const created = await createTrainingDatasetIdentity({
      batch: publicBatch(),
      identityVerifier,
      sourceId: "protected-reviewed-source-v1",
    });
    expect(Object.isFrozen(created.identity)).toBe(true);
    expect(Object.isFrozen(created.identity.rows)).toBe(true);
    expect(() => {
      (created.identity as { datasetSha256: string }).datasetSha256 =
        "0".repeat(64);
    }).toThrow();
    await expect(
      createTrainingDatasetIdentity({
        batch: publicBatch(),
        identityVerifier: { verify: async () => "yes" as unknown as boolean },
        sourceId: "protected-reviewed-source-v1",
      }),
    ).rejects.toThrow("rejected");
  });

  it("uses internal SHA-256 even when an untrusted constant callback is supplied", async () => {
    const created = await createTrainingDatasetIdentity({
      batch: publicBatch(),
      identityVerifier,
      sourceId: "constant-hash-callback",
      sha256: () => "0".repeat(64),
    } as unknown as Parameters<typeof createTrainingDatasetIdentity>[0]);
    expect(created.identity.datasetSha256).not.toBe("0".repeat(64));
    const dataset = created.identity;
    const spec = makeSpec(dataset);
    expect(createWeightTrainingIdempotencyKey({ spec })).not.toBe(
      "0".repeat(64),
    );
  });

  it("normalizes NFC-equivalent groups before split leakage checks", () => {
    const batch = publicBatch();
    const test = batch.patterns.find(
      (pattern) => pattern.status === "reviewed" && pattern.split === "test",
    );
    const train = batch.patterns.find(
      (pattern) => pattern.status === "reviewed" && pattern.split === "train",
    );
    if (!test || !train) throw new Error("Missing split patterns");
    test.groupKey = "leak-é";
    train.groupKey = "leak-e\u0301";
    expect(validatePatternBatch(batch).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "split-leakage" }),
      ]),
    );
    const assigned = assignDeterministicSplits(
      Array.from({ length: 7 }, (_, index) => ({
        groupKey:
          index === 1
            ? "group-é"
            : index === 5
              ? "group-e\u0301"
              : `group-${index}`,
        id: String(index),
      })),
    ).filter((pattern) => pattern.groupKey.normalize("NFC") === "group-é");
    expect(assigned).toHaveLength(2);
    expect(assigned[0]?.split).toBe(assigned[1]?.split);
  });

  it("is independent of row order and binds full split content", async () => {
    const batch = publicBatch();
    const first = await createTrainingDatasetIdentity({
      batch,
      identityVerifier,
      sourceId: "source",
    });
    const second = await createTrainingDatasetIdentity({
      batch: { ...batch, patterns: [...batch.patterns].reverse() },
      identityVerifier,
      sourceId: "source",
    });
    expect(second.identity).toEqual(first.identity);
    const changed = structuredClone(batch);
    const test = changed.patterns.find(
      (pattern) => pattern.status === "reviewed" && pattern.split === "test",
    );
    if (test?.status !== "reviewed") throw new Error("Missing test pattern");
    test.answer = `${test.answer} changed content`;
    const changedIdentity = await createTrainingDatasetIdentity({
      batch: changed,
      identityVerifier,
      sourceId: "source",
    });
    expect(changedIdentity.identity.splitSha256.test).not.toBe(
      first.identity.splitSha256.test,
    );
  });

  it("rejects NFC-equivalent duplicate IDs and empty held-outs", async () => {
    const batch = publicBatch();
    const first = batch.patterns.find(
      (pattern) => pattern.status === "reviewed",
    );
    if (!first) throw new Error("Missing pattern");
    const duplicate = structuredClone(first);
    first.id = "pattern-é";
    duplicate.id = "pattern-e\u0301";
    duplicate.question = `${first.question} alternate wording`;
    duplicate.answer = `${first.answer} alternate wording`;
    batch.patterns.push(duplicate);
    await expect(
      createTrainingDatasetIdentity({
        batch,
        identityVerifier,
        sourceId: "source",
      }),
    ).rejects.toThrow("unique");
    const empty = publicBatch();
    empty.patterns = empty.patterns.filter(
      (pattern) => pattern.status !== "reviewed" || pattern.split !== "test",
    );
    await expect(
      createTrainingDatasetIdentity({
        batch: empty,
        identityVerifier,
        sourceId: "source",
      }),
    ).rejects.toThrow("quality gates");
  });

  it("requires canonical idempotency and external approval evidence", async () => {
    const input = await candidate();
    const bad = structuredClone(input) as unknown as Record<string, unknown>;
    (bad.spec as Record<string, unknown>).coordination = {
      idempotencyKey: "b".repeat(64),
      leaseKey: "b".repeat(64),
    };
    await expect(
      authorizeWeightTrainingCandidate(bad, options),
    ).rejects.toThrow("rejected");
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        approvalVerifier: {
          verifyLicense: async () => false,
          verifyPrivacy: async () => true,
        },
      }),
    ).rejects.toThrow("rejected");
  });

  it("requires exact artifact, provenance, gate, and verifier bindings", async () => {
    const input = await candidate();
    const bad = structuredClone(input) as unknown as Record<string, unknown>;
    const artifact = bad.artifact as Record<string, unknown>;
    artifact.locator = "protected://stable/model";
    await expect(
      authorizeWeightTrainingCandidate(bad, options),
    ).rejects.toThrow("rejected");
    const gate = (input.gates as Record<string, Record<string, unknown>>)
      .citation;
    const gateBad = structuredClone(input) as unknown as Record<
      string,
      unknown
    >;
    (gateBad.gates as Record<string, Record<string, unknown>>).citation = {
      ...gate,
      artifactSha256: "0".repeat(64),
    };
    await expect(
      authorizeWeightTrainingCandidate(gateBad, options),
    ).rejects.toThrow("rejected");
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        signatureVerifier: { verify: async () => "yes" as unknown as boolean },
      }),
    ).rejects.toThrow("rejected");
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        signatureVerifier: {
          verify: async ({ artifact }) => {
            (artifact as { version: string }).version = "mutable";
            return true;
          },
        },
      }),
    ).rejects.toThrow("rejected");
  });

  it("rejects protected bytes that do not match the declared artifact hashes", async () => {
    const input = await candidate();
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        artifactResolver: {
          resolve: async () => ({
            artifactBytes: [...artifactBytes, 0],
            manifestBytes,
            registryId: "training-registry-v1",
          }),
        },
      }),
    ).rejects.toThrow("rejected");
  });

  it("revalidates freshness after delayed external verifiers", async () => {
    const input = await candidate();
    let fakeNow = now.getTime();
    const delayed = {
      ...options,
      now: () => new Date(fakeNow),
      verifyDatasetIdentity: {
        verify: async () => {
          fakeNow += 31 * 86_400_000;
          return true;
        },
      },
    };
    await expect(
      authorizeWeightTrainingCandidate(input, delayed),
    ).rejects.toThrow("rejected");
  });

  it("revalidates freshness after delayed artifact verification", async () => {
    const input = await candidate();
    let fakeNow = now.getTime();
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        now: () => new Date(fakeNow),
        artifactResolver: {
          resolve: async () => {
            fakeNow += 31 * 86_400_000;
            return {
              artifactBytes,
              manifestBytes,
              registryId: "training-registry-v1",
            };
          },
        },
      }),
    ).rejects.toThrow("rejected");
  });

  it("freezes the run snapshot before verifiers can mutate the caller", async () => {
    const input = await candidate();
    const mutableSpec = {
      ...input.spec,
      approvals: {
        license: { ...input.spec.approvals.license },
        privacy: { ...input.spec.approvals.privacy },
      },
    };
    const report = await validateWeightTrainingRunSpec(mutableSpec, {
      ...options,
      verifyDatasetIdentity: {
        verify: async () => {
          mutableSpec.approvals.privacy.expiresAt = "2020-01-01T00:00:00.000Z";
          return true;
        },
      },
    });
    expect(report.passed).toBe(true);
  });

  it("requires every gate verifier and rejects verifier errors", async () => {
    const input = await candidate();
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        gateVerifier: { verify: async () => false },
      }),
    ).rejects.toThrow("rejected");
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        gateVerifier: { verify: async () => "yes" as unknown as boolean },
      }),
    ).rejects.toThrow("rejected");
    await expect(
      authorizeWeightTrainingCandidate(input, {
        ...options,
        gateVerifier: {
          verify: async () => {
            throw new Error("down");
          },
        },
      }),
    ).rejects.toThrow("rejected");
  });

  it("rejects stale, distant, and future evidence", async () => {
    const staleApproval = await candidate();
    const privacy = (
      staleApproval.spec.approvals as Record<string, Record<string, unknown>>
    ).privacy!;
    privacy.approvedAt = "2026-07-01T00:00:00.000Z";
    await expect(
      authorizeWeightTrainingCandidate(staleApproval, options),
    ).rejects.toThrow("rejected");

    const distantApproval = await candidate();
    const license = (
      distantApproval.spec.approvals as Record<string, Record<string, unknown>>
    ).license!;
    license.expiresAt = "2028-09-01T00:00:00.000Z";
    await expect(
      authorizeWeightTrainingCandidate(distantApproval, options),
    ).rejects.toThrow("rejected");

    const staleGate = await candidate();
    const cost = (staleGate.gates as Record<string, Record<string, unknown>>)
      .cost!;
    cost.evaluatedAt = "2026-07-01T00:00:00.000Z";
    await expect(
      authorizeWeightTrainingCandidate(staleGate, options),
    ).rejects.toThrow("rejected");
  });

  it("requires ordered activation evidence and binds a descriptor permit", async () => {
    const input = await candidate();
    const acceptedCandidate = await authorizeWeightTrainingCandidate(
      input,
      options,
    );
    const activationEvidence = activation(input);
    const authorized = await authorizeWeightTraining(
      input,
      activationEvidence,
      options,
    );
    expect(Object.isFrozen(authorized.descriptor)).toBe(true);
    expect(() =>
      assertWeightTrainingAuthorizationPermit(
        authorized.permit,
        authorized.descriptor,
        { now: () => now },
      ),
    ).not.toThrow();
    expect(() =>
      assertWeightTrainingAuthorizationPermit(
        { ...authorized.permit },
        authorized.descriptor,
      ),
    ).toThrow("module-issued");
    expect(() =>
      assertWeightTrainingAuthorizationPermit(authorized.permit, {
        ...authorized.descriptor,
      }),
    ).toThrow("exact descriptor");
    const second = await authorizeWeightTraining(
      input,
      activationEvidence,
      options,
    );
    expect(() =>
      assertWeightTrainingAuthorizationPermit(
        authorized.permit,
        second.descriptor,
      ),
    ).toThrow("exact descriptor");
    expect(() =>
      assertWeightTrainingAuthorizationPermit(
        authorized.permit,
        authorized.descriptor,
        { now: () => new Date("2026-09-20T00:00:00.000Z") },
      ),
    ).toThrow("expired");
    const outOfOrder = activation(acceptedCandidate);
    outOfOrder.applicationReplay.completedAt = "2026-08-23T00:00:00.000Z";
    outOfOrder.active.observedAt = "2026-08-22T00:00:00.000Z";
    expect(() =>
      assertWeightTrainingActivationReady(acceptedCandidate, outOfOrder, {
        now: () => now,
      }),
    ).toThrow("chronologically");
  });

  it("rejects fabricated candidates and invalid activation clocks", async () => {
    const input = await candidate();
    const evidence = activation(input);
    expect(() =>
      assertWeightTrainingActivationReady(structuredClone(input), evidence, {
        now: () => now,
      }),
    ).toThrow("authorized candidate");
    const authorized = await authorizeWeightTraining(input, evidence, options);
    expect(() =>
      assertWeightTrainingAuthorizationPermit(
        authorized.permit,
        authorized.descriptor,
        { now: () => new Date("invalid") },
      ),
    ).toThrow("clock");
  });

  it("expires at the explicit approval deadline boundary", async () => {
    const input = await candidate();
    Object.assign(input.spec.approvals.privacy, {
      expiresAt: "2026-09-10T00:00:00.000Z",
    });
    Object.assign(input.spec.approvals.license, {
      expiresAt: "2026-09-10T00:00:00.000Z",
    });
    const idempotencyKey = createWeightTrainingIdempotencyKey({
      spec: input.spec,
    });
    Object.assign(input.spec.coordination, {
      idempotencyKey,
      leaseKey: idempotencyKey,
    });
    Object.assign(input.artifact.provenance, {
      runSpecSha256: createWeightTrainingRunSpecDigest({ spec: input.spec }),
    });
    const authorized = await authorizeWeightTraining(
      input,
      activation(input),
      options,
    );
    expect(() =>
      assertWeightTrainingAuthorizationPermit(
        authorized.permit,
        authorized.descriptor,
        { now: () => new Date("2026-09-09T23:59:59.999Z") },
      ),
    ).not.toThrow();
    expect(() =>
      assertWeightTrainingAuthorizationPermit(
        authorized.permit,
        authorized.descriptor,
        { now: () => new Date("2026-09-10T00:00:00.000Z") },
      ),
    ).toThrow("expired");
  });
});
