import type { PatternBatch } from "@arlequins/tuning-kit";
import { describe, expect, it } from "vitest";

import { mergeApprovedInvestigations } from "./approved-investigation-merge";

const baseBatch: PatternBatch = {
  evidence: [
    {
      id: "public-doc",
      label: "public.md",
      locator: "public.md#intro",
      text: "Public documentation.",
    },
  ],
  patterns: [
    {
      answer: "The public answer. [evidence:public-doc]",
      evidenceIds: ["public-doc"],
      forbiddenClaims: [],
      generatedBy: "fixture",
      groupKey: "public",
      id: "public",
      language: "en",
      patternKind: "grounded-answer",
      question: "What is public?",
      requiredTerms: [],
      reviewedAt: "2026-08-26T00:00:00.000Z",
      reviewedBy: "fixture",
      split: "train",
      status: "reviewed",
    },
  ],
  schemaVersion: 1,
};

describe("approved investigation export", () => {
  it("adds only grounded, non-duplicate findings from workspace chunks", () => {
    const result = mergeApprovedInvestigations(
      baseBatch,
      [
        {
          completedAt: new Date("2026-08-26T01:00:00.000Z"),
          findings: {
            correctedAnswer: "The private answer. [evidence:private-doc]",
            evidenceIds: ["private-doc"],
            language: "en",
            patternKind: "code-navigation",
          },
          id: "investigation-1",
          question: "How is the private code organized?",
        },
        {
          completedAt: null,
          findings: {
            correctedAnswer: "This has no authorized citation.",
            evidenceIds: ["missing-doc"],
          },
          id: "investigation-2",
          question: "What should be skipped?",
        },
        {
          completedAt: null,
          findings: {
            correctedAnswer: "The public answer. [evidence:public-doc]",
            evidenceIds: ["public-doc"],
          },
          id: "investigation-3",
          question: "A paraphrase of the public question",
        },
      ],
      [
        {
          content: "Private code documentation.",
          id: "private-doc",
          label: "private.md",
          locator: "private.md#code",
        },
      ],
      "owner-1",
    );

    expect(result.additions).toHaveLength(1);
    expect(result.batch.patterns.at(-1)).toMatchObject({
      evidenceIds: ["private-doc"],
      generatedBy: "owner-review",
      id: "investigation-investigation-1",
      patternKind: "code-navigation",
      reviewedBy: "owner-1",
      split: "train",
      status: "reviewed",
    });
    expect(result.skipped).toEqual([
      {
        id: "investigation-2",
        reason: "one or more evidenceIds are outside this workspace",
      },
      {
        id: "investigation-3",
        reason: "duplicate question or answer",
      },
    ]);
    expect(result.batch.evidence.map(({ id }) => id)).toEqual([
      "public-doc",
      "private-doc",
    ]);
  });

  it("skips a lexical near-duplicate that would leak into another split", () => {
    const result = mergeApprovedInvestigations(
      {
        ...baseBatch,
        patterns: baseBatch.patterns.map((pattern) => ({
          ...pattern,
          question: "What does the public documentation describe?",
          split: "test" as const,
        })),
      },
      [
        {
          completedAt: new Date("2026-08-26T01:00:00.000Z"),
          findings: {
            correctedAnswer:
              "The public documentation answer. [evidence:public-doc]",
            evidenceIds: ["public-doc"],
            language: "en",
          },
          id: "near-duplicate",
          question: "What exactly does the public documentation describe?",
        },
      ],
      [],
      "owner-1",
    );

    expect(result.additions).toEqual([]);
    expect(result.skipped[0]?.reason).toContain("quality gate:");
  });
});
