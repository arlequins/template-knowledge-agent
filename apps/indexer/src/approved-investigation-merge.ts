import {
  DOCUMENT_QA_PATTERN_KINDS,
  type DocumentQaPatternKind,
  type PatternBatch,
  type PatternEvidence,
  type PatternLanguage,
  type ReviewedPattern,
} from "@arlequins/tuning-kit";

export type InvestigationRecord = {
  completedAt: Date | null;
  findings: unknown;
  id: string;
  question: string;
};

export type KnowledgeChunkRecord = {
  content: string;
  id: string;
  label: string;
  locator: string | null;
};

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function language(value: unknown): PatternLanguage {
  return value === "en" || value === "ja" || value === "ko" ? value : "ko";
}

function patternKind(value: unknown): DocumentQaPatternKind {
  return typeof value === "string" &&
    DOCUMENT_QA_PATTERN_KINDS.includes(value as DocumentQaPatternKind)
    ? (value as DocumentQaPatternKind)
    : "grounded-answer";
}

/** Merge owner-approved findings into a reviewed behavior pack. */
export function mergeApprovedInvestigations(
  batch: PatternBatch,
  investigations: InvestigationRecord[],
  chunks: KnowledgeChunkRecord[],
  reviewedBy: string,
) {
  const evidence = new Map<string, PatternEvidence>(
    batch.evidence.map((item) => [item.id, item]),
  );
  for (const chunk of chunks)
    evidence.set(chunk.id, {
      id: chunk.id,
      label: chunk.label,
      locator: chunk.locator ?? "database",
      text: chunk.content,
    });

  const existingQuestions = new Set(
    batch.patterns.map((pattern) =>
      pattern.question.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US"),
    ),
  );
  const existingAnswers = new Set(
    batch.patterns.map((pattern) =>
      pattern.answer.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US"),
    ),
  );
  const skipped: Array<{ id: string; reason: string }> = [];
  const additions: ReviewedPattern[] = [];
  for (const item of investigations) {
    const findings = object(item.findings);
    const question = item.question.trim();
    const answer =
      typeof findings.correctedAnswer === "string"
        ? findings.correctedAnswer.trim()
        : "";
    const evidenceIds = strings(findings.evidenceIds);
    if (!question || !answer || evidenceIds.length === 0) {
      skipped.push({
        id: item.id,
        reason: "question, correctedAnswer, and evidenceIds are required",
      });
      continue;
    }
    if (evidenceIds.some((id) => !evidence.has(id))) {
      skipped.push({
        id: item.id,
        reason: "one or more evidenceIds are outside this workspace",
      });
      continue;
    }
    const questionKey = question
      .replace(/\s+/gu, " ")
      .toLocaleLowerCase("en-US");
    const answerKey = answer.replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
    if (existingQuestions.has(questionKey) || existingAnswers.has(answerKey)) {
      skipped.push({ id: item.id, reason: "duplicate question or answer" });
      continue;
    }
    additions.push({
      answer,
      evidenceIds,
      forbiddenClaims: strings(findings.forbiddenClaims),
      generatedBy: "owner-review",
      groupKey: `investigation-${item.id}`,
      id: `investigation-${item.id}`,
      language: language(findings.language),
      patternKind: patternKind(findings.patternKind),
      question,
      requiredTerms: strings(findings.requiredTerms),
      reviewedAt:
        typeof findings.reviewedAt === "string"
          ? findings.reviewedAt
          : (item.completedAt?.toISOString() ?? new Date().toISOString()),
      reviewedBy:
        typeof findings.reviewedBy === "string"
          ? findings.reviewedBy
          : reviewedBy,
      split: "train",
      status: "reviewed",
    });
    existingQuestions.add(questionKey);
    existingAnswers.add(answerKey);
  }

  return {
    additions,
    batch: {
      evidence: [...evidence.values()],
      patterns: [...batch.patterns, ...additions],
      schemaVersion: 1 as const,
    },
    skipped,
  };
}
