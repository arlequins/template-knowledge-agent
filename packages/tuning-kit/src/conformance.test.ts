import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createSyntheticWeightTrainingConformanceHarness,
  runWeightTrainingConformanceSuite,
  type WeightTrainingConformanceFixture,
  type WeightTrainingConformanceOptions,
} from "./conformance";
import type { PatternBatch } from "./index";
import {
  createTrainingDatasetIdentity,
  createWeightTrainingIdempotencyKey,
  createWeightTrainingRunSpecDigest,
  isWeightTrainingContractRejection,
  WeightTrainingContractRejection,
} from "./weight-training";

function sha256Bytes(value: readonly number[]) {
  return createHash("sha256").update(Uint8Array.from(value)).digest("hex");
}

function batch(): PatternBatch {
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

async function createFixture(): Promise<WeightTrainingConformanceFixture> {
  const sourceBatch = batch();
  const sourceId = "conformance-protected-source-v1";
  const identityVerifier = { verify: async () => true };
  const identity = (
    await createTrainingDatasetIdentity({
      batch: sourceBatch,
      identityVerifier,
      sourceId,
    })
  ).identity;
  const runId = "conformance-run-1";
  const baseWeightsSha256 = "a".repeat(64);
  const specWithoutKey = {
    approvals: {
      license: {
        approvedAt: "2026-08-20T00:00:00.000Z",
        approvedBy: "license-owner",
        approvalId: "license-approval",
        baseWeightsSha256,
        datasetSha256: identity.datasetSha256,
        decision: "approved" as const,
        expiresAt: "2026-12-20T00:00:00.000Z",
        policyVersion: "license-policy-v1",
        runId,
        sourceId,
      },
      privacy: {
        approvedAt: "2026-08-20T00:00:00.000Z",
        approvedBy: "privacy-owner",
        approvalId: "privacy-approval",
        baseWeightsSha256,
        datasetSha256: identity.datasetSha256,
        decision: "approved" as const,
        expiresAt: "2026-12-20T00:00:00.000Z",
        policyVersion: "privacy-policy-v1",
        runId,
        sourceId,
      },
    },
    baseModel: {
      modelId: "conformance-model-1",
      quantization: "q4",
      runtime: "conformance-runtime",
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
    dataset: identity,
    runId,
    schemaVersion: 2 as const,
    trainer: {
      codeSha256: "c".repeat(64),
      configSha256: "d".repeat(64),
      id: "conformance-trainer",
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
  const artifactBytes = [...new TextEncoder().encode("conformance-artifact")];
  const manifestBytes = [...new TextEncoder().encode("conformance-manifest")];
  const artifactSha256 = sha256Bytes(artifactBytes);
  const manifestSha256 = sha256Bytes(manifestBytes);
  const artifact = {
    artifactSha256,
    locator: `protected://sha256/${artifactSha256}`,
    manifestSha256,
    registryId: "conformance-registry-v1",
    provenance: {
      baseModelId: spec.baseModel.modelId,
      baseWeightsSha256,
      createdAt: "2026-08-21T00:00:00.000Z",
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
    signature: { algorithm: "ed25519", keyId: "conformance-key", value: "sig" },
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
        evaluatedAt: "2026-08-21T00:00:00.000Z",
        gate,
        passed: true as const,
        reportSha256: "1".repeat(64),
        runId,
        suiteId: `weight-training-${gate}-v1`,
        trainerConfigSha256: spec.trainer.configSha256,
      },
    ]),
  );
  const activation = {
    active: {
      artifactSha256,
      observedAt: "2026-08-22T00:00:00.000Z",
      runId,
      version: artifact.version,
    },
    applicationReplay: {
      artifactSha256,
      completedAt: "2026-08-22T00:00:00.000Z",
      passed: true as const,
      reportSha256: "2".repeat(64),
      runId,
      suiteId: "application-rag-citation-v1",
    },
    reload: {
      readinessReportSha256: "3".repeat(64),
      readyAt: "2026-08-22T00:00:00.000Z",
      servedArtifactSha256: artifactSha256,
      serverId: "conformance-server",
      runId,
    },
    rollback: {
      targetArtifactSha256: "4".repeat(64),
      targetAvailable: true as const,
      verifiedAt: "2026-08-22T00:00:00.000Z",
      runId,
    },
  };
  const options: WeightTrainingConformanceOptions = {
    approvalVerifier: {
      verifyLicense: async () => true,
      verifyPrivacy: async () => true,
    },
    artifactResolver: {
      resolve: async () => ({
        artifactBytes,
        manifestBytes,
        registryId: artifact.registryId,
      }),
    },
    gateVerifier: { verify: async () => true },
    now: () => new Date("2026-09-01T00:00:00.000Z"),
    signatureVerifier: { verify: async () => true },
    verifyDatasetIdentity: identityVerifier,
  };
  return {
    activation,
    artifactResolution: {
      artifactBytes,
      manifestBytes,
      registryId: artifact.registryId,
    },
    batch: sourceBatch,
    candidate: { artifact, gates, spec },
    identity,
    identityVerifier,
    options,
    sourceId,
  };
}

describe("weight-training conformance suite", () => {
  it("does not accept a forged rejection object as a contract rejection", () => {
    const forged = Object.create(WeightTrainingContractRejection.prototype);
    expect(isWeightTrainingContractRejection(forged)).toBe(false);
    expect(isWeightTrainingContractRejection(new Error("same message"))).toBe(
      false,
    );
  });

  it("provides a runnable public synthetic harness", async () => {
    const report = await runWeightTrainingConformanceSuite(
      createSyntheticWeightTrainingConformanceHarness(),
      { seed: 23 },
    );
    expect(report.passed).toBe(true);
    expect(report.cases.every((result) => result.status === "passed")).toBe(
      true,
    );
  });

  it("returns a stable, content-free machine-readable report", async () => {
    const report = await runWeightTrainingConformanceSuite(
      { createFixture },
      { seed: 17 },
    );
    expect(report.passed).toBe(true);
    expect(report.schemaVersion).toBe(1);
    expect(report.seed).toBe(17);
    expect(report.cases).toHaveLength(13);
    expect(report.cases.every((result) => result.status === "passed")).toBe(
      true,
    );
    expect(Object.isFrozen(report)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("conformance-artifact");
    expect(JSON.stringify(report)).not.toContain(
      "conformance-protected-source",
    );
  });

  it("redacts harness failures to stable issue codes", async () => {
    const report = await runWeightTrainingConformanceSuite({
      createFixture: async () => {
        throw new Error("private artifact bytes must not be reported");
      },
    });
    expect(report.passed).toBe(false);
    expect(report.cases.every((result) => result.status === "failed")).toBe(
      true,
    );
    expect(
      report.cases.every(
        (result) => result.issues[0]?.code === "harness-unavailable",
      ),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain("private artifact bytes");
  });

  it("does not treat an unexpected backend exception as a contract rejection", async () => {
    const fixture = await createFixture();
    Object.defineProperty(fixture, "artifactResolution", {
      get: () => {
        throw new Error("backend unavailable");
      },
    });
    const report = await runWeightTrainingConformanceSuite({
      createFixture: async () => fixture,
    });
    const artifactCase = report.cases.find(
      (result) => result.caseId === "WT-CONFORMANCE-005-artifact-content",
    );
    expect(artifactCase?.status).toBe("failed");
    expect(artifactCase?.issues[0]?.code).toBe("unexpected_failure");
  });
});
