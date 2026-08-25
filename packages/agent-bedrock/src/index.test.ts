import { describe, expect, it, vi } from "vitest";

import {
  createBedrockGuardrailConfig,
  createBedrockModelProvider,
} from "./index";

describe("createBedrockModelProvider", () => {
  it("delegates streaming to the injected cloud boundary", async () => {
    const provider = createBedrockModelProvider({
      client: {
        async *stream() {
          yield "safe";
        },
      },
      modelId: "example.model",
    });
    const chunks: string[] = [];
    for await (const chunk of provider.streamText({
      messages: [{ content: "hello", role: "user" }],
    }))
      chunks.push(chunk);
    expect(chunks).toEqual(["safe"]);
  });

  it("requires the complete guardrail pair and forwards it", async () => {
    expect(createBedrockGuardrailConfig({})).toBeUndefined();
    expect(() =>
      createBedrockGuardrailConfig({ identifier: "guardrail-1" }),
    ).toThrow("configured together");
    const stream = vi.fn(async function* () {
      yield "safe";
    });
    const guardrail = createBedrockGuardrailConfig({
      identifier: "guardrail-1",
      version: "3",
    });
    const provider = createBedrockModelProvider({
      client: { stream },
      guardrail,
      modelId: "model-1",
    });

    for await (const _event of provider.streamText({ messages: [] })) {
      // Drain the provider stream so the adapter call is observable.
    }
    expect(stream).toHaveBeenCalledWith({
      guardrail,
      messages: [],
      modelId: "model-1",
    });
  });
});
