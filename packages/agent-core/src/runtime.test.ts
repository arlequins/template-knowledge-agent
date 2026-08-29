import { describe, expect, it } from "vitest";

import { createAgentRuntime } from "./runtime";

describe("createAgentRuntime", () => {
  it("keeps workspace-scoped memory and knowledge in the model context", async () => {
    const runtime = createAgentRuntime({
      knowledgeSearch: {
        async search() {
          return [
            {
              citation: {
                chunkId: "chunk-1",
                documentId: "doc-1",
                label: "Policy",
              },
              content: "The refund period is 14 days.",
              score: 0.9,
            },
          ];
        },
      },
      memorySearch: {
        async search() {
          return [
            {
              content: "The user prefers concise answers.",
              id: "memory-1",
              importance: 1,
            },
          ];
        },
      },
      model: {
        async *streamText(input) {
          expect(input.messages[0]?.content).toContain("concise answers");
          expect(input.messages[0]?.content).toContain("refund period");
          expect(input.messages[0]?.content).toContain("[source: Policy]");
          expect(input.messages[0]?.content).toContain("reviewed example");
          yield "Fourteen days.";
        },
      },
    });

    const events = [];
    for await (const event of runtime.run({
      history: [],
      profile: {
        id: "assistant",
        instructions: "Be helpful.",
        name: "Assistant",
        reviewedBehaviorPrompt: "Follow this reviewed example.",
        workspaceId: "workspace-1",
      },
      question: "What is the refund period?",
      workspaceId: "workspace-1",
    }))
      events.push(event);

    expect(events).toEqual([
      {
        type: "retrieval-complete",
        citations: [
          { chunkId: "chunk-1", documentId: "doc-1", label: "Policy" },
        ],
      },
      { type: "text-delta", text: "Fourteen days." },
      {
        type: "complete",
        citations: [
          { chunkId: "chunk-1", documentId: "doc-1", label: "Policy" },
        ],
      },
    ]);
  });

  it("stops a repeated sentence loop before persisting the duplicate", async () => {
    const runtime = createAgentRuntime({
      knowledgeSearch: {
        async search() {
          return [];
        },
      },
      memorySearch: {
        async search() {
          return [];
        },
      },
      model: {
        async *streamText() {
          yield "This answer is grounded in the supplied source. ";
          yield "This answer is grounded in the supplied source. ";
        },
      },
    });
    const texts: string[] = [];
    for await (const event of runtime.run({
      history: [],
      profile: {
        id: "assistant",
        instructions: "",
        name: "Assistant",
        workspaceId: "workspace-1",
      },
      question: "Explain.",
      workspaceId: "workspace-1",
    }))
      if (event.type === "text-delta") texts.push(event.text);
    expect(texts.join("")).toBe(
      "This answer is grounded in the supplied source. ",
    );
  });

  it("stops a provider that repeats a long suffix without punctuation", async () => {
    const repeated =
      "grounded answers cite supplied evidence and distinguish source facts from unknown current state ";
    const runtime = createAgentRuntime({
      knowledgeSearch: {
        async search() {
          return [];
        },
      },
      memorySearch: {
        async search() {
          return [];
        },
      },
      model: {
        async *streamText() {
          yield repeated;
          yield repeated;
        },
      },
    });
    const texts: string[] = [];
    for await (const event of runtime.run({
      history: [],
      profile: {
        id: "assistant",
        instructions: "",
        name: "Assistant",
        workspaceId: "workspace-1",
      },
      question: "Explain.",
      workspaceId: "workspace-1",
    }))
      if (event.type === "text-delta") texts.push(event.text);
    expect(texts.join("")).toBe(repeated);
  });

  it("caps output before an unbounded provider can exhaust the request", async () => {
    const runtime = createAgentRuntime({
      knowledgeSearch: {
        async search() {
          return [];
        },
      },
      memorySearch: {
        async search() {
          return [];
        },
      },
      maxOutputChars: 256,
      model: {
        async *streamText() {
          yield "x".repeat(500);
        },
      },
    });
    const texts: string[] = [];
    for await (const event of runtime.run({
      history: [],
      profile: {
        id: "assistant",
        instructions: "",
        name: "Assistant",
        workspaceId: "workspace-1",
      },
      question: "Explain.",
      workspaceId: "workspace-1",
    }))
      if (event.type === "text-delta") texts.push(event.text);
    expect(texts.join("")).toHaveLength(256);
  });
});
