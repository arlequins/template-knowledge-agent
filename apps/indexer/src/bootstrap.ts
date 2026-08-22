import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { closeDatabasePool, db } from "@arlequins/db-backbone/client";
import { Workspace, WorkspaceMember } from "@arlequins/db-backbone/schema";
import { eq } from "drizzle-orm";

function stableUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const commandArguments = process.argv.slice(2);
while (commandArguments[0] === "--") commandArguments.shift();
const { values } = parseArgs({
  args: commandArguments,
  options: {
    issuer: { default: "http://localhost:5556", type: "string" },
    name: { default: "Local Knowledge", type: "string" },
    slug: { default: "local-knowledge", type: "string" },
    subject: { default: "local-user", type: "string" },
  },
  strict: true,
});
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug))
  throw new Error(
    "--slug must contain lowercase letters, numbers, and hyphens",
  );

try {
  const userId = stableUuid(`${values.issuer}|${values.subject}`);
  const workspace = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(Workspace)
      .where(eq(Workspace.slug, values.slug))
      .limit(1);
    const row =
      existing ??
      (
        await tx
          .insert(Workspace)
          .values({ name: values.name, slug: values.slug })
          .returning()
      )[0];
    if (!row) throw new Error("Could not create the local workspace");
    await tx
      .insert(WorkspaceMember)
      .values({ role: "owner", userId, workspaceId: row.id })
      .onConflictDoUpdate({
        target: [WorkspaceMember.workspaceId, WorkspaceMember.userId],
        set: { role: "owner" },
      });
    return row;
  });
  console.log(
    JSON.stringify(
      {
        loginSubject: values.subject,
        userId,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      },
      null,
      2,
    ),
  );
} finally {
  await closeDatabasePool();
}
