import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileReviewedBehaviorPrompt,
  DOCUMENT_QA_PATTERN_KINDS,
  exportReviewedTrainingJsonl,
  PATTERN_LANGUAGES,
  type PatternBatch,
  validatePatternBatch,
} from "@arlequins/tuning-kit";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function assertCase(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function verifyTuningPatterns(root = REPOSITORY_ROOT) {
  const batch = JSON.parse(
    await readFile(
      resolve(root, "examples/tuning/reviewed-patterns.json"),
      "utf8",
    ),
  ) as PatternBatch;
  const report = validatePatternBatch(batch);
  assertCase(
    report.passed,
    report.issues[0]?.message ?? "Pattern quality failed",
  );
  assertCase(
    batch.patterns.length >= 12,
    "Public pack needs at least 12 patterns",
  );
  const reviewed = batch.patterns.filter(({ status }) => status === "reviewed");
  assertCase(
    reviewed.length === batch.patterns.length,
    "Public pack must be reviewed",
  );
  const splitsByGroup = new Map<string, Set<string>>();
  for (const pattern of reviewed) {
    const splits = splitsByGroup.get(pattern.groupKey) ?? new Set<string>();
    if (pattern.status === "reviewed") splits.add(pattern.split);
    splitsByGroup.set(pattern.groupKey, splits);
  }
  assertCase(
    [...splitsByGroup.values()].every((splits) => splits.size === 1),
    "A semantic group leaked across dataset splits",
  );
  const kinds = new Set(reviewed.map(({ patternKind }) => patternKind));
  const languages = new Set(reviewed.map(({ language }) => language));
  assertCase(
    DOCUMENT_QA_PATTERN_KINDS.every((kind) => kinds.has(kind)),
    "Public pack does not cover every behavior kind",
  );
  assertCase(
    PATTERN_LANGUAGES.every((language) => languages.has(language)),
    "Public pack must cover English, Japanese, and Korean",
  );
  const prompt = compileReviewedBehaviorPrompt(batch, { maxExamples: 12 });
  for (const pattern of reviewed)
    if (pattern.status === "reviewed" && pattern.split !== "train")
      assertCase(
        !prompt.includes(pattern.question),
        `Held-out pattern leaked into runtime prompt: ${pattern.id}`,
      );
  const trainingRows = exportReviewedTrainingJsonl(batch).split("\n");
  assertCase(
    trainingRows.length >= 6,
    "Training export needs at least six rows",
  );
  return {
    evidence: batch.evidence.length,
    groups: splitsByGroup.size,
    languages: languages.size,
    patterns: reviewed.length,
    status: "pass" as const,
    trainingRows: trainingRows.length,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  console.log(JSON.stringify(await verifyTuningPatterns(), undefined, 2));
