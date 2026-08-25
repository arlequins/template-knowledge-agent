import { ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it, vi } from "vitest";
import { createAwsBedrockConversePort } from "./bedrock-converse";

describe("AWS Bedrock Converse adapter", () => {
  it("separates system instructions and yields only text deltas", async () => {
    const send = vi.fn(async (_command: unknown) => ({
      stream: (async function* () {
        yield { messageStart: { role: "assistant" } };
        yield { contentBlockDelta: { delta: { text: "안녕" } } };
      })(),
    }));
    const port = createAwsBedrockConversePort({ send } as never);
    const output: string[] = [];
    for await (const delta of port.stream({
      messages: [
        { content: "지침", role: "system" },
        { content: "질문", role: "user" },
      ],
      modelId: "model",
    }))
      output.push(delta);
    expect(output).toEqual(["안녕"]);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(ConverseStreamCommand);
    expect((command as ConverseStreamCommand).input).toMatchObject({
      messages: [{ content: [{ text: "질문" }], role: "user" }],
      modelId: "model",
      system: [{ text: "지침" }],
    });
  });

  it("attaches a configured guardrail without enabling raw trace output", async () => {
    const send = vi.fn(async (_command: unknown) => ({
      stream: (async function* () {
        yield { contentBlockDelta: { delta: { text: "masked" } } };
      })(),
    }));
    const port = createAwsBedrockConversePort({ send } as never);

    for await (const _text of port.stream({
      guardrail: { identifier: "guardrail-1", version: "2" },
      messages: [{ content: "질문", role: "user" }],
      modelId: "model-1",
    })) {
      // Drain the stream.
    }

    const command = send.mock.calls[0]?.[0] as ConverseStreamCommand;
    expect(command.input.guardrailConfig).toEqual({
      guardrailIdentifier: "guardrail-1",
      guardrailVersion: "2",
    });
    expect(command.input.guardrailConfig).not.toHaveProperty("trace");
  });
});
