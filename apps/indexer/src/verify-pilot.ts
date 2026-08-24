import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chunkMarkdown, chunkSource } from "./chunk";

type PilotCase = {
  capability?: string;
  expectedBehavior?: string;
  expectedFiles?: string[];
  forbiddenClaims?: string[];
  id: string;
  kind: "live" | "official" | "refusal" | "retrieval";
  question: string;
  requiredTerms?: string[];
  retrievalTerms?: string[];
  sourceId?: string;
};

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const LIVE_CAPABILITY_SOURCE =
  "packages/trpc/src/adaptors/example-live-capabilities.ts";

async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile())
        files.push(relative(root, absolute).split(sep).join("/"));
    }
  }
  await visit(root);
  return files.sort();
}

function score(content: string, terms: readonly string[]) {
  const normalized = normalize(content);
  return terms.reduce(
    (total, term) => total + (normalized.includes(normalize(term)) ? 1 : 0),
    0,
  );
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function assertCase(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function verifyPilot(root = REPOSITORY_ROOT) {
  const pilotRoot = resolve(root, "examples/pilot");
  const sourceRoot = resolve(pilotRoot, "repository");
  const manifest = JSON.parse(
    await readFile(resolve(pilotRoot, "questions.json"), "utf8"),
  ) as { cases: PilotCase[]; version: number };
  assertCase(manifest.version === 1, "Unsupported pilot manifest version");
  assertCase(manifest.cases.length >= 12, "Pilot needs at least 12 cases");
  assertCase(
    new Set(manifest.cases.map(({ id }) => id)).size === manifest.cases.length,
    "Pilot case ids must be unique",
  );

  const sourceFiles = await filesUnder(sourceRoot);
  const chunks = (
    await Promise.all(
      sourceFiles.map(async (path) => {
        const content = await readFile(resolve(sourceRoot, path), "utf8");
        const values = [".md", ".mdx"].includes(extname(path))
          ? chunkMarkdown(content, path)
          : chunkSource(content, path);
        return values.map((chunk) => ({ ...chunk, path }));
      }),
    )
  ).flat();
  const official = JSON.parse(
    await readFile(
      resolve(root, "config/official-knowledge-sources.json"),
      "utf8",
    ),
  ) as { sources: Array<{ id: string }> };
  const liveSource = await readFile(
    resolve(root, LIVE_CAPABILITY_SOURCE),
    "utf8",
  );

  const results: Array<{
    id: string;
    kind: PilotCase["kind"];
    status: "pass";
  }> = [];
  for (const testCase of manifest.cases) {
    assertCase(testCase.question.trim(), `Question is empty: ${testCase.id}`);
    if (testCase.kind === "retrieval") {
      assertCase(
        testCase.expectedFiles?.length,
        `Missing expectedFiles: ${testCase.id}`,
      );
      assertCase(
        testCase.requiredTerms?.length,
        `Missing requiredTerms: ${testCase.id}`,
      );
      const expectedContent = (
        await Promise.all(
          testCase.expectedFiles.map((path) =>
            readFile(resolve(sourceRoot, path), "utf8"),
          ),
        )
      ).join("\n");
      for (const term of testCase.requiredTerms)
        assertCase(
          normalize(expectedContent).includes(normalize(term)),
          `Expected evidence is missing ${JSON.stringify(term)}: ${testCase.id}`,
        );
      const ranked = chunks
        .map((chunk) => ({
          path: chunk.path,
          score: score(chunk.content, testCase.retrievalTerms ?? []),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);
      assertCase(
        ranked.some(
          ({ path, score: rankScore }) =>
            rankScore > 0 && testCase.expectedFiles?.includes(path),
        ),
        `Expected evidence did not rank in the top three: ${testCase.id}`,
      );
    } else if (testCase.kind === "official") {
      assertCase(
        official.sources.some(({ id }) => id === testCase.sourceId),
        `Official source is not allowlisted: ${testCase.sourceId}`,
      );
    } else if (testCase.kind === "live") {
      assertCase(
        testCase.capability &&
          liveSource.includes(`name: "${testCase.capability}"`),
        `Live capability example is missing: ${testCase.capability}`,
      );
    } else {
      assertCase(
        testCase.expectedBehavior?.trim(),
        `Refusal behavior is missing: ${testCase.id}`,
      );
      assertCase(
        testCase.forbiddenClaims?.length,
        `Refusal forbidden claims are missing: ${testCase.id}`,
      );
    }
    results.push({ id: testCase.id, kind: testCase.kind, status: "pass" });
  }

  return {
    cases: results.length,
    chunks: chunks.length,
    files: sourceFiles.length,
    results,
    status: "pass" as const,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  console.log(JSON.stringify(await verifyPilot(), undefined, 2));
