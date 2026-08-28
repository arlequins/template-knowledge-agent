#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const sstPackages = [
  "@arlequins/web",
  "@arlequins/api",
  "@arlequins/batch",
  "@arlequins/sst-bootstrap",
];

const authFreeEnv = { ...process.env };
for (const key of [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_ROLE_ARN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
]) {
  delete authFreeEnv[key];
}
const unavailableCredentialsPath = resolve(".sst", `auth-free-${process.pid}`);
Object.assign(authFreeEnv, {
  AWS_CONFIG_FILE: unavailableCredentialsPath,
  AWS_EC2_METADATA_DISABLED: "true",
  AWS_SHARED_CREDENTIALS_FILE: unavailableCredentialsPath,
  SST_AWS_PROFILE: "",
  SST_TELEMETRY_DISABLED: "1",
  // SST evaluates the web authentication contract while loading the stack.
  // These are deliberately local, non-secret defaults so a fresh checkout can
  // validate the configuration without requiring a developer's .env file.
  NEXT_PUBLIC_OIDC_AUTHORITY:
    process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? "http://localhost:5556",
  NEXT_PUBLIC_OIDC_CLIENT_ID:
    process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "local-web",
  NEXT_PUBLIC_OIDC_SCOPE:
    process.env.NEXT_PUBLIC_OIDC_SCOPE ?? "openid profile email",
});

function run(args, env = process.env) {
  const result = spawnSync(pnpm, args, {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Building SST configuration dependencies");
run(["--filter", "@arlequins/env", "run", "build"], authFreeEnv);

for (const packageName of sstPackages) {
  console.log(`\nSST provider check: ${packageName}`);
  run(["--filter", packageName, "run", "sst:install"], authFreeEnv);
}

console.log("\nSST deployment preset tests");
run(
  [
    "--filter",
    "@arlequins/api",
    "with-env",
    "vitest",
    "run",
    "src/deployment-preset.test.ts",
  ],
  authFreeEnv,
);

console.log("\nSST configuration typecheck");
run(["typecheck"], authFreeEnv);

console.log("\nSST local validation passed without AWS credentials.");
