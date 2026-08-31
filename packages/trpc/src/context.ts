import type {
  DocumentExtractionPort,
  EmbeddingProviderPort,
  KnowledgeSearchPort,
  MemorySearchPort,
  ModelProviderPort,
  ModelSelectionPort,
} from "@arlequins/agent-core";
import type { AuthSession, TRPCAuth } from "@arlequins/auth";
import type { Logger, Telemetry } from "@arlequins/logger";
import type { BehaviorPackManifest } from "@arlequins/tuning-kit";
import type { createAgentPlatformRepository } from "./adaptors/agent-platform";

export type TRPCServices = {
  agent: ReturnType<typeof createAgentPlatformRepository>;
  model?: ModelProviderPort;
  modelId?: string;
  modelProvider?: "bedrock" | "ollama" | "openai";
  modelSelector?: ModelSelectionPort;
  reviewedBehaviorPack?: Pick<
    BehaviorPackManifest,
    "generatedAt" | "model" | "version"
  >;
  reviewedBehaviorPackStatus?: "active" | "invalid" | "unavailable";
  reviewedBehaviorPrompt?: string;
  embedding?: EmbeddingProviderPort;
  documentExtraction: DocumentExtractionPort;
  knowledgeSearch: KnowledgeSearchPort;
  memorySearch: MemorySearchPort;
};

export type TRPCContext = {
  authApi: TRPCAuth;
  logger: Logger;
  telemetry: Telemetry;
  session: AuthSession | null;
  services: TRPCServices;
};

export type CreateTRPCContextOptions = {
  headers: Headers;
  logger: Logger;
  telemetry: Telemetry;
};
