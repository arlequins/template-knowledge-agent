import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { closeDatabasePool } from "@arlequins/db-backbone/client";
import {
  evaluateAndPromoteTuningPatterns,
  type ModelRuntimeMetadata,
} from "./evaluate-tuning-patterns";
import { exportApprovedInvestigations } from "./export-approved-investigations";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function localPath(value: string) {
  const output = resolve(REPOSITORY_ROOT, value);
  const pathFromLocal = relative(resolve(REPOSITORY_ROOT, ".local"), output);
  if (
    pathFromLocal === "" ||
    pathFromLocal === ".." ||
    pathFromLocal.startsWith(`..${sep}`)
  )
    throw new Error("Daily tuning outputs must stay under .local/");
  return output;
}

/** Export approved DB findings, then run the existing promotion gates atomically. */
export async function runDailyTuningLoop(options: {
  basePackPath: string;
  model?: ModelRuntimeMetadata;
  ownerUserId: string;
  outputManifestPath: string;
  reviewedPackPath: string;
  workspaceId: string;
}) {
  const exported = await exportApprovedInvestigations({
    inputPath: options.basePackPath,
    outputPath: options.reviewedPackPath,
    userId: options.ownerUserId,
    workspaceId: options.workspaceId,
  });
  const promoted = await evaluateAndPromoteTuningPatterns({
    inputPath: options.reviewedPackPath,
    model: options.model,
    outputPath: options.outputManifestPath,
  });
  return { exported, promoted };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const workspaceId = process.env.AGENT_WORKSPACE_ID?.trim();
  const ownerUserId = process.env.AGENT_OWNER_USER_ID?.trim();
  if (!workspaceId || !ownerUserId)
    throw new Error("AGENT_WORKSPACE_ID and AGENT_OWNER_USER_ID are required");
  const provider = argument("--provider");
  const model = argument("--model");
  const runtime = argument("--runtime");
  const quantization = argument("--quantization");
  const modelMetadata =
    provider || model || runtime || quantization
      ? provider && model && runtime
        ? {
            model,
            provider,
            ...(quantization ? { quantization } : {}),
            runtime,
          }
        : (() => {
            throw new Error(
              "--provider, --model, and --runtime are required together",
            );
          })()
      : undefined;
  const basePackPath = resolve(
    REPOSITORY_ROOT,
    argument("--input") ?? "examples/tuning/reviewed-patterns.json",
  );
  const reviewedPackPath = localPath(
    argument("--reviewed-output") ??
      ".local/tuning/reviewed-with-feedback.json",
  );
  const outputManifestPath = localPath(
    argument("--output") ?? ".local/tuning/active-behavior-pack.json",
  );
  try {
    console.log(
      JSON.stringify(
        await runDailyTuningLoop({
          basePackPath,
          model: modelMetadata,
          ownerUserId,
          outputManifestPath,
          reviewedPackPath,
          workspaceId,
        }),
        undefined,
        2,
      ),
    );
  } finally {
    await closeDatabasePool();
  }
}
