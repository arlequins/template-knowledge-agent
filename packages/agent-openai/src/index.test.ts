import { describe, expect, it } from "vitest";

import {
  createOpenAIEmbeddingProvider,
  createOpenAIModelProvider,
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
});
