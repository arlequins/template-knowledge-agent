import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  INTEGRATION_CONFORMANCE_PROTOCOLS,
  parseIntegrationQualificationArgs,
  qualifyIntegrations,
} from "./integration-qualification.mjs";

function validEnvelope(capability, overrides = {}) {
  const protocol = INTEGRATION_CONFORMANCE_PROTOCOLS[capability];
  return JSON.stringify({
    capability,
    cases: protocol.caseIds.map((id) => ({ id, issues: [], status: "passed" })),
    contractVersion: protocol.contractVersion,
    failedCases: 0,
    passed: true,
    passedCases: protocol.caseIds.length,
    schemaVersion: 1,
    ...overrides,
  });
}

async function fixture(manifest, packageOptions = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "integration-qualification-"));
  const packageDirectory = join(cwd, "packages", "acme-integration");
  await mkdir(join(packageDirectory, "src", "conformance"), {
    recursive: true,
  });
  await writeFile(
    join(cwd, "packages", "acme-integration", "integration.manifest.json"),
    JSON.stringify(manifest),
  );
  await writeFile(
    join(packageDirectory, "package.json"),
    JSON.stringify({ name: "@example/acme-integration", ...packageOptions }),
  );
  await writeFile(
    join(packageDirectory, "src", "conformance", "privacy-runner.ts"),
    "",
  );
  await writeFile(
    join(packageDirectory, "src", "conformance", "weight-training-runner.ts"),
    "",
  );
  return cwd;
}

test("disabled integrations are reported but are not production-qualified", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: false },
    weightTraining: { enabled: false },
  });
  try {
    const report = await qualifyIntegrations({ cwd });
    assert.equal(report.passed, true);
    assert.equal(report.productionQualified, false);
    assert.deepEqual(
      report.results.map(({ status, required }) => ({ status, required })),
      [
        { status: "disabled", required: false },
        { status: "disabled", required: false },
      ],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("enabled integrations ignore package scripts and execute the fixed runner", async () => {
  const cwd = await fixture(
    {
      schemaVersion: 1,
      package: "@example/acme-integration",
      privacy: { enabled: true },
      weightTraining: { enabled: false },
    },
    { scripts: { "conformance:privacy": "true" } },
  );
  const calls = [];
  try {
    const report = await qualifyIntegrations({
      cwd,
      exec(command, args) {
        calls.push([command, args]);
        return { status: 0, stdout: validEnvelope("privacy") };
      },
    });
    assert.equal(report.passed, true);
    assert.equal(report.productionQualified, false);
    assert.deepEqual(calls, [
      [
        "pnpm",
        [
          "--filter",
          "@example/acme-integration",
          "exec",
          "tsx",
          "src/conformance/privacy-runner.ts",
        ],
      ],
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("one package runs each enabled capability harness once", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: true },
    weightTraining: { enabled: true },
  });
  const calls = [];
  try {
    const report = await qualifyIntegrations({
      cwd,
      exec(command, args) {
        calls.push([command, args]);
        return {
          status: 0,
          stdout: validEnvelope(
            args.at(-1) === "src/conformance/privacy-runner.ts"
              ? "privacy"
              : "weight-training",
          ),
        };
      },
    });
    assert.equal(report.passed, true);
    assert.equal(report.productionQualified, true);
    assert.deepEqual(calls, [
      [
        "pnpm",
        [
          "--filter",
          "@example/acme-integration",
          "exec",
          "tsx",
          "src/conformance/privacy-runner.ts",
        ],
      ],
      [
        "pnpm",
        [
          "--filter",
          "@example/acme-integration",
          "exec",
          "tsx",
          "src/conformance/weight-training-runner.ts",
        ],
      ],
    ]);
    assert.deepEqual(
      report.results.map(({ status }) => status),
      ["passed", "passed"],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("mixed capability harness results prevent production qualification", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: true },
    weightTraining: { enabled: true },
  });
  const calls = [];
  try {
    const report = await qualifyIntegrations({
      cwd,
      exec(command, args) {
        calls.push([command, args]);
        return {
          status: args.at(-1) === "src/conformance/privacy-runner.ts" ? 0 : 1,
          stdout:
            args.at(-1) === "src/conformance/privacy-runner.ts"
              ? validEnvelope("privacy")
              : "",
        };
      },
    });
    assert.equal(report.passed, false);
    assert.equal(report.productionQualified, false);
    assert.deepEqual(calls, [
      [
        "pnpm",
        [
          "--filter",
          "@example/acme-integration",
          "exec",
          "tsx",
          "src/conformance/privacy-runner.ts",
        ],
      ],
      [
        "pnpm",
        [
          "--filter",
          "@example/acme-integration",
          "exec",
          "tsx",
          "src/conformance/weight-training-runner.ts",
        ],
      ],
    ]);
    assert.deepEqual(
      report.results.map(({ status, issues }) => ({ status, issues })),
      [
        { status: "passed", issues: [] },
        { status: "failed", issues: [{ code: "conformance-failed" }] },
      ],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("invalid manifests fail with a stable issue code", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "not-a-package",
    privacy: { enabled: false },
    weightTraining: { enabled: false },
  });
  try {
    const report = await qualifyIntegrations({ cwd });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [{ code: "manifest-invalid" }]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a manifest without a matching workspace package is not silently skipped", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: false },
    weightTraining: { enabled: false },
  });
  try {
    await rm(join(cwd, "packages", "acme-integration", "package.json"));
    const report = await qualifyIntegrations({ cwd });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [{ code: "manifest-invalid" }]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a symlinked integration directory is not silently skipped", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "integration-qualification-"));
  const outside = await mkdtemp(
    join(tmpdir(), "integration-qualification-outside-"),
  );
  try {
    await mkdir(join(cwd, "packages"), { recursive: true });
    await writeFile(
      join(outside, "integration.manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        package: "@example/acme-integration",
        privacy: { enabled: true },
        weightTraining: { enabled: false },
      }),
    );
    await writeFile(
      join(outside, "package.json"),
      JSON.stringify({ name: "@example/acme-integration" }),
    );
    await symlink(outside, join(cwd, "packages", "acme-integration"), "dir");
    const report = await qualifyIntegrations({ cwd });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [{ code: "manifest-invalid" }]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a symlinked runner parent is rejected before execution", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: true },
    weightTraining: { enabled: false },
  });
  const outside = await mkdtemp(
    join(tmpdir(), "integration-qualification-runner-parent-"),
  );
  const packageDirectory = join(cwd, "packages", "acme-integration");
  try {
    await mkdir(join(outside, "conformance"), { recursive: true });
    await writeFile(join(outside, "conformance", "privacy-runner.ts"), "");
    await rm(join(packageDirectory, "src"), { recursive: true, force: true });
    await symlink(outside, join(packageDirectory, "src"), "dir");
    const calls = [];
    const report = await qualifyIntegrations({
      cwd,
      exec() {
        calls.push(true);
        return { status: 0, stdout: validEnvelope("privacy") };
      },
    });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [
      { code: "integration-path-invalid" },
    ]);
    assert.deepEqual(calls, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a runner symlink is rejected even when it targets a file in the package", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: true },
    weightTraining: { enabled: false },
  });
  const packageDirectory = join(cwd, "packages", "acme-integration");
  try {
    await writeFile(
      join(packageDirectory, "src", "conformance", "runner-copy.ts"),
      "",
    );
    await rm(join(packageDirectory, "src", "conformance", "privacy-runner.ts"));
    await symlink(
      "runner-copy.ts",
      join(packageDirectory, "src", "conformance", "privacy-runner.ts"),
    );
    const report = await qualifyIntegrations({
      cwd,
      exec: () => ({ status: 0, stdout: validEnvelope("privacy") }),
    });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [
      { code: "integration-path-invalid" },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a dangling runner symlink is rejected with a stable issue", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: true },
    weightTraining: { enabled: false },
  });
  const packageDirectory = join(cwd, "packages", "acme-integration");
  try {
    await rm(join(packageDirectory, "src", "conformance", "privacy-runner.ts"));
    await symlink(
      join(packageDirectory, "missing-runner.ts"),
      join(packageDirectory, "src", "conformance", "privacy-runner.ts"),
    );
    const report = await qualifyIntegrations({
      cwd,
      exec: () => ({ status: 0, stdout: validEnvelope("privacy") }),
    });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [
      { code: "integration-path-invalid" },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a runner targeting outside the repository is rejected before execution", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: true },
    weightTraining: { enabled: false },
  });
  const outside = await mkdtemp(
    join(tmpdir(), "integration-qualification-runner-outside-"),
  );
  const packageDirectory = join(cwd, "packages", "acme-integration");
  try {
    const outsideRunner = join(outside, "privacy-runner.ts");
    await writeFile(outsideRunner, "");
    await rm(join(packageDirectory, "src", "conformance", "privacy-runner.ts"));
    await symlink(
      outsideRunner,
      join(packageDirectory, "src", "conformance", "privacy-runner.ts"),
    );
    const report = await qualifyIntegrations({
      cwd,
      exec: () => ({ status: 0, stdout: validEnvelope("privacy") }),
    });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [
      { code: "integration-path-invalid" },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a packages root symlink is rejected before discovering external integrations", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "integration-qualification-"));
  const outside = await mkdtemp(
    join(tmpdir(), "integration-qualification-packages-outside-"),
  );
  try {
    const packageDirectory = join(outside, "acme-integration");
    await mkdir(join(packageDirectory, "src", "conformance"), {
      recursive: true,
    });
    await writeFile(
      join(packageDirectory, "integration.manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        package: "@example/acme-integration",
        privacy: { enabled: true },
        weightTraining: { enabled: false },
      }),
    );
    await writeFile(
      join(packageDirectory, "package.json"),
      JSON.stringify({ name: "@example/acme-integration" }),
    );
    await writeFile(
      join(packageDirectory, "src", "conformance", "privacy-runner.ts"),
      "",
    );
    await symlink(outside, join(cwd, "packages"), "dir");
    const report = await qualifyIntegrations({
      cwd,
      exec: () => ({ status: 0, stdout: validEnvelope("privacy") }),
    });
    assert.equal(report.passed, false);
    assert.deepEqual(report.results[0]?.issues, [
      { code: "integration-path-invalid" },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("argument parsing accepts the machine-readable strict form", () => {
  assert.deepEqual(
    parseIntegrationQualificationArgs(["--", "--json", "--strict"]),
    {
      json: true,
      strict: true,
    },
  );
});

test("a zero-status command without a report is not qualified", async () => {
  const cwd = await fixture({
    schemaVersion: 1,
    package: "@example/acme-integration",
    privacy: { enabled: true },
    weightTraining: { enabled: false },
  });
  try {
    const result = await qualifyIntegrations({
      cwd,
      exec: () => ({ status: 0, stdout: "" }),
    });
    assert.equal(result.passed, false);
    assert.deepEqual(result.results[0]?.issues, [
      { code: "conformance-report-invalid" },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("partial and wrong-capability reports are rejected", async () => {
  const duplicateCases = JSON.parse(validEnvelope("privacy")).cases;
  duplicateCases[1] = duplicateCases[0];
  for (const stdout of [
    validEnvelope("privacy", {
      cases: [
        {
          id: "exact-personal-data.default-deny",
          issues: [],
          status: "passed",
        },
      ],
    }),
    validEnvelope("privacy", { capability: "weight-training" }),
    validEnvelope("privacy", { cases: duplicateCases }),
    validEnvelope("privacy", { failedCases: 1, passed: false }),
  ]) {
    const cwd = await fixture({
      schemaVersion: 1,
      package: "@example/acme-integration",
      privacy: { enabled: true },
      weightTraining: { enabled: false },
    });
    try {
      const result = await qualifyIntegrations({
        cwd,
        exec: () => ({ status: 0, stdout }),
      });
      assert.equal(result.passed, false);
      assert.deepEqual(result.results[0]?.issues, [
        { code: "conformance-report-invalid" },
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});
