import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  classifyPublicApiChange,
  initializePublicApiBaselines,
  isDeclaredImpactSufficient,
  PUBLIC_API_TARGETS,
  REPOSITORY_ROOT,
  snapshotPublicApi,
  snapshotSha256,
  updatePublicApiBaselines,
} from "./check-public-api.mjs";

const checker = join(REPOSITORY_ROOT, "scripts/check-public-api.mjs");

function snapshot(packageName, entries) {
  return {
    schemaVersion: 1,
    packageName,
    source: `${packageName}/index.ts`,
    exports: entries,
  };
}

describe("public API compatibility classification", () => {
  it("classifies unchanged, additive, and breaking surfaces", () => {
    const previous = snapshot("@example/package", [
      { name: "keep", signature: "() => string" },
    ]);
    assert.deepEqual(classifyPublicApiChange(previous, previous), {
      added: [],
      changed: [],
      impact: "none",
      removed: [],
    });
    assert.deepEqual(
      classifyPublicApiChange(previous, {
        ...previous,
        exports: [...previous.exports, { name: "added", signature: "number" }],
      }),
      { added: ["added"], changed: [], impact: "minor", removed: [] },
    );
    assert.deepEqual(
      classifyPublicApiChange(previous, {
        ...previous,
        exports: [{ name: "keep", signature: "() => number" }],
      }),
      { added: [], changed: ["keep"], impact: "major", removed: [] },
    );
    assert.deepEqual(
      classifyPublicApiChange(previous, {
        ...previous,
        exports: [],
      }),
      { added: [], changed: [], impact: "major", removed: ["keep"] },
    );
  });

  it("uses deterministic ordering and hashes only the public surface", () => {
    const left = snapshot("@example/package", [
      { name: "b", signature: " string " },
      { name: "a", signature: "number" },
    ]);
    const right = snapshot("@example/package", [
      { name: "a", signature: "number" },
      { name: "b", signature: " string " },
    ]);
    assert.equal(snapshotSha256(left), snapshotSha256(right));
    assert.doesNotMatch(JSON.stringify(left), /source secret|private-token/);
    assert.equal(isDeclaredImpactSufficient("minor", "none"), true);
    assert.equal(isDeclaredImpactSufficient("minor", "minor"), true);
    assert.equal(isDeclaredImpactSufficient("minor", "major"), false);
    assert.equal(isDeclaredImpactSufficient("major", "major"), true);
  });
});

describe("compiler API snapshots", () => {
  it("captures both package roots and conformance exports without source text", () => {
    const snapshots = PUBLIC_API_TARGETS.map((target) =>
      snapshotPublicApi({ ...target, repositoryRoot: REPOSITORY_ROOT }),
    );
    const tuningNames = new Set(
      snapshots
        .find(({ packageName }) => packageName === "@arlequins/tuning-kit")
        .exports.map(({ name }) => name),
    );
    assert.equal(tuningNames.has("runWeightTrainingConformanceSuite"), true);
    assert.equal(
      tuningNames.has("createSyntheticWeightTrainingConformanceHarness"),
      true,
    );
    for (const value of snapshots) {
      assert.equal(
        value.exports.every(({ name, signature }) => name && signature),
        true,
      );
      assert.doesNotMatch(
        JSON.stringify(value),
        /BEGIN PRIVATE KEY|sk-[A-Za-z0-9]/,
      );
    }
  });
});

describe("baseline lifecycle", () => {
  it("initializes and records release metadata, hashes, and declared change", async () => {
    const directory = await mkdtemp(join(tmpdir(), "public-api-baseline-"));
    try {
      const snapshots = PUBLIC_API_TARGETS.map((target) =>
        snapshotPublicApi({ ...target, repositoryRoot: REPOSITORY_ROOT }),
      );
      const initial = initializePublicApiBaselines({
        baselineDirectory: directory,
        repositoryRoot: REPOSITORY_ROOT,
        snapshots,
      });
      assert.equal(initial.length, 2);
      assert.equal(initial[0].releaseVersion, "1.17.0");
      const changed = snapshots.map((value, index) =>
        index === 0
          ? {
              ...value,
              exports: [
                ...value.exports,
                { name: "newExport", signature: "string" },
              ],
            }
          : value,
      );
      const updated = updatePublicApiBaselines({
        baselineDirectory: directory,
        declaredChange: "minor",
        repositoryRoot: REPOSITORY_ROOT,
        snapshots: changed,
      });
      assert.equal(updated[0].previousSurfaceSha256, initial[0].surfaceSha256);
      assert.equal(updated[0].surfaceSha256, snapshotSha256(changed[0]));
      assert.equal(updated[0].declaredChange, "minor");
      assert.equal(updated[0].previousReleaseVersion, "1.17.0");
      const persisted = JSON.parse(
        await readFile(join(directory, "agent-core.json"), "utf8"),
      );
      assert.deepEqual(persisted, updated[0]);
      await assert.rejects(
        async () =>
          updatePublicApiBaselines({
            baselineDirectory: directory,
            declaredChange: "minor",
            repositoryRoot: REPOSITORY_ROOT,
            snapshots: snapshots.map((value, index) =>
              index === 0
                ? {
                    ...value,
                    exports: value.exports.map((entry) =>
                      entry.name === "createAgentRuntime"
                        ? { ...entry, signature: "breaking" }
                        : entry,
                    ),
                  }
                : value,
            ),
          }),
        /declared-impact-is-lower-than-calculated/,
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reports stable JSON and passes the committed baseline", () => {
    const result = spawnSync(process.execPath, [checker], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.command, "check-public-api");
    assert.equal(report.ok, true);
    assert.equal(report.calculatedImpact, "none");
    assert.equal(Object.hasOwn(report, "source"), false);
  });
});
