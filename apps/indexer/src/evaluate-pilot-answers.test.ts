import { describe, expect, it } from "vitest";

import { evaluatePilotAnswers } from "./evaluate-pilot-answers";

describe("pilot answer evaluation", () => {
  it("does not accept an unrelated retrieved source as expected evidence", () => {
    const cases = [
      {
        id: "purpose",
        kind: "retrieval" as const,
        expectedFiles: ["README.md"],
      },
    ];
    const answer = {
      caseId: "purpose",
      answer: "The repository purpose.",
      citationCount: 1,
    };
    expect(
      evaluatePilotAnswers(cases, [
        {
          ...answer,
          citations: [{ filename: "unrelated.md", content: "Other content" }],
        },
      ]).passed,
    ).toBe(false);
    expect(
      evaluatePilotAnswers(cases, [
        { ...answer, citations: [{ filename: "README.md", content: "" }] },
      ]).passed,
    ).toBe(false);
    expect(
      evaluatePilotAnswers(cases, [
        {
          ...answer,
          citations: [{ filename: "README.md", content: "Repository purpose" }],
        },
      ]).passed,
    ).toBe(true);
  });
  it("rejects empty suites and ambiguous or unknown answer identities", () => {
    expect(evaluatePilotAnswers([], []).passed).toBe(false);
    const testCase = { id: "one", kind: "refusal" as const };
    const answer = { caseId: "one", answer: "No evidence available." };
    expect(evaluatePilotAnswers([testCase, testCase], [answer]).passed).toBe(
      false,
    );
    expect(evaluatePilotAnswers([testCase], [answer, answer]).passed).toBe(
      false,
    );
    expect(
      evaluatePilotAnswers([testCase], [answer, { ...answer, caseId: "other" }])
        .passed,
    ).toBe(false);
  });

  it("requires a positive integer citation count for evidence answers", () => {
    for (const citationCount of [undefined, 0, -1, 0.5, Number.NaN, Infinity]) {
      const result = evaluatePilotAnswers(
        [{ id: "one", kind: "retrieval" }],
        [
          {
            caseId: "one",
            answer: "An otherwise plausible answer.",
            citationCount,
          },
        ],
      );
      expect(result.passed).toBe(false);
      expect(result.failures[0]?.reasons).toContain("missing citation");
    }
  });

  it("checks required terms, citations, and refusal claims", () => {
    const result = evaluatePilotAnswers(
      [
        { id: "grounded", kind: "retrieval", requiredTerms: ["Fumadocs"] },
        { forbiddenClaims: ["03:00"], id: "refusal", kind: "refusal" },
      ],
      [
        { answer: "Fumadocs is used.", caseId: "grounded", citationCount: 1 },
        { answer: "No schedule is proven.", caseId: "refusal" },
      ],
    );
    expect(result).toMatchObject({ cases: 2, passed: true, passRate: 1 });
  });

  it("reports missing and forbidden evidence", () => {
    const result = evaluatePilotAnswers(
      [{ id: "case", kind: "retrieval", requiredTerms: ["source"] }],
      [{ answer: "03:00", caseId: "case", citationCount: 0 }],
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]?.reasons).toEqual(
      expect.arrayContaining(["missing term: source", "missing citation"]),
    );
  });

  it("rejects repeated sentence loops and duplicate answers", () => {
    const loop = "This is a repeated sentence that should be stopped. ".repeat(
      2,
    );
    const result = evaluatePilotAnswers(
      [
        { id: "loop", kind: "refusal" },
        { id: "duplicate", kind: "refusal" },
      ],
      [
        { answer: loop, caseId: "loop" },
        { answer: "No reliable source is available.", caseId: "duplicate" },
      ],
    );
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasons: ["repeated sentence"] }),
      ]),
    );

    const duplicate = evaluatePilotAnswers(
      [
        { id: "one", kind: "refusal" },
        { id: "two", kind: "refusal" },
      ],
      [
        { answer: "The same safe answer.", caseId: "one" },
        { answer: "The same safe answer.", caseId: "two" },
      ],
    );
    expect(duplicate.failures[0]?.reasons).toContain("duplicate answer: one");
  });
});
