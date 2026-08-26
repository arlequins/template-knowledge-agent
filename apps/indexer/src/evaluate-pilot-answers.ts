import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export type PilotCase = {
  expectedBehavior?: string;
  forbiddenClaims?: string[];
  id: string;
  kind: "live" | "official" | "refusal" | "retrieval";
  requiredTerms?: string[];
};

export type PilotAnswer = {
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
  return value.toLocaleLowerCase("en-US");
}

/** Deterministic answer gate for provider/model replay; it never calls a model. */
export function evaluatePilotAnswers(
  cases: readonly PilotCase[],
  answers: readonly PilotAnswer[],
): PilotAnswerEvaluation {
  const byId = new Map(answers.map((answer) => [answer.caseId, answer]));
  const failures: Array<{ caseId: string; reasons: string[] }> = [];
  for (const testCase of cases) {
    const answer = byId.get(testCase.id);
    const reasons: string[] = [];
    if (!answer?.answer.trim()) reasons.push("missing answer");
    const text = normalized(answer?.answer ?? "");
    for (const term of testCase.requiredTerms ?? [])
      if (!text.includes(normalized(term)))
        reasons.push(`missing term: ${term}`);
    for (const claim of testCase.forbiddenClaims ?? [])
      if (text.includes(normalized(claim)))
        reasons.push(`forbidden claim: ${claim}`);
    if (testCase.kind !== "refusal" && answer?.citationCount === 0)
      reasons.push("missing citation");
    if (reasons.length) failures.push({ caseId: testCase.id, reasons });
  }
  const passRate = cases.length
    ? (cases.length - failures.length) / cases.length
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
