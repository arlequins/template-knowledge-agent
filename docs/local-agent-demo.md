# Local knowledge-agent demo

The local pilot uses Docker PostgreSQL for conversations and knowledge, the
included OIDC mock for sign-in, and OpenAI for chat and embeddings.

```bash
pnpm install
pnpm agent:setup
# Put OPENAI_API_KEY in the ignored .env.localhost file.
pnpm dev:local
```

Open `http://localhost:3000` and sign in as `local-user`. The repeatable CLI
bootstrap can create the matching workspace before or after the app starts:

```bash
pnpm knowledge:bootstrap
pnpm knowledge:index -- \
  --source /absolute/path/to/an/approved/repository \
  --workspace-id <workspace-uuid>
pnpm knowledge:sync-official -- \
  --sources react,drizzle \
  --workspace-id <workspace-uuid>
```

The workspace ID is shown in the UI's operations section and by the bootstrap
command. The repository indexer ignores symlinks, dependencies, build outputs,
Git metadata, and private local directories. It never executes scripts from the
target repository.

Verify three question classes:

1. project documentation: ask about a rule present in an indexed MDX file;
2. source code: ask which route, procedure, or schema owns a behavior; and
3. stack documentation: ask a React or Drizzle question supported by an
   allowlisted official page.

Each supported answer should show citations. A question about a current notice
or sold vehicle must decline unless the corresponding approved live capability
is configured.

Run `pnpm agent:readiness --api-url http://localhost:5000` for a final health
check. `pnpm db:stop` stops the local database while preserving its Docker
volume.
