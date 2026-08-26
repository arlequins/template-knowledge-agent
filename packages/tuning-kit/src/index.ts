export const DOCUMENT_QA_PATTERN_KINDS = [
  "grounded-answer",
  "insufficient-evidence",
  "conflicting-evidence",
  "citation-required",
  "static-vs-live",
  "code-navigation",
  "clarification",
  "prompt-injection-resistance",
] as const;

export const PATTERN_LANGUAGES = ["en", "ja", "ko"] as const;

export type DocumentQaPatternKind = (typeof DOCUMENT_QA_PATTERN_KINDS)[number];
export type PatternLanguage = (typeof PATTERN_LANGUAGES)[number];
export type PatternSplit = "test" | "train" | "validation";

export type PatternEvidence = {
  id: string;
  label: string;
  locator: string;
  text: string;
};

export type SyntheticPatternSeed = {
  evidence: PatternEvidence[];
  language: PatternLanguage;
  patternKind: DocumentQaPatternKind;
  requestedPatterns: number;
  seedId: string;
};

export type SyntheticPatternCandidate = {
  answer: string;
  evidenceIds: string[];
  forbiddenClaims: string[];
  generatedBy: string;
  groupKey: string;
  id: string;
  language: PatternLanguage;
  patternKind: DocumentQaPatternKind;
  question: string;
  requiredTerms: string[];
  status: "candidate";
};

export type ReviewedPattern = Omit<SyntheticPatternCandidate, "status"> & {
  reviewedAt: string;
  reviewedBy: string;
  split: PatternSplit;
  status: "reviewed";
};

export type PatternBatch = {
  evidence: PatternEvidence[];
  patterns: Array<ReviewedPattern | SyntheticPatternCandidate>;
  schemaVersion: 1;
};

export type PatternQualityIssue = {
  code:
    | "duplicate-answer"
    | "duplicate-question"
    | "forbidden-claim"
    | "invalid-citation"
    | "invalid-field"
    | "missing-citation"
    | "missing-required-term"
    | "possible-sensitive-data"
    | "repeated-sentence"
    | "review-metadata"
    | "split-leakage";
  message: string;
  patternId?: string;
};

export type PatternQualityReport = {
  issues: PatternQualityIssue[];
  passed: boolean;
};

export type BehaviorPackEvaluation = {
  issues: PatternQualityIssue[];
  metrics: {
    groups: number;
    languages: number;
    reviewed: number;
    test: number;
    train: number;
    validation: number;
  };
  passed: boolean;
};

/**
 * Applies the promotion gates used by the daily loop. This is deliberately
 * provider-neutral: it validates the reviewed behavior pack before any local
 * student model or hosted runtime is allowed to consume it.
 */
export function evaluateReviewedBehaviorPack(
  batch: PatternBatch,
  options: { minimumTrainPatterns?: number } = {},
): BehaviorPackEvaluation {
  const quality = validatePatternBatch(batch);
  const reviewed = batch.patterns.filter(
    (pattern): pattern is ReviewedPattern => pattern.status === "reviewed",
  );
  const groups = new Set(reviewed.map(({ groupKey }) => groupKey));
  const languages = new Set(reviewed.map(({ language }) => language));
  const metrics = {
    groups: groups.size,
    languages: languages.size,
    reviewed: reviewed.length,
    test: reviewed.filter(({ split }) => split === "test").length,
    train: reviewed.filter(({ split }) => split === "train").length,
    validation: reviewed.filter(({ split }) => split === "validation").length,
  };
  const issues = [...quality.issues];
  const minimumTrainPatterns = Math.max(
    1,
    Math.floor(options.minimumTrainPatterns ?? 6),
  );
  if (metrics.train < minimumTrainPatterns)
    issues.push({
      code: "invalid-field",
      message: `Behavior pack needs at least ${minimumTrainPatterns} reviewed train patterns`,
    });
  for (const language of PATTERN_LANGUAGES)
    if (!languages.has(language))
      issues.push({
        code: "invalid-field",
        message: `Behavior pack is missing language: ${language}`,
      });
  for (const kind of DOCUMENT_QA_PATTERN_KINDS)
    if (!reviewed.some((pattern) => pattern.patternKind === kind))
      issues.push({
        code: "invalid-field",
        message: `Behavior pack is missing behavior kind: ${kind}`,
      });
  if (metrics.validation === 0 || metrics.test === 0)
    issues.push({
      code: "invalid-field",
      message: "Behavior pack must keep validation and test holdouts",
    });
  return { issues, metrics, passed: issues.length === 0 };
}

export type SyntheticPatternGeneratorPort = {
  generate(seed: SyntheticPatternSeed): Promise<SyntheticPatternCandidate[]>;
};

const MAX_PATTERN_LENGTH = 4_000;
const SENSITIVE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/u,
  /\b\d{3}[- )]\d{3,4}[- ]\d{4}\b/u,
];

function normalized(value: string) {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function hasRepeatedSentence(value: string) {
  const sentences = value
    .split(/(?<=[.!?。！？])\s+/u)
    .map(normalized)
    .filter((sentence) => sentence.length >= 20);
  return new Set(sentences).size !== sentences.length;
}

function validText(value: unknown, max = MAX_PATTERN_LENGTH): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
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

export function validateSyntheticPatternSeed(
  seed: SyntheticPatternSeed,
): PatternQualityReport {
  const issues: PatternQualityIssue[] = [];
  pushFieldIssue(issues, validText(seed.seedId, 160), undefined, "seedId");
  pushFieldIssue(
    issues,
    PATTERN_LANGUAGES.includes(seed.language),
    undefined,
    "language",
  );
  pushFieldIssue(
    issues,
    DOCUMENT_QA_PATTERN_KINDS.includes(seed.patternKind),
    undefined,
    "patternKind",
  );
  pushFieldIssue(
    issues,
    Number.isInteger(seed.requestedPatterns) &&
      seed.requestedPatterns >= 1 &&
      seed.requestedPatterns <= 12,
    undefined,
    "requestedPatterns",
  );
  pushFieldIssue(
    issues,
    Array.isArray(seed.evidence) && seed.evidence.length >= 1,
    undefined,
    "evidence",
  );
  const ids = new Set<string>();
  for (const evidence of seed.evidence ?? []) {
    pushFieldIssue(
      issues,
      validText(evidence.id, 160),
      undefined,
      "evidence.id",
    );
    pushFieldIssue(
      issues,
      validText(evidence.label, 240),
      undefined,
      "evidence.label",
    );
    pushFieldIssue(
      issues,
      validText(evidence.locator, 500),
      undefined,
      "evidence.locator",
    );
    pushFieldIssue(
      issues,
      validText(evidence.text, 12_000),
      undefined,
      "evidence.text",
    );
    if (
      SENSITIVE_PATTERNS.some((expression) =>
        expression.test(
          `${evidence.id}\n${evidence.label}\n${evidence.locator}\n${evidence.text}`,
        ),
      )
    )
      issues.push({
        code: "possible-sensitive-data",
        message: `Evidence may contain sensitive data: ${evidence.id}`,
      });
    if (ids.has(evidence.id))
      issues.push({
        code: "invalid-field",
        message: `Duplicate evidence id: ${evidence.id}`,
      });
    ids.add(evidence.id);
  }
  return { issues, passed: issues.length === 0 };
}

export function validatePatternBatch(
  batch: PatternBatch,
): PatternQualityReport {
  const issues: PatternQualityIssue[] = [];
  if (batch.schemaVersion !== 1)
    issues.push({
      code: "invalid-field",
      message: "Unsupported pattern batch schemaVersion",
    });
  const evidenceIds = new Set(batch.evidence.map(({ id }) => id));
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
      const existingSplit = groupSplits.get(pattern.groupKey);
      if (existingSplit && existingSplit !== pattern.split)
        issues.push({
          code: "split-leakage",
          message: `Semantic group crosses ${existingSplit} and ${pattern.split}`,
          patternId,
        });
      else groupSplits.set(pattern.groupKey, pattern.split);
    }
  }
  return { issues, passed: issues.length === 0 };
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Assigns whole paraphrase groups to one split so near-duplicates cannot leak. */
export function assignDeterministicSplits<T extends { groupKey: string }>(
  patterns: readonly T[],
): Array<T & { split: PatternSplit }> {
  const groups = [...new Set(patterns.map(({ groupKey }) => groupKey))].sort(
    (left, right) =>
      stableHash(left) - stableHash(right) || left.localeCompare(right),
  );
  if (groups.length < 6)
    throw new Error("At least six distinct pattern groups are required");
  const validationCount = Math.max(1, Math.floor(groups.length * 0.15));
  const testCount = Math.max(1, Math.floor(groups.length * 0.15));
  const splitByGroup = new Map<string, PatternSplit>();
  groups.forEach((group, index) => {
    const split: PatternSplit =
      index < validationCount
        ? "validation"
        : index < validationCount + testCount
          ? "test"
          : "train";
    splitByGroup.set(group, split);
  });
  return patterns.map((pattern) => ({
    ...pattern,
    split: splitByGroup.get(pattern.groupKey) ?? "train",
  }));
}

/** Builds a small reviewed few-shot behavior pack. Held-out cases are excluded. */
export function compileReviewedBehaviorPrompt(
  batch: PatternBatch,
  options: { language?: PatternLanguage; maxExamples?: number } = {},
) {
  const report = validatePatternBatch(batch);
  if (!report.passed)
    throw new Error(
      `Pattern batch failed quality gates: ${report.issues[0]?.message}`,
    );
  const maxExamples = Math.max(1, Math.min(options.maxExamples ?? 6, 12));
  const reviewed = batch.patterns
    .filter(
      (pattern): pattern is ReviewedPattern =>
        pattern.status === "reviewed" &&
        pattern.split === "train" &&
        (!options.language || pattern.language === options.language),
    )
    .slice(0, maxExamples);
  if (reviewed.length === 0)
    throw new Error("No reviewed training patterns match this behavior pack");
  return [
    "Follow these reviewed document-QA behavior examples. Do not copy their facts into unrelated answers. Use only evidence retrieved for the current question, keep source labels, and state when evidence is insufficient.",
    ...reviewed.map(
      (pattern, index) =>
        `Example ${index + 1} (${pattern.patternKind})\nUser: ${pattern.question}\nAssistant: ${pattern.answer}`,
    ),
  ].join("\n\n");
}

/** Exports only reviewed training cases for a local student-model pipeline. */
export function exportReviewedTrainingJsonl(batch: PatternBatch) {
  const report = validatePatternBatch(batch);
  if (!report.passed)
    throw new Error(
      `Pattern batch failed quality gates: ${report.issues[0]?.message}`,
    );
  return batch.patterns
    .filter(
      (pattern): pattern is ReviewedPattern =>
        pattern.status === "reviewed" && pattern.split === "train",
    )
    .map((pattern) =>
      JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "Answer from supplied evidence, cite it, and say when it is insufficient.",
          },
          { role: "user", content: pattern.question },
          { role: "assistant", content: pattern.answer },
        ],
        metadata: {
          groupKey: pattern.groupKey,
          language: pattern.language,
          patternId: pattern.id,
          patternKind: pattern.patternKind,
        },
      }),
    )
    .join("\n");
}
