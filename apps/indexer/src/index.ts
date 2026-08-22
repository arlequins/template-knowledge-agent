import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
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
import { chunkMarkdown, chunkSource } from "./chunk";

const ALLOWED_EXTENSIONS = new Set([
  ".cjs",
  ".cs",
  ".csproj",
  ".css",
  ".gradle",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".prisma",
  ".rb",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".local",
  ".next",
  ".open-next",
  ".sst",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "private",
  "target",
]);
const MAX_FILE_BYTES = 1_000_000;

async function sourceFiles(root: string, maximum: number) {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (files.length >= maximum) return;
      if (entry.isSymbolicLink()) continue;
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(absolute);
        continue;
      }
      if (
        entry.isFile() &&
        ALLOWED_EXTENSIONS.has(extname(entry.name).toLowerCase())
      )
        files.push(absolute);
    }
  }
  await visit(root);
  return files.sort();
}

async function workspaceOwner(workspaceId: string) {
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

async function indexFile(input: {
  absolute: string;
  embedding?: ReturnType<typeof createOpenAIEmbeddingProvider>;
  root: string;
  userId: string;
  workspaceId: string;
}) {
  const info = await stat(input.absolute);
  if (info.size > MAX_FILE_BYTES) return "skipped" as const;
  const content = await readFile(input.absolute, "utf8");
  if (content.includes("\0") || !content.trim()) return "skipped" as const;
  const path = relative(input.root, input.absolute).split(sep).join("/");
  const contentHash = createHash("sha256")
    .update(path)
    .update("\0")
    .update(content)
    .digest("hex");
  const chunks = [".md", ".mdx"].includes(extname(path).toLowerCase())
    ? chunkMarkdown(content, path)
    : chunkSource(content, path);
  if (chunks.length === 0) return "skipped" as const;
  const existing = await db
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
  if (existing[0]) return "unchanged" as const;

  const embeddings: number[][] = [];
  if (input.embedding)
    for (let start = 0; start < chunks.length; start += 32)
      embeddings.push(
        ...(await input.embedding.embed({
          input: chunks.slice(start, start + 32).map((chunk) => chunk.content),
        })),
      );

  await db.transaction(async (tx) => {
    await tx
      .update(Document)
      .set({ deletedAt: new Date(), status: "superseded" })
      .where(
        and(
          eq(Document.workspaceId, input.workspaceId),
          eq(Document.filename, path),
          isNull(Document.deletedAt),
        ),
      );
    const [document] = await tx
      .insert(Document)
      .values({
        contentHash,
        contentType: [".md", ".mdx"].includes(extname(path).toLowerCase())
          ? "text/markdown"
          : "text/plain",
        filename: path,
        sizeBytes: info.size,
        sourceUri: `local-repository://${contentHash}/${path}`,
        status: "completed",
        uploadedByUserId: input.userId,
        workspaceId: input.workspaceId,
      })
      .returning({ id: Document.id });
    if (!document) throw new Error(`Could not create document: ${path}`);
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
    "max-files": { default: "5000", type: "string" },
    source: { type: "string" },
    "workspace-id": { type: "string" },
  },
  strict: true,
});
if (!values.source || !values["workspace-id"])
  throw new Error("Usage: --source <absolute directory> --workspace-id <uuid>");
const root = resolve(values.source);
if (root !== values.source)
  throw new Error("--source must be an absolute directory path");
const maximum = Number(values["max-files"]);
if (!Number.isInteger(maximum) || maximum < 1 || maximum > 50_000)
  throw new Error("--max-files must be between 1 and 50000");

try {
  const userId = await workspaceOwner(values["workspace-id"]);
  const embedding = serverEnv.OPENAI_API_KEY
    ? createOpenAIEmbeddingProvider({
        apiKey: serverEnv.OPENAI_API_KEY,
        baseUrl: serverEnv.OPENAI_BASE_URL,
        model: serverEnv.OPENAI_EMBEDDING_MODEL,
      })
    : undefined;
  const files = await sourceFiles(root, maximum);
  const totals = { indexed: 0, skipped: 0, unchanged: 0 };
  for (const [index, absolute] of files.entries()) {
    const outcome = await indexFile({
      absolute,
      embedding,
      root,
      userId,
      workspaceId: values["workspace-id"],
    });
    totals[outcome] += 1;
    if ((index + 1) % 100 === 0)
      console.log(`Processed ${index + 1}/${files.length}`);
  }
  console.log(
    JSON.stringify({ files: files.length, root, ...totals }, null, 2),
  );
} finally {
  await closeDatabasePool();
}
