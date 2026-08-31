import { open } from "node:fs/promises";
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
const MAX_BEHAVIOR_PACK_BYTES = 1_000_000;

async function loadReviewedBehaviorPack() {
  const path =
    serverEnv.AGENT_BEHAVIOR_PACK_PATH?.trim() ??
    (process.env.NODE_ENV === "development"
      ? resolve(process.cwd(), ".local/tuning/active-behavior-pack.json")
      : undefined);
  if (!path) return { status: "unavailable" as const };
  try {
    const file = await open(path, "r");
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size > MAX_BEHAVIOR_PACK_BYTES)
        return {
          error: "manifest-file-too-large-or-not-a-file",
          status: "invalid" as const,
        };
      const manifest = parseBehaviorPackManifest(
        JSON.parse(await file.readFile("utf8")),
      );
      return manifest
        ? { manifest, status: "active" as const }
        : { error: "manifest-schema-invalid", status: "invalid" as const };
    } finally {
      await file.close();
    }
  } catch {
    return {
      error: "manifest-read-or-parse-failed",
      status: "invalid" as const,
    };
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
  if (reviewedBehaviorPack.status === "invalid")
    options.logger.warn("agent.behavior-pack.invalid", {
      reason: reviewedBehaviorPack.error ?? "manifest validation failed",
    });

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
      reviewedBehaviorPackStatus: reviewedBehaviorPack.status,
      ...(reviewedBehaviorPack.status === "active"
        ? {
            reviewedBehaviorPack: {
              generatedAt: reviewedBehaviorPack.manifest.generatedAt,
              ...(reviewedBehaviorPack.manifest.model
                ? { model: reviewedBehaviorPack.manifest.model }
                : {}),
              version: reviewedBehaviorPack.manifest.version,
            },
            reviewedBehaviorPrompt:
              reviewedBehaviorPack.manifest.behaviorPrompt.slice(0, 40_000),
          }
        : {}),
    },
  };
}
