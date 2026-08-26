import { describe, expect, it } from "vitest";

import { createModelRouter, type ModelRegistryEntry } from "./model-routing";

const registry: ModelRegistryEntry[] = [
  {
    capabilities: ["fast", "balanced"],
    id: "small-local",
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
    provider: "ollama",
  },
  {
    capabilities: ["balanced", "coding", "deep"],
    id: "hosted-coding",
    inputCostPerMillionTokens: 1,
    outputCostPerMillionTokens: 3,
    provider: "openai",
  },
];

describe("model router", () => {
  it("routes coding questions to a coding-capable model", () => {
    const decision = createModelRouter(registry).select({
      question: "Which tRPC procedure owns this TypeScript bug?",
    });
    expect(decision).toMatchObject({
      model: { id: "hosted-coding" },
      profile: "coding",
      reason: "coding",
    });
  });

  it("keeps selection deterministic and honors an explicit budget", () => {
    const router = createModelRouter(registry);
    expect(
      router.select({ budgetUsd: 0, question: "Summarize this document" }),
    ).toMatchObject({ model: { id: "small-local" }, reason: "budget" });
    expect(
      router.select({
        question: "Summarize this document",
        requestedProfile: "deep",
      }),
    ).toMatchObject({ model: { id: "hosted-coding" }, reason: "requested" });
  });

  it("prefers deep capability when evidence conflicts", () => {
    expect(
      createModelRouter(registry).select({
        hasConflictingEvidence: true,
        question: "Which source is correct?",
      }),
    ).toMatchObject({ profile: "deep", reason: "conflicting-evidence" });
  });

  it("rejects an empty or duplicate registry", () => {
    expect(() => createModelRouter([])).toThrow("cannot be empty");
    expect(() =>
      createModelRouter([
        registry[0] as ModelRegistryEntry,
        registry[0] as ModelRegistryEntry,
      ]),
    ).toThrow("duplicate IDs");
  });
});
