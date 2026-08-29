import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
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

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function repositoryPath(value: string) {
  const candidate = resolve(REPOSITORY_ROOT, value);
  const fromRoot = relative(REPOSITORY_ROOT, candidate);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`))
    throw new Error("Verification inputs must stay inside the repository");
  return candidate;
}

/** Replays source-derived gates and detects a modified or mismatched active pack. */
export async function verifyActiveBehaviorPack(options: {
  manifestPath: string;
  sourcePath: string;
}) {
  const [manifestRaw, sourceRaw] = await Promise.all([
    readFile(options.manifestPath, "utf8"),
    readFile(options.sourcePath, "utf8"),
  ]);
  const manifest = parseBehaviorPackManifest(JSON.parse(manifestRaw));
  if (!manifest) throw new Error("Active behavior-pack manifest is invalid");
  const batch = JSON.parse(sourceRaw) as PatternBatch;
  const evaluation = evaluateReviewedBehaviorPack(batch);
  if (!evaluation.passed)
    throw new Error(
      `Behavior-pack source failed gates: ${evaluation.issues[0]?.message}`,
    );
  const expectedHash = createHash("sha256").update(sourceRaw).digest("hex");
  const expectedPrompt = compileReviewedBehaviorPrompt(batch, {
    maxExamples: 12,
  });
  const expectedRows = exportReviewedTrainingJsonl(batch).split("\n").length;
  if (manifest.sourceSha256 !== expectedHash)
    throw new Error("Active behavior pack does not match the reviewed source");
  if (manifest.behaviorPrompt !== expectedPrompt)
    throw new Error(
      "Active behavior prompt does not match the reviewed source",
    );
  if (manifest.trainingRows !== expectedRows)
    throw new Error("Active behavior-pack training row count is inconsistent");
  if (JSON.stringify(manifest.metrics) !== JSON.stringify(evaluation.metrics))
    throw new Error("Active behavior-pack metrics are inconsistent");
  return {
    model: manifest.model,
    sourceSha256: manifest.sourceSha256,
    trainingRows: manifest.trainingRows,
    version: manifest.version,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  console.log(
    JSON.stringify(
      await verifyActiveBehaviorPack({
        manifestPath: repositoryPath(
          argument("--manifest") ?? ".local/tuning/active-behavior-pack.json",
        ),
        sourcePath: repositoryPath(
          argument("--source") ?? "examples/tuning/reviewed-patterns.json",
        ),
      }),
      undefined,
      2,
    ),
  );
}
