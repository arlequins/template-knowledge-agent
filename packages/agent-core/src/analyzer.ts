export type AnalyzerKnowledgeUnit = {
  id: string;
  kind:
    | "config"
    | "data-model"
    | "document"
    | "procedure"
    | "route"
    | "section"
    | "symbol"
    | "test";
  locator: string;
  name: string;
  sourcePath: string;
};

export type AnalyzerKnowledgeEdge = {
  from: string;
  kind:
    | "calls"
    | "documents"
    | "exposes"
    | "imports"
    | "reads"
    | "renders"
    | "validates"
    | "writes";
  to: string;
};

export type AnalyzerSnapshot = {
  commit?: string;
  files: readonly string[];
  root: string;
};

export type AnalyzerPlan = {
  files: readonly string[];
  requirements: readonly string[];
};

export type AnalyzerFacts = {
  edges: readonly AnalyzerKnowledgeEdge[];
  units: readonly AnalyzerKnowledgeUnit[];
};

export type AnalyzerPlugin = {
  detect(
    snapshot: AnalyzerSnapshot,
  ): Promise<{ confidence: number; roots: readonly string[] }>;
  extract(
    snapshot: AnalyzerSnapshot,
    plan: AnalyzerPlan,
  ): Promise<AnalyzerFacts>;
  normalize(facts: AnalyzerFacts): AnalyzerFacts;
  plan(snapshot: AnalyzerSnapshot): Promise<AnalyzerPlan>;
  id: string;
};

/** Registers isolated language analyzers and rejects ambiguous plugin IDs. */
export function createAnalyzerRegistry(plugins: readonly AnalyzerPlugin[]) {
  if (plugins.length === 0)
    throw new Error("Analyzer registry cannot be empty");
  if (new Set(plugins.map(({ id }) => id)).size !== plugins.length)
    throw new Error("Analyzer registry contains duplicate IDs");
  return {
    list: () => plugins.map(({ id }) => id),
    async detect(snapshot: AnalyzerSnapshot) {
      return Promise.all(
        plugins.map(async (plugin) => ({
          plugin: plugin.id,
          ...(await plugin.detect(snapshot)),
        })),
      );
    },
    get(id: string) {
      const plugin = plugins.find((candidate) => candidate.id === id);
      if (!plugin) throw new Error(`Unknown analyzer plugin: ${id}`);
      return plugin;
    },
  };
}
