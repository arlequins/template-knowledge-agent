import type {
  ModelProviderPort,
  StreamTextRequest,
} from "@arlequins/agent-core";

export type BedrockGuardrailConfig = {
  identifier: string;
  version: string;
};

export function createBedrockGuardrailConfig(input: {
  identifier?: string;
  version?: string;
}): BedrockGuardrailConfig | undefined {
  if (!input.identifier && !input.version) return undefined;
  if (!input.identifier || !input.version)
    throw new Error(
      "Bedrock guardrail identifier and version must be configured together",
    );
  return { identifier: input.identifier, version: input.version };
}

/**
 * AWS SDK-free boundary for Bedrock Converse streaming. Hosts inject the SDK adapter,
 * keeping this template installable and testable without cloud credentials.
 */
export type BedrockConversePort = {
  stream(input: {
    guardrail?: BedrockGuardrailConfig;
    messages: StreamTextRequest["messages"];
    modelId: string;
  }): AsyncIterable<string>;
};

export function createBedrockModelProvider(input: {
  client: BedrockConversePort;
  guardrail?: BedrockGuardrailConfig;
  modelId: string;
}): ModelProviderPort {
  return {
    streamText: ({ messages }) =>
      input.client.stream({
        ...(input.guardrail ? { guardrail: input.guardrail } : {}),
        messages,
        modelId: input.modelId,
      }),
  };
}
