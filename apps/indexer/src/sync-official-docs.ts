import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createOpenAIEmbeddingProvider } from "@arlequins/agent-openai";
import { closeDatabasePool, db } from "@arlequins/db-backbone/client";
import {
  Document,
  DocumentChunk,
  Workspace,
  WorkspaceMember,
} from "@arlequins/db-backbone/schema";
import { serverEnv } from "@arlequins/env";
import { and, eq, isNull } from "drizzle-orm";
import { chunkMarkdown } from "./chunk";
import { officialHtmlToMarkdown } from "./html";

type OfficialSource = {
  allowedHost: string;
  id: string;
  package: string;
  pages: string[];
  title: string;
  versionPolicy: "latest" | "latest-major";
};

function isOfficialSource(value: unknown): value is OfficialSource {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.allowedHost === "string" &&
    typeof row.id === "string" &&
    typeof row.package === "string" &&
    Array.isArray(row.pages) &&
    row.pages.every((page) => typeof page === "string") &&
    typeof row.title === "string" &&
    (row.versionPolicy === "latest" || row.versionPolicy === "latest-major")
  );
}

async function loadSources() {
  const path = resolve(
    import.meta.dirname,
    "../../../config/official-knowledge-sources.json",
  );
  const parsed = JSON.parse(await readFile(path, "utf8")) as {
    sources?: unknown;
  };
  if (!Array.isArray(parsed.sources) || !parsed.sources.every(isOfficialSource))
    throw new Error("Official knowledge source configuration is invalid");
  return parsed.sources;
}

async function ownerId(workspaceId: string) {
  const [workspace] = await db
    .select({ id: Workspace.id })
    .from(Workspace)
    .where(eq(Workspace.id, workspaceId))
    .limit(1);
  if (!workspace) throw new Error(`Workspace was not found: ${workspaceId}`);
  const [owner] = await db
    .select({ userId: WorkspaceMember.userId })
    .from(WorkspaceMember)
    .where(
      and(
        eq(WorkspaceMember.workspaceId, workspaceId),
        eq(WorkspaceMember.role, "owner"),
      ),
    )
    .limit(1);
  if (!owner) throw new Error("Workspace has no owner");
  return owner.userId;
}

async function fetchOfficialPage(source: OfficialSource, page: string) {
  const requested = new URL(page);
  if (
    requested.protocol !== "https:" ||
    requested.hostname !== source.allowedHost
  )
    throw new Error(`Source URL is outside its allowlist: ${page}`);
  const response = await fetch(requested, {
    headers: { "user-agent": "template-knowledge-agent/0.0 (+local indexing)" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const finalUrl = new URL(response.url);
  if (
    finalUrl.protocol !== "https:" ||
    finalUrl.hostname !== source.allowedHost
  )
    throw new Error(`Source redirected outside its allowlist: ${page}`);
  if (!response.ok)
    throw new Error(
      `Documentation request failed (${response.status}): ${page}`,
    );
  if (!(response.headers.get("content-type") ?? "").includes("text/html"))
    throw new Error(`Documentation response is not HTML: ${page}`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > 2_000_000)
    throw new Error(`Documentation page is too large: ${page}`);
  const html = await response.text();
  if (html.length > 2_000_000)
    throw new Error(`Documentation page is too large: ${page}`);
  const markdown = officialHtmlToMarkdown(html);
  if (markdown.length < 80)
    throw new Error(`Documentation page has no useful content: ${page}`);
  return { markdown, url: finalUrl.toString() };
}

async function storePage(input: {
  embedding?: ReturnType<typeof createOpenAIEmbeddingProvider>;
  markdown: string;
  source: OfficialSource;
  url: string;
  userId: string;
  workspaceId: string;
}) {
  const content = [
    `# ${input.source.title} official documentation`,
    `Package: ${input.source.package}`,
    `Version policy: ${input.source.versionPolicy}`,
    `Canonical source: ${input.url}`,
    "",
    input.markdown,
  ].join("\n");
  const contentHash = createHash("sha256")
    .update(input.url)
    .update("\0")
    .update(content)
    .digest("hex");
  const [existing] = await db
    .select({ id: Document.id })
    .from(Document)
    .where(
      and(
        eq(Document.workspaceId, input.workspaceId),
        eq(Document.contentHash, contentHash),
        isNull(Document.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return "unchanged" as const;
  const chunks = chunkMarkdown(content, input.url);
  const embeddings: number[][] = [];
  if (input.embedding)
    for (let start = 0; start < chunks.length; start += 32)
      embeddings.push(
        ...(await input.embedding.embed({
          input: chunks.slice(start, start + 32).map((chunk) => chunk.content),
        })),
      );
  const filename = `[official:${input.source.id}] ${new URL(input.url).pathname}`;
  await db.transaction(async (tx) => {
    await tx
      .update(Document)
      .set({ deletedAt: new Date(), status: "superseded" })
      .where(
        and(
          eq(Document.workspaceId, input.workspaceId),
          eq(Document.sourceUri, input.url),
          isNull(Document.deletedAt),
        ),
      );
    const [document] = await tx
      .insert(Document)
      .values({
        contentHash,
        contentType: "text/markdown",
        filename,
        sizeBytes: Buffer.byteLength(content),
        sourceUri: input.url,
        status: "completed",
        uploadedByUserId: input.userId,
        workspaceId: input.workspaceId,
      })
      .returning({ id: Document.id });
    if (!document)
      throw new Error(`Could not store official page: ${input.url}`);
    await tx.insert(DocumentChunk).values(
      chunks.map((chunk, index) => ({
        ...chunk,
        documentId: document.id,
        embedding: embeddings[index],
      })),
    );
  });
  return "indexed" as const;
}

const commandArguments = process.argv.slice(2);
while (commandArguments[0] === "--") commandArguments.shift();
const { values } = parseArgs({
  args: commandArguments,
  options: {
    sources: { type: "string" },
    "workspace-id": { type: "string" },
  },
  strict: true,
});
if (!values["workspace-id"])
  throw new Error("Usage: --workspace-id <uuid> [--sources react,drizzle]");

try {
  const requested = new Set(
    (values.sources ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const configured = await loadSources();
  const sources = requested.size
    ? configured.filter(({ id }) => requested.has(id))
    : configured;
  if (sources.length !== (requested.size || configured.length))
    throw new Error(
      "One or more requested official sources are not configured",
    );
  const userId = await ownerId(values["workspace-id"]);
  const embedding = serverEnv.OPENAI_API_KEY
    ? createOpenAIEmbeddingProvider({
        apiKey: serverEnv.OPENAI_API_KEY,
        baseUrl: serverEnv.OPENAI_BASE_URL,
        model: serverEnv.OPENAI_EMBEDDING_MODEL,
      })
    : undefined;
  const totals = { failed: 0, indexed: 0, unchanged: 0 };
  for (const source of sources)
    for (const page of source.pages)
      try {
        const downloaded = await fetchOfficialPage(source, page);
        const outcome = await storePage({
          embedding,
          markdown: downloaded.markdown,
          source,
          url: downloaded.url,
          userId,
          workspaceId: values["workspace-id"],
        });
        totals[outcome] += 1;
        console.log(`${outcome}: ${downloaded.url}`);
      } catch (error) {
        totals.failed += 1;
        console.error(
          `failed: ${page}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
  console.log(JSON.stringify(totals, null, 2));
  if (totals.failed > 0) process.exitCode = 1;
} finally {
  await closeDatabasePool();
}
