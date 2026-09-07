#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(join(tmpdir(), "template-generators-"));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: target,
    env: { ...process.env, CI: "true", HUSKY: "0" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with ${result.status}`);
}

function runExpectFailure(command, args) {
  const result = spawnSync(command, args, {
    cwd: target,
    env: { ...process.env, CI: "true", HUSKY: "0" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status === 0)
    throw new Error(
      `${command} unexpectedly passed for an incomplete integration`,
    );
}

function runGeneratorGuard(command, args) {
  const result = spawnSync(command, args, {
    cwd: target,
    env: { ...process.env, CI: "true", HUSKY: "0" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status;
}

async function copyRepository() {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);

  for (const path of paths) {
    const source = resolve(root, path);
    const sourceStat = await stat(source).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!sourceStat || sourceStat.isDirectory()) continue;
    const destination = resolve(target, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

try {
  await copyRepository();
  const obsoleteDomainTemplate = resolve(
    target,
    "turbo/generators/templates/domain",
  );
  if (await stat(obsoleteDomainTemplate).catch(() => undefined)) {
    throw new Error(
      "Obsolete domain templates must not be copied into a generated repository",
    );
  }
  await copyFile(resolve(target, ".env.example"), resolve(target, ".env"));
  run(pnpm, ["install", "--frozen-lockfile"]);
  for (const [generator, ...args] of [
    ["app", "generated-app"],
    ["package", "generated-package"],
    ["domain", "order-history"],
    ["feature", "inventory-query", "query"],
    ["agent-integration", "synthetic"],
  ]) {
    run(pnpm, ["turbo", "gen", generator, "--args", ...args]);
  }
  run(pnpm, ["check"]);
  run(pnpm, ["typecheck"]);

  const danglingTarget = await mkdtemp(
    join(tmpdir(), "template-generator-symlink-target-"),
  );
  await rm(danglingTarget, { recursive: true, force: true });
  const danglingPath = resolve(target, "packages/dangling-integration");
  try {
    await symlink(danglingTarget, danglingPath, "dir");
    const generatorStatus = runGeneratorGuard(pnpm, [
      "turbo",
      "gen",
      "agent-integration",
      "--args",
      "dangling",
    ]);
    if (generatorStatus === 0)
      console.warn(
        "Turbo returned exit 0 for a rejected generator action; verifying the filesystem guard directly",
      );
    else if (generatorStatus === null)
      throw new Error("Generator guard was terminated unexpectedly");
    const symlinkMetadata = await lstat(danglingPath).catch(() => undefined);
    if (!symlinkMetadata?.isSymbolicLink())
      throw new Error("Generator removed or replaced the guarded symlink");
    if (
      await stat(resolve(danglingTarget, "package.json")).catch(() => undefined)
    )
      throw new Error("Generator wrote through a dangling integration symlink");
  } finally {
    await rm(danglingPath, { force: true });
    await rm(danglingTarget, { recursive: true, force: true });
  }

  const integrationRoot = resolve(target, "packages/synthetic-integration");
  const integrationManifest = JSON.parse(
    await readFile(
      resolve(integrationRoot, "integration.manifest.json"),
      "utf8",
    ),
  );
  const integrationPackage = JSON.parse(
    await readFile(resolve(integrationRoot, "package.json"), "utf8"),
  ).name;
  if (
    integrationManifest.privacy?.enabled !== false ||
    integrationManifest.weightTraining?.enabled !== false
  )
    throw new Error("Generated agent integration must be disabled by default");
  const integrationSource = (
    await Promise.all(
      [
        "src/index.ts",
        "src/privacy-adapter.ts",
        "src/weight-training-adapter.ts",
        "src/conformance/privacy.test.ts",
        "src/conformance/privacy-runner.ts",
        "src/conformance/weight-training.test.ts",
        "src/conformance/weight-training-runner.ts",
      ].map((path) => readFile(resolve(integrationRoot, path), "utf8")),
    )
  ).join("\n");
  if (
    integrationSource.includes("OPENAI_API_KEY") ||
    integrationSource.includes("AWS_SECRET")
  )
    throw new Error(
      "Generated agent integration leaked secrets or template scope",
    );
  run(pnpm, ["--filter", integrationPackage, "typecheck"]);
  run(pnpm, ["--filter", integrationPackage, "test"]);
  run(pnpm, ["--filter", integrationPackage, "conformance"]);
  await writeFile(
    resolve(integrationRoot, "integration.manifest.json"),
    JSON.stringify({
      ...integrationManifest,
      privacy: { enabled: true },
      weightTraining: { enabled: false },
    }),
  );
  runExpectFailure(pnpm, [
    "--filter",
    integrationPackage,
    "conformance:privacy",
  ]);
  await writeFile(
    resolve(integrationRoot, "integration.manifest.json"),
    JSON.stringify({
      ...integrationManifest,
      privacy: { enabled: false },
      weightTraining: { enabled: true },
    }),
  );
  runExpectFailure(pnpm, [
    "--filter",
    integrationPackage,
    "conformance:weight-training",
  ]);

  const rootRouter = await readFile(
    resolve(target, "packages/trpc/src/root.ts"),
    "utf8",
  );
  if (!rootRouter.includes("orderHistory: orderHistoryRouter")) {
    throw new Error("Generated domain was not registered in the tRPC root");
  }
  if (!rootRouter.includes("inventoryQuery: inventoryQueryRouter")) {
    throw new Error("Generated feature was not registered in the tRPC root");
  }
  const featureRouter = await readFile(
    resolve(target, "packages/trpc/src/features/inventory-query/router.ts"),
    "utf8",
  );
  if (!featureRouter.includes(".query(")) {
    throw new Error("Generated query feature used the wrong procedure kind");
  }
  const featureDomain = await readFile(
    resolve(target, "packages/service/src/features/inventory-query/domain.ts"),
    "utf8",
  );
  if (featureDomain.includes("@trpc/") || featureDomain.includes("@aws-sdk/")) {
    throw new Error(
      "Generated feature domain crossed an infrastructure boundary",
    );
  }
  console.log(
    "Application, package, domain, and feature generators passed qualification.",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
