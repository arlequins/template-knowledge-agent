import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { closeDatabasePool, db } from "@arlequins/db-backbone/client";
import {
  Conversation,
  Document,
  DocumentChunk,
  Feedback,
  Investigation,
  Message,
  WorkspaceMember,
} from "@arlequins/db-backbone/schema";
import { type PatternBatch, validatePatternBatch } from "@arlequins/tuning-kit";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import {
  type InvestigationRecord,
  mergeApprovedInvestigations,
} from "./approved-investigation-merge";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function localPath(value: string) {
  const output = resolve(REPOSITORY_ROOT, value);
  const localRoot = resolve(REPOSITORY_ROOT, ".local");
  const pathFromLocal = relative(localRoot, output);
  if (
    pathFromLocal === "" ||
    pathFromLocal === ".." ||
    pathFromLocal.startsWith(`..${sep}`)
  )
    throw new Error("Feedback exports must stay under .local/");
  return output;
}

function repositoryPath(value: string) {
  const input = resolve(REPOSITORY_ROOT, value);
  const pathFromRoot = relative(REPOSITORY_ROOT, input);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`))
    throw new Error("Feedback inputs must stay inside the repository");
  return input;
}

export async function exportApprovedInvestigations(options: {
  inputPath: string;
  outputPath: string;
  userId: string;
  workspaceId: string;
}) {
  const batch = JSON.parse(
    await readFile(options.inputPath, "utf8"),
  ) as PatternBatch;
  const [owner] = await db
    .select({ role: WorkspaceMember.role })
    .from(WorkspaceMember)
    .where(
      and(
        eq(WorkspaceMember.workspaceId, options.workspaceId),
        eq(WorkspaceMember.userId, options.userId),
        eq(WorkspaceMember.role, "owner"),
      ),
    )
    .limit(1);
  if (!owner) throw new Error("Workspace owner role is required");

  const rows = await db
    .select({
      completedAt: Investigation.completedAt,
      findings: Investigation.findings,
      id: Investigation.id,
      messageContent: Message.content,
      messageCreatedAt: Message.createdAt,
      conversationId: Conversation.id,
    })
    .from(Investigation)
    .innerJoin(Feedback, eq(Investigation.feedbackId, Feedback.id))
    .innerJoin(Message, eq(Feedback.messageId, Message.id))
    .innerJoin(Conversation, eq(Message.conversationId, Conversation.id))
    .where(
      and(
        eq(Feedback.workspaceId, options.workspaceId),
        eq(Investigation.status, "approved"),
      ),
    )
    .orderBy(desc(Investigation.createdAt));

  const investigations: InvestigationRecord[] = await Promise.all(
    rows.map(async (row) => {
      const [question] = await db
        .select({ content: Message.content })
        .from(Message)
        .where(
          and(
            eq(Message.conversationId, row.conversationId),
            eq(Message.role, "user"),
            lt(Message.createdAt, row.messageCreatedAt),
          ),
        )
        .orderBy(desc(Message.createdAt))
        .limit(1);
      return {
        completedAt: row.completedAt,
        findings: row.findings,
        id: row.id,
        question: question?.content ?? row.messageContent,
      };
    }),
  );
  const chunks = await db
    .select({
      content: DocumentChunk.content,
      id: DocumentChunk.id,
      label: Document.filename,
      locator: DocumentChunk.locator,
    })
    .from(DocumentChunk)
    .innerJoin(Document, eq(DocumentChunk.documentId, Document.id))
    .where(
      and(
        eq(Document.workspaceId, options.workspaceId),
        isNull(Document.deletedAt),
      ),
    )
    .orderBy(Document.filename, DocumentChunk.ordinal);
  const merged = mergeApprovedInvestigations(
    batch,
    investigations,
    chunks,
    options.userId,
  );
  const report = validatePatternBatch(merged.batch);
  if (!report.passed)
    throw new Error(
      `Merged feedback pack failed quality gates: ${report.issues[0]?.message}`,
    );

  await mkdir(dirname(options.outputPath), { recursive: true });
  const temporaryPath = `${options.outputPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(merged.batch, undefined, 2)}\n`,
      { flag: "wx" },
    );
    await rename(temporaryPath, options.outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return {
    added: merged.additions.length,
    outputPath: options.outputPath,
    skipped: merged.skipped,
    status: "pass" as const,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const workspaceId = process.env.AGENT_WORKSPACE_ID?.trim();
  const userId = process.env.AGENT_OWNER_USER_ID?.trim();
  if (!workspaceId || !userId)
    throw new Error("AGENT_WORKSPACE_ID and AGENT_OWNER_USER_ID are required");
  const inputPath = repositoryPath(
    argument("--input") ?? "examples/tuning/reviewed-patterns.json",
  );
  const outputPath = localPath(
    argument("--output") ?? ".local/tuning/reviewed-with-feedback.json",
  );
  try {
    console.log(
      JSON.stringify(
        await exportApprovedInvestigations({
          inputPath,
          outputPath,
          userId,
          workspaceId,
        }),
        undefined,
        2,
      ),
    );
  } finally {
    await closeDatabasePool();
  }
}
