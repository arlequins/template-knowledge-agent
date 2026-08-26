import type {
  KnowledgeSearchPort,
  MemorySearchPort,
  ModelProviderPort,
} from "./ports";
import type { AgentInput, AgentRun, ModelMessage } from "./types";

const MAX_CONTEXT_ITEMS = 6;

function normalizeSentence(value: string) {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

/** Returns the start of the second sentence when a model begins looping. */
function repeatedSentenceCut(value: string) {
  const sentences = [...value.matchAll(/[^.!?。！？]{20,}[.!?。！？]/gu)].map(
    (match) => ({
      end: (match.index ?? 0) + match[0].length,
      start: match.index ?? 0,
      value: normalizeSentence(match[0]),
    }),
  );
  const seen = new Set<string>();
  for (const sentence of sentences) {
    if (seen.has(sentence.value)) return sentence.start;
    seen.add(sentence.value);
  }
  return undefined;
}

function contextMessage(
  input: AgentInput,
  memories: string[],
  knowledge: string[],
): ModelMessage {
  const sections = [
    input.profile.instructions,
    input.profile.reviewedBehaviorPrompt,
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

      let emitted = "";
      for await (const text of dependencies.model.streamText({ messages })) {
        const candidate = emitted + text;
        const cut = repeatedSentenceCut(candidate);
        if (cut !== undefined) {
          if (cut > emitted.length)
            yield {
              text: candidate.slice(emitted.length, cut),
              type: "text-delta",
            };
          break;
        }
        emitted = candidate;
        yield { type: "text-delta", text };
      }

      yield { type: "complete", citations };
    },
  };
}
