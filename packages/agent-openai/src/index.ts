import type {
  EmbeddingProviderPort,
  ModelProviderPort,
  StreamTextRequest,
} from "@arlequins/agent-core";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export type OpenAIProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  model?: string;
  requestTimeoutMs?: number;
};

function settings(options: OpenAIProviderOptions) {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const url = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  )
    throw new Error(
      "OPENAI_BASE_URL must use HTTPS unless it targets localhost",
    );
  return {
    apiKey,
    baseUrl: url.toString().replace(/\/$/, ""),
    fetch: options.fetch ?? globalThis.fetch,
    requestTimeoutMs: options.requestTimeoutMs ?? 120_000,
  };
}

function errorMessage(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string")
      return `OpenAI request failed (${status}): ${parsed.error.message}`;
  } catch {
    // Provider error bodies are not guaranteed to be JSON.
  }
  return `OpenAI request failed (${status})`;
}

async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffered += decoder.decode(value, { stream: !done });
      const events = buffered.split("\n\n");
      buffered = events.pop() ?? "";
      for (const event of events) {
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        const parsed = JSON.parse(data) as unknown;
        if (parsed && typeof parsed === "object")
          yield parsed as Record<string, unknown>;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

/** OpenAI Responses API adapter. Provider-side response storage is explicitly disabled. */
export function createOpenAIModelProvider(
  options: OpenAIProviderOptions,
): ModelProviderPort {
  const configured = settings(options);
  const model = options.model?.trim() || DEFAULT_MODEL;
  return {
    async *streamText(input: StreamTextRequest) {
      const response = await configured.fetch(
        `${configured.baseUrl}/responses`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${configured.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            input: input.messages,
            model,
            store: false,
            stream: true,
          }),
          signal: AbortSignal.timeout(configured.requestTimeoutMs),
        },
      );
      if (!response.ok)
        throw new Error(errorMessage(response.status, await response.text()));
      if (!response.body)
        throw new Error("OpenAI returned an empty response body");
      for await (const event of readServerSentEvents(response.body)) {
        if (event.type === "response.failed")
          throw new Error("OpenAI response generation failed");
        if (
          event.type === "response.output_text.delta" &&
          typeof event.delta === "string" &&
          event.delta.length > 0
        )
          yield event.delta;
      }
    },
  };
}

export function createOpenAIEmbeddingProvider(
  options: OpenAIProviderOptions & { dimensions?: number },
): EmbeddingProviderPort {
  const configured = settings(options);
  const model = options.model?.trim() || DEFAULT_EMBEDDING_MODEL;
  return {
    async embed({ input }) {
      if (input.length === 0) return [];
      const response = await configured.fetch(
        `${configured.baseUrl}/embeddings`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${configured.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            input,
            model,
            ...(options.dimensions ? { dimensions: options.dimensions } : {}),
          }),
          signal: AbortSignal.timeout(configured.requestTimeoutMs),
        },
      );
      if (!response.ok)
        throw new Error(errorMessage(response.status, await response.text()));
      const result = (await response.json()) as {
        data?: Array<{ embedding?: unknown; index?: number }>;
      };
      if (!Array.isArray(result.data))
        throw new Error("OpenAI returned invalid embeddings");
      const rows = [...result.data].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      );
      if (
        rows.length !== input.length ||
        rows.some(
          ({ embedding }) =>
            !Array.isArray(embedding) ||
            embedding.some((value) => typeof value !== "number"),
        )
      )
        throw new Error("OpenAI returned invalid embeddings");
      return rows.map(({ embedding }) => embedding as number[]);
    },
  };
}

export {
  DEFAULT_BASE_URL as DEFAULT_OPENAI_BASE_URL,
  DEFAULT_EMBEDDING_MODEL as DEFAULT_OPENAI_EMBEDDING_MODEL,
  DEFAULT_MODEL as DEFAULT_OPENAI_MODEL,
};
