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

Approval fails closed unless the corrected answer is non-empty, at least one
evidence ID is present, and the answer contains every corresponding
`[evidence:ID]` citation. Rejection may omit training fields.

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

The API validates and reads the active behavior manifest for every authenticated
request, so behavior-prompt promotion is visible without a process restart.
The chat footer shows the current model provider, model ID, and behavior-pack
version. If the manifest is invalid, it explicitly shows a fallback warning and
the server records a redacted diagnostic; it never silently presents the pack
as active. The loader also rejects non-files and manifests larger than 1 MB
before parsing. Weight adapters still require an explicit model-server reload.

Use the chunk UUID shown by the document/chunk APIs in the owner review form;
an empty evidence list is intentionally skipped. The exporter includes only
chunks cited by an accepted correction, not every chunk in the workspace. This
keeps unrelated private source content out of the derived pack.

## Daily loop

Run this after the owner has reviewed new items:

```bash
pnpm tuning:patterns:daily
```

The loop validates citations, duplicate questions/answers, lexical
near-duplicates across splits, repeated sentences, sensitive-looking values,
sensitive-looking cited evidence, semantic-group split isolation, all eight
behavior kinds, all three supported languages, and non-empty validation/test
holdouts.
Every passing pack is first stored as an immutable timestamped release under
`.local/tuning/releases/`, then written atomically to
`.local/tuning/active-behavior-pack.json`. The manifest contains a source hash,
unique version, metrics, training-row count, a train-only behavior prompt, and
(when provided) exact model runtime metadata. The API ignores malformed or
internally inconsistent manifests.

If the reviewed source, compiled prompt, metrics, and model metadata already
match the active immutable release, the command returns `promoted: false` and
does not create a timestamp-only duplicate.

Restore a previously qualified release without rebuilding it:

```bash
pnpm tuning:patterns:rollback -- \
  --release .local/tuning/releases/<version>.json
```

Rollback validates the release manifest and replaces only the active pointer;
the immutable releases remain available for audit and forward recovery.

Before reload or deployment, replay the source-derived integrity checks:

```bash
pnpm tuning:patterns:verify-active -- \
  --source .local/tuning/reviewed-with-feedback.json
```

Omit `--source` when the active pack came from the public reviewed example.

This is scheduled evaluation and behavior-pack promotion, not online learning.
The baseline hot-loads a promoted behavior prompt on the next request. A
weight-trained adapter remains an explicit reload/deploy step. A derived
repository may run this command from a daily cron, GitHub Actions schedule, or
AWS EventBridge/Lambda job after adding its own secret and approval boundaries.

If a gate fails, the command exits non-zero and leaves the previous active pack
untouched. Weight-trained adapters still require a separate trainer, model
reload, evaluation, and base-model rollback implementation.

In local development the API reads this manifest automatically when
`NODE_ENV=development`; set `AGENT_BEHAVIOR_PACK_PATH` to an explicit manifest
in deployed environments. The core runtime also cuts off an exact repeated
sentence loop before the duplicate is persisted.
