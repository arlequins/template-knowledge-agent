# Owner review workbench and daily promotion

The template records `needs-investigation` feedback as a workspace-scoped
investigation. The owner can review the original assistant message, record a
concise corrected answer and resolution, and approve or reject the item. The
API never exposes hidden chain-of-thought; only the final message, evidence
identifiers, and an audit-safe review record are retained.

## API contract

- `agent.investigations` — owner-only, workspace-scoped queue (`queued` by
  default; at most 100 records).
- `agent.reviewInvestigation` — owner-only approval or rejection. The payload
  accepts `correctedAnswer`, `evidenceIds`, `requiredTerms`,
  `forbiddenClaims`, and a short `resolution`.

The database and S3 repository adapters implement the same contract. Every
mutation checks workspace ownership and writes an immutable audit event. Do not
put source content, secrets, or personal data in audit metadata.

## Export approved investigations

An approved investigation is not training data until the owner supplies a
corrected answer and at least one document-chunk ID from the same workspace.
The exporter reads only `approved` investigations, re-derives the original
question from the conversation, joins authorized document chunks, rejects
missing or duplicate evidence, and writes a reviewed batch under `.local/`:

```bash
AGENT_WORKSPACE_ID=<workspace-uuid> \
AGENT_OWNER_USER_ID=<owner-user-uuid> \
pnpm tuning:patterns:export-approved
```

The command reports `added` and `skipped` records. It never mutates the public
example pack. Feed the derived pack into the normal promotion gate:

```bash
pnpm tuning:patterns:daily -- \
  --input .local/tuning/reviewed-with-feedback.json
```

For the scheduled job, use the combined command. It performs both operations
in order and closes the database pool when finished:

```bash
AGENT_WORKSPACE_ID=<workspace-uuid> \
AGENT_OWNER_USER_ID=<owner-user-uuid> \
pnpm tuning:patterns:daily:with-feedback -- \
  --provider ollama \
  --model qwen2.5:3b \
  --runtime ollama \
  --quantization q4_K_M
```

The model flags are optional, but when supplied they record the exact provider,
model ID, runtime, and quantization in the active manifest. This makes daily
quality results reproducible and keeps a Bedrock, hosted, or local candidate
from being confused with another model that happens to have the same nickname.

Only the final manifest is consumed by the running API; a derived deployment
must explicitly reload or deploy it after this command succeeds.

Use the chunk UUID shown by the document/chunk APIs in the owner review form;
an empty evidence list is intentionally skipped. This keeps private source
content in the local database while only reviewed, citation-backed behavior
enters the daily pack.

## Daily loop

Run this after the owner has reviewed new items:

```bash
pnpm tuning:patterns:daily
```

The loop validates citations, duplicate questions/answers, repeated sentences,
sensitive-looking values, semantic-group split isolation, all eight behavior
kinds, all three supported languages, and non-empty validation/test holdouts.
Only a passing reviewed pack is written atomically to
`.local/tuning/active-behavior-pack.json`. The manifest contains a source hash,
version, metrics, training-row count, a train-only behavior prompt, and (when
provided) exact model runtime metadata.

This is scheduled evaluation and behavior-pack promotion, not online learning.
Loading a promoted prompt or adapter into a running server remains an explicit
reload/deploy step. A derived repository may run this command from a daily
cron, GitHub Actions schedule, or AWS EventBridge/Lambda job after adding its
own secret and approval boundaries.

If a gate fails, the command exits non-zero and leaves the previous active pack
untouched. Keep the prior manifest and base model available for rollback.

In local development the API reads this manifest automatically when
`NODE_ENV=development`; set `AGENT_BEHAVIOR_PACK_PATH` to an explicit manifest
in deployed environments. The core runtime also cuts off an exact repeated
sentence loop before the duplicate is persisted.
