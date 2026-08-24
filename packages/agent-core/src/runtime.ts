import type {
  KnowledgeSearchPort,
  MemorySearchPort,
  ModelProviderPort,
} from "./ports";
import type { AgentInput, AgentRun, ModelMessage } from "./types";

const MAX_CONTEXT_ITEMS = 6;

function contextMessage(
  input: AgentInput,
  memories: string[],
  knowledge: string[],
): ModelMessage {
  const sections = [
    input.profile.instructions,
    input.conversationSummary
      ? `Conversation summary:\n${input.conversationSummary}`
      : undefined,
    memories.length > 0
      ? `Relevant memory:\n${memories.join("\n")}`
      : undefined,
    knowledge.length > 0
      ? `Retrieved knowledge:\n${knowledge.join("\n\n")}`
      : undefined,
    "Use retrieved knowledge as evidence and distinguish project sources from official documentation. If it is insufficient or a static source cannot prove current business state, say what is unknown instead of inventing facts. Refer to the supplied source labels when explaining an answer.",
  ].filter((section): section is string => Boolean(section));

  return { role: "system", content: sections.join("\n\n") };
}

export function createAgentRuntime(dependencies: {
  knowledgeSearch: KnowledgeSearchPort;
  memorySearch: MemorySearchPort;
  model: ModelProviderPort;
}): { run(input: AgentInput): AgentRun } {
  return {
    async *run(input) {
      const [matches, memories] = await Promise.all([
        dependencies.knowledgeSearch.search({
          query: input.question,
          workspaceId: input.workspaceId,
        }),
        dependencies.memorySearch.search({
          query: input.question,
          workspaceId: input.workspaceId,
        }),
      ]);
      const selectedMatches = matches.slice(0, MAX_CONTEXT_ITEMS);
      const selectedMemories = memories.slice(0, MAX_CONTEXT_ITEMS);
      const citations = selectedMatches.map((match) => match.citation);

      yield { type: "retrieval-complete", citations };

      const messages: ModelMessage[] = [
        contextMessage(
          input,
          selectedMemories.map((memory) => memory.content),
          selectedMatches.map(
            (match) =>
              `[source: ${match.citation.label}${
                match.citation.locator ? ` · ${match.citation.locator}` : ""
              }]\n${match.content}`,
          ),
        ),
        ...input.history,
        { role: "user", content: input.question },
      ];

      for await (const text of dependencies.model.streamText({ messages })) {
        yield { type: "text-delta", text };
      }

      yield { type: "complete", citations };
    },
  };
}
