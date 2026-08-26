import { describe, expect, it } from "vitest";

import { evaluatePilotAnswers } from "./evaluate-pilot-answers";

describe("pilot answer evaluation", () => {
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
});
