export type ModelRouteProfile = "balanced" | "coding" | "deep" | "fast";

export type ModelRegistryEntry = {
  capabilities: readonly ModelRouteProfile[];
  id: string;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
  provider: string;
};

export type ModelRouteInput = {
  budgetUsd?: number;
  hasConflictingEvidence?: boolean;
  question: string;
  requestedProfile?: ModelRouteProfile;
};

export type ModelRouteDecision = {
  model: ModelRegistryEntry;
  profile: ModelRouteProfile;
  reason:
    | "budget"
    | "coding"
    | "conflicting-evidence"
    | "requested"
    | "default";
};

const CODING_TERMS =
  /\b(api|bug|class|code|compile|css|database|debug|drizzle|error|function|hook|java|javascript|migration|next\.js|python|query|react|ruby|schema|sql|stack|ts|typescript|tRPC|型|コード|エラー|코드|오류)\b/iu;

function estimatedCost(entry: ModelRegistryEntry) {
  return (
    (entry.inputCostPerMillionTokens ?? 0) +
    (entry.outputCostPerMillionTokens ?? 0)
  );
}

function profileFor(input: ModelRouteInput): ModelRouteProfile {
  if (input.requestedProfile) return input.requestedProfile;
  if (input.hasConflictingEvidence) return "deep";
  if (CODING_TERMS.test(input.question)) return "coding";
  return "balanced";
}

/**
 * Selects a registered model without coupling domain code to a provider SDK.
 * The decision is deterministic so it can be replayed by the evaluation job.
 */
export function createModelRouter(entries: readonly ModelRegistryEntry[]) {
  if (entries.length === 0) throw new Error("Model registry cannot be empty");
  if (new Set(entries.map(({ id }) => id)).size !== entries.length)
    throw new Error("Model registry contains duplicate IDs");
  for (const entry of entries) {
    if (!entry.id.trim() || !entry.provider.trim())
      throw new Error("Model registry entries need an id and provider");
    if (entry.capabilities.length === 0)
      throw new Error(`Model has no capabilities: ${entry.id}`);
  }

  return {
    list: () => [...entries],
    select(input: ModelRouteInput): ModelRouteDecision {
      const profile = profileFor(input);
      const capable = entries.filter((entry) =>
        entry.capabilities.includes(profile),
      );
      const candidates = capable.length > 0 ? capable : entries;
      const budgetUsd = input.budgetUsd;
      const affordable =
        budgetUsd === undefined
          ? candidates
          : candidates.filter((entry) => estimatedCost(entry) <= budgetUsd);
      const pool = affordable.length > 0 ? affordable : candidates;
      const model = [...pool].sort(
        (left, right) => estimatedCost(left) - estimatedCost(right),
      )[0];
      if (!model) throw new Error("Model registry selection failed");
      const reason = input.requestedProfile
        ? "requested"
        : input.hasConflictingEvidence
          ? "conflicting-evidence"
          : profile === "coding"
            ? "coding"
            : input.budgetUsd !== undefined
              ? "budget"
              : "default";
      return { model, profile, reason };
    },
  };
}
