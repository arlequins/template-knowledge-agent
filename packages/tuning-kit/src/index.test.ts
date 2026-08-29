import { describe, expect, it } from "vitest";

import {
  assignDeterministicSplits,
  compileReviewedBehaviorPrompt,
  evaluateReviewedBehaviorPack,
  exportReviewedTrainingJsonl,
  type PatternBatch,
  parseBehaviorPackManifest,
  validatePatternBatch,
  validateSyntheticPatternSeed,
} from "./index";

function batch(): PatternBatch {
  const evidence = [
    {
      id: "purpose",
      label: "Repository purpose",
      locator: "docs/purpose.md",
      text: "The repository is a reusable document and code knowledge agent.",
    },
  ];
  return {
    evidence,
    patterns: [
      {
        answer:
          "It is a reusable document and code knowledge agent. [evidence:purpose]",
        evidenceIds: ["purpose"],
        forbiddenClaims: ["daily fine-tuning"],
        generatedBy: "template-curator",
        groupKey: "purpose-grounded",
        id: "purpose-grounded-en",
        language: "en",
        patternKind: "grounded-answer",
        question: "What is this repository for?",
        requiredTerms: ["document", "code"],
        reviewedAt: "2026-08-26T00:00:00.000Z",
        reviewedBy: "template-public-review",
        split: "train",
        status: "reviewed",
      },
    ],
    schemaVersion: 1,
  };
}

describe("tuning kit", () => {
  it("accepts a grounded reviewed batch and compiles a runtime prompt", () => {
    const fixture = batch();
    expect(validatePatternBatch(fixture)).toEqual({ issues: [], passed: true });
    expect(compileReviewedBehaviorPrompt(fixture)).toContain(
      "What is this repository for?",
    );
    expect(exportReviewedTrainingJsonl(fixture)).toContain(
      '"patternId":"purpose-grounded-en"',
    );
  });

  it("rejects missing citations, forbidden claims, and repeated answers", () => {
    const fixture = batch();
    const first = fixture.patterns[0];
    if (!first) throw new Error("Fixture is missing its first pattern");
    fixture.patterns.push({
      ...first,
      answer: "daily fine-tuning is enabled.",
      id: "bad",
      question: "Is daily fine-tuning enabled?",
    });
    const report = validatePatternBatch(fixture);
    expect(report.passed).toBe(false);
    expect(report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["forbidden-claim", "missing-citation"]),
    );
  });

  it("keeps paraphrase groups together across deterministic splits", () => {
    const patterns = ["a", "b", "c", "d", "e", "f", "a"].map(
      (groupKey, index) => ({ groupKey, id: String(index) }),
    );
    const first = assignDeterministicSplits(patterns);
    const second = assignDeterministicSplits([...patterns].reverse());
    expect(
      new Set(
        first
          .filter(({ groupKey }) => groupKey === "a")
          .map(({ split }) => split),
      ).size,
    ).toBe(1);
    expect(
      Object.fromEntries(first.map(({ groupKey, split }) => [groupKey, split])),
    ).toEqual(
      Object.fromEntries(
        second.map(({ groupKey, split }) => [groupKey, split]),
      ),
    );
    expect(new Set(first.map(({ split }) => split)).size).toBe(3);
  });

  it("rejects reviewed semantic groups that leak across splits", () => {
    const fixture = batch();
    const first = fixture.patterns[0];
    if (first?.status !== "reviewed")
      throw new Error("Fixture is missing a reviewed pattern");
    fixture.patterns.push({
      ...first,
      answer:
        "This reusable agent answers from documents and code. [evidence:purpose]",
      id: "purpose-paraphrase",
      question: "Explain the agent template's purpose.",
      split: "test",
    });
    expect(
      validatePatternBatch(fixture).issues.map(({ code }) => code),
    ).toContain("split-leakage");
  });

  it("rejects lexical near-duplicates that use different groups across splits", () => {
    const fixture = batch();
    const first = fixture.patterns[0];
    if (first?.status !== "reviewed")
      throw new Error("Fixture is missing a reviewed pattern");
    fixture.patterns.push({
      ...first,
      answer:
        "It is a reusable document and source-code knowledge agent. [evidence:purpose]",
      groupKey: "incorrectly-separate-group",
      id: "purpose-near-duplicate",
      question: "What is this reusable repository for?",
      split: "test",
    });
    expect(
      validatePatternBatch(fixture).issues.map(({ code }) => code),
    ).toContain("near-duplicate-leakage");
  });

  it("blocks sensitive-looking evidence before hosted generation", () => {
    const report = validateSyntheticPatternSeed({
      evidence: [
        {
          id: "customer",
          label: "Customer",
          locator: "private/customer.txt",
          text: "Contact person@example.com for the account.",
        },
      ],
      language: "en",
      patternKind: "grounded-answer",
      requestedPatterns: 1,
      seedId: "sensitive",
    });
    expect(report.issues.map(({ code }) => code)).toContain(
      "possible-sensitive-data",
    );
  });

  it("fails the daily promotion gate when holdouts or training coverage are missing", () => {
    const report = evaluateReviewedBehaviorPack(batch(), {
      minimumTrainPatterns: 2,
    });
    expect(report.passed).toBe(false);
    expect(report.metrics.train).toBe(1);
    expect(report.issues.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        "Behavior pack needs at least 2 reviewed train patterns",
        "Behavior pack must keep validation and test holdouts",
      ]),
    );
  });

  it("parses only internally consistent behavior-pack manifests", () => {
    const manifest = {
      behaviorPrompt: "Use reviewed evidence-bound behavior.",
      generatedAt: "2026-08-29T00:00:00.000Z",
      metrics: {
        groups: 8,
        languages: 3,
        reviewed: 8,
        test: 1,
        train: 6,
        validation: 1,
      },
      schemaVersion: 1,
      sourceSha256: "a".repeat(64),
      trainingRows: 6,
      version: "daily-20260829T000000000Z-aaaaaaaa",
    };
    expect(parseBehaviorPackManifest(manifest)).toEqual(manifest);
    expect(
      parseBehaviorPackManifest({
        ...manifest,
        metrics: { ...manifest.metrics, train: 7 },
      }),
    ).toBeUndefined();
  });
});
