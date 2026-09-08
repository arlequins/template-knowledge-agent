import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export type PilotCase = {
  expectedFiles?: string[];
  expectedBehavior?: string;
  forbiddenClaims?: string[];
  id: string;
  kind: "live" | "official" | "refusal" | "retrieval";
  requiredTerms?: string[];
};

export type PilotAnswer = {
  citations?: Array<{ filename: string; content: string }>;
  answer: string;
  caseId: string;
  citationCount?: number;
  latencyMs?: number;
};

export type PilotAnswerEvaluation = {
  cases: number;
  failures: Array<{ caseId: string; reasons: string[] }>;
  passed: boolean;
  passRate: number;
};

function normalized(value: string) {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function repeatedSentence(value: string): boolean {
  const seen = new Set<string>();
  for (const match of value.matchAll(/[^.!?。！？]{20,}[.!?。！？]/gu)) {
    const sentence = normalized(match[0] ?? "");
    if (seen.has(sentence)) return true;
    seen.add(sentence);
  }
  return false;
}

/** Deterministic answer gate for provider/model replay; it never calls a model. */
export function evaluatePilotAnswers(
  cases: readonly PilotCase[],
  answers: readonly PilotAnswer[],
): PilotAnswerEvaluation {
  const failures: Array<{ caseId: string; reasons: string[] }> = [];
  if (cases.length === 0)
    failures.push({ caseId: "$suite", reasons: ["empty evaluation suite"] });
  const caseIds = new Set<string>();
  for (const testCase of cases) {
    if (caseIds.has(testCase.id))
      failures.push({ caseId: testCase.id, reasons: ["duplicate case id"] });
    caseIds.add(testCase.id);
  }
  const byId = new Map<string, PilotAnswer>();
  for (const answer of answers) {
    if (!caseIds.has(answer.caseId))
      failures.push({
        caseId: answer.caseId,
        reasons: ["unknown answer case"],
      });
    if (byId.has(answer.caseId))
      failures.push({
        caseId: answer.caseId,
        reasons: ["duplicate answer case"],
      });
    byId.set(answer.caseId, answer);
  }
  const answerOwners = new Map<string, string>();
  for (const testCase of cases) {
    const answer = byId.get(testCase.id);
    const reasons: string[] = [];
    if (!answer?.answer.trim()) reasons.push("missing answer");
    const text = normalized(answer?.answer ?? "");
    if (answer?.answer && repeatedSentence(answer.answer))
      reasons.push("repeated sentence");
    if (text) {
      const owner = answerOwners.get(text);
      if (owner && owner !== testCase.id)
        reasons.push(`duplicate answer: ${owner}`);
      else answerOwners.set(text, testCase.id);
    }
    for (const term of testCase.requiredTerms ?? [])
      if (!text.includes(normalized(term)))
        reasons.push(`missing term: ${term}`);
    for (const claim of testCase.forbiddenClaims ?? [])
      if (text.includes(normalized(claim)))
        reasons.push(`forbidden claim: ${claim}`);
    if (
      testCase.kind !== "refusal" &&
      (!Number.isSafeInteger(answer?.citationCount) ||
        (answer?.citationCount ?? 0) < 1)
    )
      reasons.push("missing citation");
    if (testCase.expectedFiles?.length) {
      const citations = answer?.citations ?? [];
      if (
        !citations.some(
          (citation) =>
            testCase.expectedFiles?.includes(
              citation.filename.replaceAll("\\", "/"),
            ) && citation.content.trim(),
        )
      )
        reasons.push("missing expected source");
    }
    if (reasons.length) failures.push({ caseId: testCase.id, reasons });
  }
  const failedCaseIds = new Set(failures.map((failure) => failure.caseId));
  const passRate = cases.length
    ? cases.filter((testCase) => !failedCaseIds.has(testCase.id)).length /
      cases.length
    : 0;
  return {
    cases: cases.length,
    failures,
    passed: failures.length === 0,
    passRate,
  };
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const casesPath = resolve(
    REPOSITORY_ROOT,
    argument("--cases") ?? "examples/pilot/questions.json",
  );
  const answersPath = argument("--answers");
  if (!answersPath) throw new Error("--answers is required");
  const casesManifest = JSON.parse(await readFile(casesPath, "utf8")) as {
    cases: PilotCase[];
  };
  const answers = JSON.parse(
    await readFile(resolve(answersPath), "utf8"),
  ) as PilotAnswer[];
  const result = evaluatePilotAnswers(casesManifest.cases, answers);
  console.log(JSON.stringify(result, undefined, 2));
  if (!result.passed) process.exitCode = 1;
}
