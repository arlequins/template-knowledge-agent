import type {
  BehaviorPackEvaluation,
  PatternBatch,
  PatternQualityIssue,
  ReviewedPattern,
} from "./index";
import {
  DOCUMENT_QA_PATTERN_KINDS,
  PATTERN_LANGUAGES,
} from "./pattern-constants";
import { validatePatternBatch } from "./pattern-validation";

function issue(
  issues: PatternQualityIssue[],
  message: string,
  patternId?: string,
) {
  issues.push({
    code: "invalid-field",
    message,
    ...(patternId ? { patternId } : {}),
  });
}

/** Internal entry point; quality validation is authoritative in pattern-validation. */
export function validateReviewedPatternBatch(batch: PatternBatch) {
  return validatePatternBatch(batch);
}

export function evaluateReviewedPatternBatch(
  batch: PatternBatch,
  options: { minimumTrainPatterns?: number } = {},
): BehaviorPackEvaluation {
  const quality = validateReviewedPatternBatch(batch);
  const reviewed = batch.patterns.filter(
    (pattern): pattern is ReviewedPattern => pattern.status === "reviewed",
  );
  const groups = new Set(
    reviewed.map(({ groupKey }) => groupKey.normalize("NFC")),
  );
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
    issue(issues, "Behavior pack needs enough reviewed train patterns");
  for (const language of PATTERN_LANGUAGES)
    if (!languages.has(language))
      issue(issues, "Behavior pack is missing a language");
  for (const kind of DOCUMENT_QA_PATTERN_KINDS)
    if (!reviewed.some((pattern) => pattern.patternKind === kind))
      issue(issues, "Behavior pack is missing a behavior kind");
  if (metrics.validation === 0 || metrics.test === 0)
    issue(issues, "Behavior pack must keep validation and test holdouts");
  return { issues, metrics, passed: issues.length === 0 };
}
