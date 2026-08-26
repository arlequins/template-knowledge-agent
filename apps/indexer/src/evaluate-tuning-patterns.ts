import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileReviewedBehaviorPrompt,
  evaluateReviewedBehaviorPack,
  exportReviewedTrainingJsonl,
  type PatternBatch,
} from "@arlequins/tuning-kit";

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
  if (!output.startsWith(`${resolve(REPOSITORY_ROOT, ".local")}/`))
    throw new Error("Daily promotion outputs must stay under .local/");
  return output;
}

export async function evaluateAndPromoteTuningPatterns(options: {
  inputPath: string;
  outputPath: string;
}) {
  const raw = await readFile(options.inputPath, "utf8");
  const batch = JSON.parse(raw) as PatternBatch;
  const evaluation = evaluateReviewedBehaviorPack(batch);
  if (!evaluation.passed)
    throw new Error(
      `Behavior pack failed daily promotion gates: ${evaluation.issues[0]?.message}`,
    );
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  const generatedAt = new Date().toISOString();
  const manifest = {
    behaviorPrompt: compileReviewedBehaviorPrompt(batch, { maxExamples: 12 }),
    generatedAt,
    metrics: evaluation.metrics,
    schemaVersion: 1 as const,
    sourceSha256,
    trainingRows: exportReviewedTrainingJsonl(batch).split("\n").length,
    version: `daily-${generatedAt.slice(0, 10)}`,
  };
  await mkdir(dirname(options.outputPath), { recursive: true });
  const temporaryPath = `${options.outputPath}.tmp-${process.pid}`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(manifest, undefined, 2)}\n`,
    {
      flag: "wx",
    },
  );
  await rename(temporaryPath, options.outputPath);
  return {
    ...evaluation,
    outputPath: options.outputPath,
    version: manifest.version,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const inputPath = resolve(
    REPOSITORY_ROOT,
    argument("--input") ?? "examples/tuning/reviewed-patterns.json",
  );
  const outputPath = localPath(
    argument("--output") ?? ".local/tuning/active-behavior-pack.json",
  );
  console.log(
    JSON.stringify(
      await evaluateAndPromoteTuningPatterns({ inputPath, outputPath }),
      undefined,
      2,
    ),
  );
}
