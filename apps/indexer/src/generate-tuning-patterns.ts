import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createOpenAISyntheticPatternGenerator } from "@arlequins/agent-openai";
import {
  type PatternBatch,
  type PatternEvidence,
  type SyntheticPatternSeed,
  validatePatternBatch,
} from "@arlequins/tuning-kit";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

type SeedManifest = {
  schemaVersion: 1;
  seeds: SyntheticPatternSeed[];
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function localOutputPath(value: string) {
  const absolute = resolve(REPOSITORY_ROOT, value);
  const localRoot = resolve(REPOSITORY_ROOT, ".local");
  const pathFromLocal = relative(localRoot, absolute);
  if (
    pathFromLocal === "" ||
    pathFromLocal === ".." ||
    pathFromLocal.startsWith(`..${sep}`)
  )
    throw new Error("Generated candidates must stay under .local/");
  return absolute;
}

function uniqueEvidence(seeds: SyntheticPatternSeed[]): PatternEvidence[] {
  const evidence = new Map<string, PatternEvidence>();
  for (const seed of seeds)
    for (const item of seed.evidence) {
      const existing = evidence.get(item.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(item))
        throw new Error(`Evidence id has conflicting values: ${item.id}`);
      evidence.set(item.id, item);
    }
  return [...evidence.values()];
}

export async function generateTuningPatterns(options: {
  apiKey: string;
  model?: string;
  outputPath: string;
  seedPath: string;
}) {
  const manifest = JSON.parse(
    await readFile(options.seedPath, "utf8"),
  ) as SeedManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.seeds))
    throw new Error("Unsupported tuning seed manifest");
  const generator = createOpenAISyntheticPatternGenerator({
    apiKey: options.apiKey,
    model: options.model,
  });
  const patterns = [];
  for (const seed of manifest.seeds)
    patterns.push(...(await generator.generate(seed)));
  const batch: PatternBatch = {
    evidence: uniqueEvidence(manifest.seeds),
    patterns,
    schemaVersion: 1,
  };
  const report = validatePatternBatch(batch);
  if (!report.passed)
    throw new Error(
      `Generated batch failed quality gates: ${report.issues[0]?.message}`,
    );
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(
    options.outputPath,
    `${JSON.stringify(batch, undefined, 2)}\n`,
    {
      flag: process.argv.includes("--force") ? "w" : "wx",
    },
  );
  return { outputPath: options.outputPath, patterns: patterns.length };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const seedPath = resolve(
    REPOSITORY_ROOT,
    argument("--seed") ?? "examples/tuning/seeds.json",
  );
  const outputPath = localOutputPath(
    argument("--output") ?? ".local/tuning/luna-candidates.json",
  );
  console.log(
    JSON.stringify(
      await generateTuningPatterns({
        apiKey,
        model: argument("--model"),
        outputPath,
        seedPath,
      }),
      undefined,
      2,
    ),
  );
}
