import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createBedrockGuardrailConfig,
  createBedrockModelProvider,
} from "@arlequins/agent-bedrock";
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
import { parseBehaviorPackManifest } from "@arlequins/tuning-kit";
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

async function loadReviewedBehaviorPack() {
  const path =
    serverEnv.AGENT_BEHAVIOR_PACK_PATH?.trim() ??
    (process.env.NODE_ENV === "development"
      ? resolve(process.cwd(), ".local/tuning/active-behavior-pack.json")
      : undefined);
  if (!path) return undefined;
  try {
    const manifest = parseBehaviorPackManifest(
      JSON.parse(await readFile(path, "utf8")),
    );
    return manifest;
  } catch {
    return undefined;
  }
}

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
      provider: "openai" as const,
    };
  }
  if (serverEnv.BEDROCK_MODEL_ID) {
    const guardrail = createBedrockGuardrailConfig({
      ...(serverEnv.BEDROCK_GUARDRAIL_ARN
        ? { identifier: serverEnv.BEDROCK_GUARDRAIL_ARN }
        : {}),
      ...(serverEnv.BEDROCK_GUARDRAIL_VERSION
        ? { version: serverEnv.BEDROCK_GUARDRAIL_VERSION }
        : {}),
    });
    return {
      embedding: undefined,
      model: createBedrockModelProvider({
        client: createAwsBedrockConversePort(),
        ...(guardrail ? { guardrail } : {}),
        modelId: serverEnv.BEDROCK_MODEL_ID,
      }),
      modelId: serverEnv.BEDROCK_MODEL_ID,
      provider: "bedrock" as const,
    };
  }
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
      provider: "ollama" as const,
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
  const reviewedBehaviorPack = await loadReviewedBehaviorPack();

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
      modelProvider: providers.provider,
      ...(reviewedBehaviorPack
        ? {
            reviewedBehaviorPack: {
              generatedAt: reviewedBehaviorPack.generatedAt,
              ...(reviewedBehaviorPack.model
                ? { model: reviewedBehaviorPack.model }
                : {}),
              version: reviewedBehaviorPack.version,
            },
            reviewedBehaviorPrompt: reviewedBehaviorPack.behaviorPrompt.slice(
              0,
              40_000,
            ),
          }
        : {}),
    },
  };
}
