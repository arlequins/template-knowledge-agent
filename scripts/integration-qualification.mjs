#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants, lstatSync, realpathSync } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_NAME = "integration.manifest.json";
const PACKAGE_PATTERN = /^@[a-z0-9-]+\/[a-z][a-z0-9-]*-integration$/u;
export const INTEGRATION_CONFORMANCE_PROTOCOLS = Object.freeze({
  privacy: Object.freeze({
    capability: "privacy",
    contractVersion: "exact-personal-data-conformance-v1",
    caseIds: Object.freeze([
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
    ]),
  }),
  "weight-training": Object.freeze({
    capability: "weight-training",
    contractVersion: "weight-training-conformance-v1",
    caseIds: Object.freeze([
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
    ]),
  }),
});
const CAPABILITIES = Object.freeze([
  Object.freeze({
    field: "privacy",
    capability: "privacy",
    runner: "src/conformance/privacy-runner.ts",
  }),
  Object.freeze({
    field: "weightTraining",
    capability: "weight-training",
    runner: "src/conformance/weight-training-runner.ts",
  }),
]);

export function parseIntegrationQualificationArgs(args) {
  const options = { json: false, strict: false };
  for (const argument of args) {
    if (argument === "--") continue;
    if (argument === "--json") options.json = true;
    else if (argument === "--strict") options.strict = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function issueResult(integrationPackage, capability, status, code) {
  return {
    capability,
    integrationPackage,
    issues: code ? [{ code }] : [],
    required: status !== "disabled",
    status,
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function hasSafeRunnerPath(cwd, packageDirectory, runner) {
  try {
    const repositoryRoot = resolve(cwd);
    const packagePath = resolve(packageDirectory);
    const runnerPath = resolve(packagePath, runner);
    if (
      !isInside(repositoryRoot, packagePath) ||
      !isInside(packagePath, runnerPath)
    )
      return false;
    const repositoryRealPath = realpathSync(repositoryRoot);
    const packageRealPath = realpathSync(packagePath);
    if (
      !isInside(repositoryRealPath, packageRealPath) ||
      !isInside(packagePath, runnerPath)
    )
      return false;
    const pathParts = relative(repositoryRoot, runnerPath).split(sep);
    let current = repositoryRoot;
    for (const part of pathParts) {
      current = resolve(current, part);
      const metadata = lstatSync(current, { throwIfNoEntry: false });
      if (!metadata || metadata.isSymbolicLink()) return false;
    }
    const runnerMetadata = lstatSync(runnerPath, { throwIfNoEntry: false });
    if (!runnerMetadata?.isFile()) return false;
    const runnerRealPath = realpathSync(runnerPath);
    return (
      isInside(repositoryRealPath, runnerRealPath) &&
      isInside(packageRealPath, runnerRealPath)
    );
  } catch {
    return false;
  }
}

function validateManifest(value, packageName) {
  if (!isRecord(value) || value.schemaVersion !== 1)
    return { code: "manifest-invalid" };
  if (
    typeof value.package !== "string" ||
    value.package !== packageName ||
    !PACKAGE_PATTERN.test(value.package)
  )
    return { code: "manifest-invalid" };
  for (const capability of ["privacy", "weightTraining"])
    if (
      !isRecord(value[capability]) ||
      typeof value[capability].enabled !== "boolean"
    )
      return { code: "manifest-invalid" };
  return undefined;
}

async function readJsonFromOpenedFile(path) {
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error("not-a-regular-file");
    return JSON.parse(await handle.readFile("utf8"));
  } finally {
    await handle.close();
  }
}

export async function discoverIntegrationManifests(cwd = process.cwd()) {
  const packagesRoot = resolve(cwd, "packages");
  const entries = await readdir(packagesRoot, { withFileTypes: true }).catch(
    (error) => {
      if (error?.code === "ENOENT") return [];
      throw error;
    },
  );
  const manifests = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      if (entry.name.endsWith("-integration"))
        manifests.push({
          path: resolve(packagesRoot, entry.name, MANIFEST_NAME),
          packageDirectory: resolve(packagesRoot, entry.name),
          packageName: undefined,
          value: undefined,
        });
      continue;
    }
    if (!entry.isDirectory()) continue;
    const path = resolve(packagesRoot, entry.name, MANIFEST_NAME);
    const manifestStat = await lstat(path).catch((error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
    if (manifestStat?.isSymbolicLink()) {
      manifests.push({
        path,
        packageDirectory: resolve(packagesRoot, entry.name),
        packageName: undefined,
        value: undefined,
      });
      continue;
    }
    let value;
    try {
      value = await readJsonFromOpenedFile(path);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
    }
    let packageName;
    const packagePath = resolve(packagesRoot, entry.name, "package.json");
    const packageStat = await lstat(packagePath).catch((error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
    if (packageStat?.isSymbolicLink()) {
      manifests.push({
        path,
        packageDirectory: resolve(packagesRoot, entry.name),
        packageName: undefined,
        value: undefined,
      });
      continue;
    }
    try {
      const packageJson = await readJsonFromOpenedFile(packagePath);
      packageName = packageJson.name;
    } catch (_error) {
      packageName = undefined;
    }
    manifests.push({
      path,
      packageDirectory: resolve(packagesRoot, entry.name),
      packageName,
      value,
    });
  }
  return manifests.sort((left, right) => left.path.localeCompare(right.path));
}

function expectedKeys(value) {
  return Object.keys(value).sort().join("\u0000");
}

function validateConformanceReport(stdout, capability) {
  const protocol = INTEGRATION_CONFORMANCE_PROTOCOLS[capability];
  if (!protocol || typeof stdout !== "string" || stdout.trim() === "")
    return false;
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    return false;
  }
  if (!isRecord(value)) return false;
  if (
    expectedKeys(value) !==
    "capability\u0000cases\u0000contractVersion\u0000failedCases\u0000passed\u0000passedCases\u0000schemaVersion"
  )
    return false;
  if (
    value.schemaVersion !== 1 ||
    value.capability !== protocol.capability ||
    value.contractVersion !== protocol.contractVersion ||
    value.passed !== true ||
    value.failedCases !== 0 ||
    value.passedCases !== protocol.caseIds.length ||
    !Array.isArray(value.cases) ||
    value.cases.length !== protocol.caseIds.length
  )
    return false;
  return value.cases.every((result, index) => {
    if (!isRecord(result)) return false;
    if (expectedKeys(result) !== "id\u0000issues\u0000status") return false;
    return (
      result.id === protocol.caseIds[index] &&
      result.status === "passed" &&
      Array.isArray(result.issues) &&
      result.issues.length === 0
    );
  });
}

function runConformance(
  cwd,
  packageDirectory,
  packageName,
  capability,
  runner,
  exec = spawnSync,
) {
  if (!hasSafeRunnerPath(cwd, packageDirectory, runner))
    return { code: "integration-path-invalid", passed: false };
  let result;
  try {
    result = exec("pnpm", ["--filter", packageName, "exec", "tsx", runner], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return { code: "conformance-failed", passed: false };
  }
  if (result?.status !== 0)
    return { code: "conformance-failed", passed: false };
  return validateConformanceReport(result.stdout, capability)
    ? { passed: true }
    : { code: "conformance-report-invalid", passed: false };
}

export async function qualifyIntegrations({
  cwd = process.cwd(),
  exec = spawnSync,
} = {}) {
  const manifests = await discoverIntegrationManifests(cwd);
  const results = [];
  for (const manifest of manifests) {
    const validation = validateManifest(manifest.value, manifest.packageName);
    if (validation) {
      results.push(
        issueResult("unknown", "manifest", "failed", validation.code),
      );
      continue;
    }
    const { package: integrationPackage } = manifest.value;
    for (const { field, capability, runner } of CAPABILITIES) {
      if (!manifest.value[field].enabled) {
        results.push(
          issueResult(integrationPackage, capability, "disabled", undefined),
        );
      } else {
        const conformancePassed = runConformance(
          cwd,
          manifest.packageDirectory,
          integrationPackage,
          capability,
          runner,
          exec,
        );
        results.push(
          conformancePassed.passed
            ? issueResult(integrationPackage, capability, "passed", undefined)
            : issueResult(
                integrationPackage,
                capability,
                "failed",
                conformancePassed.code,
              ),
        );
      }
    }
  }
  const failed = results.some((result) => result.status === "failed");
  return {
    productionQualified:
      results.length > 0 &&
      results.every((result) => result.status === "passed"),
    results,
    schemaVersion: 1,
    passed: !failed,
  };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  try {
    const options = parseIntegrationQualificationArgs(process.argv.slice(2));
    const report = await qualifyIntegrations();
    if (options.json) console.log(JSON.stringify(report, undefined, 2));
    else {
      for (const result of report.results)
        console.log(
          `[${result.status.toUpperCase()}] ${result.integrationPackage} ${result.capability}`,
        );
      if (report.results.length === 0)
        console.log("[PASS] no agent integration manifests found");
    }
    if (options.strict && !report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
