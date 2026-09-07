import type {
  PatternBatch,
  PatternQualityIssue,
  PatternQualityReport,
  PatternSplit,
} from "./index";
import {
  DOCUMENT_QA_PATTERN_KINDS,
  PATTERN_LANGUAGES,
} from "./pattern-constants";

const MAX_PATTERN_LENGTH = 4_000;
export const SENSITIVE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/u,
  /\b\d{3}[- )]\d{3,4}[- ]\d{4}\b/u,
];

function normalized(value: string) {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function characterTrigrams(value: string) {
  const compact = normalized(value).replace(/[^\p{L}\p{N}]+/gu, "");
  const grams = new Set<string>();
  if (compact.length < 16) return grams;
  for (let index = 0; index <= compact.length - 3; index += 1)
    grams.add(compact.slice(index, index + 3));
  return grams;
}

function trigramSimilarity(left: string, right: string) {
  const leftGrams = characterTrigrams(left);
  const rightGrams = characterTrigrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0;
  let intersection = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) intersection += 1;
  return intersection / (leftGrams.size + rightGrams.size - intersection);
}

function validText(value: unknown, max = MAX_PATTERN_LENGTH): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function hasRepeatedSentence(value: string) {
  const sentences = value
    .split(/(?<=[.!?。！？])\s+/u)
    .map(normalized)
    .filter((sentence) => sentence.length >= 20);
  return new Set(sentences).size !== sentences.length;
}

function pushFieldIssue(
  issues: PatternQualityIssue[],
  condition: unknown,
  patternId: string | undefined,
  field: string,
) {
  if (!condition)
    issues.push({
      code: "invalid-field",
      message: `Invalid ${field}`,
      patternId,
    });
}

/** Single authoritative batch validator shared by public and training paths. */
export function validatePatternBatch(
  batch: PatternBatch,
): PatternQualityReport {
  const issues: PatternQualityIssue[] = [];
  if (batch.schemaVersion !== 1)
    issues.push({
      code: "invalid-field",
      message: "Unsupported pattern batch schemaVersion",
    });
  const evidenceIds = new Set<string>();
  for (const evidence of batch.evidence) {
    if (!validText(evidence.id, 160))
      issues.push({
        code: "invalid-field",
        evidenceId: evidence.id,
        message: "Evidence id is invalid",
      });
    if (!validText(evidence.label, 240))
      issues.push({
        code: "invalid-field",
        evidenceId: evidence.id,
        message: "Evidence label is invalid",
      });
    if (!validText(evidence.locator, 500))
      issues.push({
        code: "invalid-field",
        evidenceId: evidence.id,
        message: "Evidence locator is invalid",
      });
    if (!validText(evidence.text, 12_000))
      issues.push({
        code: "invalid-field",
        evidenceId: evidence.id,
        message: "Evidence text is invalid",
      });
    if (evidenceIds.has(evidence.id))
      issues.push({
        code: "invalid-field",
        evidenceId: evidence.id,
        message: `Duplicate evidence id: ${evidence.id}`,
      });
    evidenceIds.add(evidence.id);
    if (
      SENSITIVE_PATTERNS.some((expression) =>
        expression.test(
          `${evidence.id}\n${evidence.label}\n${evidence.locator}\n${evidence.text}`,
        ),
      )
    )
      issues.push({
        code: "possible-sensitive-data",
        evidenceId: evidence.id,
        message: `Evidence may contain sensitive data: ${evidence.id}`,
      });
  }
  const questionOwners = new Map<string, string>();
  const answerOwners = new Map<string, string>();
  const patternIds = new Set<string>();
  const groupSplits = new Map<string, PatternSplit>();

  for (const pattern of batch.patterns) {
    const patternId = validText(pattern.id, 160) ? pattern.id : undefined;
    pushFieldIssue(issues, patternId, patternId, "id");
    pushFieldIssue(
      issues,
      validText(pattern.groupKey, 160),
      patternId,
      "groupKey",
    );
    pushFieldIssue(
      issues,
      PATTERN_LANGUAGES.includes(pattern.language),
      patternId,
      "language",
    );
    pushFieldIssue(
      issues,
      DOCUMENT_QA_PATTERN_KINDS.includes(pattern.patternKind),
      patternId,
      "patternKind",
    );
    pushFieldIssue(issues, validText(pattern.question), patternId, "question");
    pushFieldIssue(issues, validText(pattern.answer), patternId, "answer");
    pushFieldIssue(
      issues,
      Array.isArray(pattern.evidenceIds) && pattern.evidenceIds.length > 0,
      patternId,
      "evidenceIds",
    );
    pushFieldIssue(
      issues,
      Array.isArray(pattern.requiredTerms),
      patternId,
      "requiredTerms",
    );
    pushFieldIssue(
      issues,
      Array.isArray(pattern.forbiddenClaims),
      patternId,
      "forbiddenClaims",
    );

    if (patternId) {
      if (patternIds.has(patternId))
        issues.push({
          code: "invalid-field",
          message: "Pattern ids must be unique",
          patternId,
        });
      patternIds.add(patternId);
    }
    const answer = typeof pattern.answer === "string" ? pattern.answer : "";
    const question =
      typeof pattern.question === "string" ? pattern.question : "";
    const usedEvidenceIds = Array.isArray(pattern.evidenceIds)
      ? pattern.evidenceIds.filter(
          (evidenceId): evidenceId is string => typeof evidenceId === "string",
        )
      : [];
    const requiredTerms = Array.isArray(pattern.requiredTerms)
      ? pattern.requiredTerms.filter(
          (term): term is string => typeof term === "string",
        )
      : [];
    const forbiddenClaims = Array.isArray(pattern.forbiddenClaims)
      ? pattern.forbiddenClaims.filter(
          (claim): claim is string => typeof claim === "string",
        )
      : [];
    for (const evidenceId of usedEvidenceIds) {
      if (!evidenceIds.has(evidenceId))
        issues.push({
          code: "invalid-citation",
          message: `Unknown evidence id: ${evidenceId}`,
          patternId,
        });
      if (!answer.includes(`[evidence:${evidenceId}]`))
        issues.push({
          code: "missing-citation",
          message: `Answer must cite [evidence:${evidenceId}]`,
          patternId,
        });
    }
    for (const term of requiredTerms)
      if (!normalized(answer).includes(normalized(term)))
        issues.push({
          code: "missing-required-term",
          message: `Answer is missing required term: ${term}`,
          patternId,
        });
    for (const claim of forbiddenClaims)
      if (normalized(answer).includes(normalized(claim)))
        issues.push({
          code: "forbidden-claim",
          message: `Answer contains forbidden claim: ${claim}`,
          patternId,
        });
    if (hasRepeatedSentence(answer))
      issues.push({
        code: "repeated-sentence",
        message: "Answer repeats a sentence",
        patternId,
      });
    if (
      SENSITIVE_PATTERNS.some(
        (expression) => expression.test(question) || expression.test(answer),
      )
    )
      issues.push({
        code: "possible-sensitive-data",
        message: "Question or answer may contain sensitive data",
        patternId,
      });

    const questionKey = normalized(question);
    const answerKey = normalized(answer);
    const questionOwner = questionOwners.get(questionKey);
    if (questionOwner)
      issues.push({
        code: "duplicate-question",
        message: `Question duplicates ${questionOwner}`,
        patternId,
      });
    else questionOwners.set(questionKey, pattern.id);
    const answerOwner = answerOwners.get(answerKey);
    if (answerOwner)
      issues.push({
        code: "duplicate-answer",
        message: `Answer duplicates ${answerOwner}`,
        patternId,
      });
    else answerOwners.set(answerKey, pattern.id);

    if (
      pattern.status === "reviewed" &&
      (!validText(pattern.reviewedBy, 240) ||
        Number.isNaN(Date.parse(pattern.reviewedAt)) ||
        !["train", "validation", "test"].includes(pattern.split))
    )
      issues.push({
        code: "review-metadata",
        message: "Reviewed patterns need reviewer, timestamp, and split",
        patternId,
      });
    if (pattern.status === "reviewed") {
      const normalizedGroupKey = pattern.groupKey.normalize("NFC");
      const existingSplit = groupSplits.get(normalizedGroupKey);
      if (existingSplit && existingSplit !== pattern.split)
        issues.push({
          code: "split-leakage",
          message: `Semantic group crosses ${existingSplit} and ${pattern.split}`,
          patternId,
        });
      else groupSplits.set(normalizedGroupKey, pattern.split);
    }
  }
  const reviewed = batch.patterns.filter(
    (pattern) => pattern.status === "reviewed",
  );
  for (let leftIndex = 0; leftIndex < reviewed.length; leftIndex += 1) {
    const left = reviewed[leftIndex];
    if (left?.status !== "reviewed") continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < reviewed.length;
      rightIndex += 1
    ) {
      const right = reviewed[rightIndex];
      if (
        right?.status !== "reviewed" ||
        left.split === right.split ||
        left.groupKey.normalize("NFC") === right.groupKey.normalize("NFC") ||
        left.language !== right.language
      )
        continue;
      const questionSimilarity = trigramSimilarity(
        left.question,
        right.question,
      );
      const answerSimilarity = trigramSimilarity(left.answer, right.answer);
      if (questionSimilarity >= 0.72 || answerSimilarity >= 0.86)
        issues.push({
          code: "near-duplicate-leakage",
          message: `Pattern is lexically near ${left.id} across ${left.split} and ${right.split}`,
          patternId: right.id,
        });
    }
  }
  return { issues, passed: issues.length === 0 };
}
