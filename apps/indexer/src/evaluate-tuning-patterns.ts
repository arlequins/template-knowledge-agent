import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type BehaviorPackManifest,
  compileReviewedBehaviorPrompt,
  evaluateReviewedBehaviorPack,
  exportReviewedTrainingJsonl,
  type PatternBatch,
  parseBehaviorPackManifest,
} from "@arlequins/tuning-kit";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** Exact runtime identity is part of a reproducible promotion record. */
export type ModelRuntimeMetadata = {
  model: string;
  provider: string;
  quantization?: string;
  runtime: string;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function localPath(value: string) {
  const output = resolve(REPOSITORY_ROOT, value);
  const fromLocal = relative(resolve(REPOSITORY_ROOT, ".local"), output);
  if (
    fromLocal === "" ||
    fromLocal === ".." ||
    fromLocal.startsWith(`..${sep}`)
  )
    throw new Error("Daily promotion outputs must stay under .local/");
  return output;
}

function repositoryPath(value: string) {
  const input = resolve(REPOSITORY_ROOT, value);
  const fromRoot = relative(REPOSITORY_ROOT, input);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`))
    throw new Error("Daily promotion inputs must stay inside the repository");
  return input;
}

function sameModel(
  left: BehaviorPackManifest["model"],
  right: BehaviorPackManifest["model"],
) {
  return (
    left?.model === right?.model &&
    left?.provider === right?.provider &&
    left?.quantization === right?.quantization &&
    left?.runtime === right?.runtime
  );
}

async function matchingActiveRelease(options: {
  expected: Omit<BehaviorPackManifest, "generatedAt" | "version">;
  outputPath: string;
  releaseDirectory: string;
}) {
  try {
    const active = parseBehaviorPackManifest(
      JSON.parse(await readFile(options.outputPath, "utf8")),
    );
    if (
      !active ||
      active.behaviorPrompt !== options.expected.behaviorPrompt ||
      active.sourceSha256 !== options.expected.sourceSha256 ||
      active.trainingRows !== options.expected.trainingRows ||
      JSON.stringify(active.metrics) !==
        JSON.stringify(options.expected.metrics) ||
      !sameModel(active.model, options.expected.model)
    )
      return undefined;
    const releasePath = resolve(
      options.releaseDirectory,
      `${active.version}.json`,
    );
    const release = parseBehaviorPackManifest(
      JSON.parse(await readFile(releasePath, "utf8")),
    );
    if (JSON.stringify(release) !== JSON.stringify(active)) return undefined;
    return { releasePath, version: active.version };
  } catch {
    return undefined;
  }
}

export async function evaluateAndPromoteTuningPatterns(options: {
  inputPath: string;
  model?: ModelRuntimeMetadata;
  now?: () => Date;
  outputPath: string;
  releaseDirectory?: string;
}) {
  const raw = await readFile(options.inputPath, "utf8");
  const batch = JSON.parse(raw) as PatternBatch;
  const evaluation = evaluateReviewedBehaviorPack(batch);
  if (!evaluation.passed)
    throw new Error(
      `Behavior pack failed daily promotion gates: ${evaluation.issues[0]?.message}`,
    );
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  const releaseDirectory =
    options.releaseDirectory ??
    resolve(dirname(options.outputPath), "releases");
  const expected = {
    behaviorPrompt: compileReviewedBehaviorPrompt(batch, { maxExamples: 12 }),
    ...(options.model ? { model: options.model } : {}),
    metrics: evaluation.metrics,
    schemaVersion: 1 as const,
    sourceSha256,
    trainingRows: exportReviewedTrainingJsonl(batch).split("\n").length,
  };
  const current = await matchingActiveRelease({
    expected,
    outputPath: options.outputPath,
    releaseDirectory,
  });
  if (current)
    return {
      ...evaluation,
      outputPath: options.outputPath,
      promoted: false,
      releasePath: current.releasePath,
      version: current.version,
    };
  const generatedAt = (options.now?.() ?? new Date()).toISOString();
  const version = `daily-${generatedAt.replace(/[-:.]/gu, "")}-${sourceSha256.slice(0, 8)}`;
  const manifest: BehaviorPackManifest = {
    ...expected,
    generatedAt,
    version,
  };
  if (!parseBehaviorPackManifest(manifest))
    throw new Error("Generated behavior-pack manifest is invalid");
  const serialized = `${JSON.stringify(manifest, undefined, 2)}\n`;
  const releasePath = resolve(releaseDirectory, `${version}.json`);
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(releasePath, serialized, { flag: "wx" });
  await mkdir(dirname(options.outputPath), { recursive: true });
  const temporaryPath = `${options.outputPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, serialized, { flag: "wx" });
    await rename(temporaryPath, options.outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return {
    ...evaluation,
    outputPath: options.outputPath,
    promoted: true,
    releasePath,
    version,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const inputPath = repositoryPath(
    argument("--input") ?? "examples/tuning/reviewed-patterns.json",
  );
  const outputPath = localPath(
    argument("--output") ?? ".local/tuning/active-behavior-pack.json",
  );
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
  console.log(
    JSON.stringify(
      await evaluateAndPromoteTuningPatterns({
        inputPath,
        model: modelMetadata,
        outputPath,
      }),
      undefined,
      2,
    ),
  );
}
