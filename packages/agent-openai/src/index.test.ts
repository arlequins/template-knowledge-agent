import { describe, expect, it } from "vitest";

import {
  createOpenAIEmbeddingProvider,
  createOpenAIModelProvider,
  createOpenAISyntheticPatternGenerator,
} from "./index";

describe("OpenAI providers", () => {
  it("streams Responses API text while disabling provider storage", async () => {
    const requests: Request[] = [];
    const provider = createOpenAIModelProvider({
      apiKey: "test-key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(
          'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n' +
            'data: {"type":"response.output_text.delta","delta":" world"}\n\n' +
            "data: [DONE]\n\n",
        );
      },
      model: "gpt-test",
    });

    const chunks: string[] = [];
    for await (const chunk of provider.streamText({
      messages: [{ role: "user", content: "Hi" }],
    }))
      chunks.push(chunk);

    expect(chunks.join("")).toBe("Hello world");
    const body = (await requests[0]?.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-test",
      store: false,
      stream: true,
    });
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer test-key");
  });

  it("keeps embedding order stable", async () => {
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: [
              { embedding: [0.3, 0.4], index: 1 },
              { embedding: [0.1, 0.2], index: 0 },
            ],
          }),
        ),
    });
    await expect(
      provider.embed({ input: ["first", "second"] }),
    ).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("requires a non-empty API key", () => {
    expect(() => createOpenAIModelProvider({ apiKey: " " })).toThrow(
      "OPENAI_API_KEY",
    );
  });

  it("uses Luna structured output for unapproved synthetic patterns", async () => {
    const requests: Request[] = [];
    const generator = createOpenAISyntheticPatternGenerator({
      apiKey: "test-key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      patterns: [
                        {
                          answer:
                            "It is a reusable knowledge agent. [evidence:purpose]",
                          evidenceIds: ["purpose"],
                          forbiddenClaims: ["daily fine-tuning"],
                          groupKey: "purpose-grounded",
                          id: "purpose-en",
                          language: "en",
                          patternKind: "grounded-answer",
                          question: "What is the repository for?",
                          requiredTerms: ["knowledge agent"],
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
          }),
        );
      },
    });
    await expect(
      generator.generate({
        evidence: [
          {
            id: "purpose",
            label: "Purpose",
            locator: "README.md",
            text: "This repository is a reusable knowledge agent.",
          },
        ],
        language: "en",
        patternKind: "grounded-answer",
        requestedPatterns: 1,
        seedId: "purpose",
      }),
    ).resolves.toMatchObject([
      { generatedBy: "gpt-5.6-luna", status: "candidate" },
    ]);
    const body = (await requests[0]?.json()) as {
      model: string;
      store: boolean;
      text: { format: { type: string } };
      tools?: unknown;
    };
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      text: { format: { type: "json_schema" } },
    });
    expect(body.tools).toBeUndefined();
  });
});
