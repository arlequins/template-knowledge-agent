import { createBedrockModelProvider } from "@arlequins/agent-bedrock";
import { createTextDocumentExtraction } from "@arlequins/agent-core";
import {
  createOllamaEmbeddingProvider,
  createOllamaModelProvider,
} from "@arlequins/agent-ollama";
import {
  createOpenAIEmbeddingProvider,
  createOpenAIModelProvider,
} from "@arlequins/agent-openai";
import { authApi } from "@arlequins/auth";
import { db } from "@arlequins/db-backbone/client";
import { serverEnv } from "@arlequins/env";
import { createAgentPlatformRepository } from "../adaptors/agent-platform";
import {
  createDatabaseKnowledgeSearch,
  createDatabaseMemorySearch,
} from "../adaptors/agent-retrieval";
import { createAwsBedrockConversePort } from "../adaptors/bedrock-converse";
import { deriveTemplateSession } from "../adaptors/oidc-identity";
import type { CreateTRPCContextOptions, TRPCContext } from "../context";

function bootstrapAdministratorIdentities() {
  return new Set(
    (serverEnv.AUTH_BOOTSTRAP_ADMIN_IDENTITIES ?? "")
      .split(",")
      .map((identity) => identity.trim())
      .filter(Boolean),
  );
}

const agent = createAgentPlatformRepository(db);

function modelProviders() {
  if (serverEnv.OPENAI_API_KEY) {
    const common = {
      apiKey: serverEnv.OPENAI_API_KEY,
      baseUrl: serverEnv.OPENAI_BASE_URL,
    };
    return {
      embedding: createOpenAIEmbeddingProvider({
        ...common,
        model: serverEnv.OPENAI_EMBEDDING_MODEL,
      }),
      model: createOpenAIModelProvider({
        ...common,
        model: serverEnv.OPENAI_MODEL,
      }),
      modelId: serverEnv.OPENAI_MODEL ?? "gpt-5.6-luna",
    };
  }
  if (serverEnv.BEDROCK_MODEL_ID)
    return {
      embedding: undefined,
      model: createBedrockModelProvider({
        client: createAwsBedrockConversePort(),
        modelId: serverEnv.BEDROCK_MODEL_ID,
      }),
      modelId: serverEnv.BEDROCK_MODEL_ID,
    };
  if (serverEnv.OLLAMA_BASE_URL)
    return {
      embedding: createOllamaEmbeddingProvider({
        baseUrl: serverEnv.OLLAMA_BASE_URL,
        model: serverEnv.OLLAMA_EMBEDDING_MODEL,
      }),
      model: createOllamaModelProvider({
        baseUrl: serverEnv.OLLAMA_BASE_URL,
        model: serverEnv.OLLAMA_MODEL,
      }),
      modelId: serverEnv.OLLAMA_MODEL ?? "qwen2.5:3b",
    };
  return { embedding: undefined, model: undefined, modelId: undefined };
}

export async function createTRPCContext(
  options: CreateTRPCContextOptions,
): Promise<TRPCContext> {
  const tokenSession = await authApi.getSession({ headers: options.headers });
  const session = tokenSession
    ? deriveTemplateSession(tokenSession, bootstrapAdministratorIdentities())
    : null;
  const providers = modelProviders();

  if (session)
    options.logger.info("auth.login.succeeded", {
      issuer: session.user.issuer,
      subject: session.user.subject,
      userId: session.user.id,
    });

  return {
    authApi,
    logger: options.logger,
    telemetry: options.telemetry,
    session,
    services: {
      agent,
      documentExtraction: createTextDocumentExtraction(),
      embedding: providers.embedding,
      knowledgeSearch: createDatabaseKnowledgeSearch(db, {
        embedding: providers.embedding,
      }),
      memorySearch: createDatabaseMemorySearch(db),
      model: providers.model,
      modelId: providers.modelId,
    },
  };
}
