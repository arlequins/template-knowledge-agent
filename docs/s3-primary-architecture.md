# S3-primary agent persistence

## Decision

The template uses S3 as the default source of truth for agent conversations,
memory, documents, citations, feedback, and reviewed knowledge releases.
PostgreSQL remains available as an optional extension workspace, but it is not
required by the default API or local agent path.

S3 is not treated as a relational database. Objects have three roles:

1. `events/`: append-only change records.
2. `state/`: entity-oriented read models used by APIs.
3. `releases/`: immutable, reviewed snapshots of approved memory and knowledge.

Only small `heads/` objects are mutable pointers. S3 Versioning preserves prior
values, and every mutable write uses an ETag precondition.

## Object layout

```text
identities/{derivedUserId}/workspaces/{workspaceId}.json
identities/{derivedUserId}/heads/active-job.json

workspaces/{workspaceId}/workspace.json
workspaces/{workspaceId}/events/{epochMillis}-{eventId}.json
workspaces/{workspaceId}/state/members/{userId}.json
workspaces/{workspaceId}/state/conversations/{conversationId}.json
workspaces/{workspaceId}/state/messages/{conversationId}/{messageId}.json
workspaces/{workspaceId}/state/documents/{documentId}.json
workspaces/{workspaceId}/state/chunks/{documentId}/{chunkId}.json
workspaces/{workspaceId}/state/citations/{messageId}/{ordinal}-{chunkId}.json
workspaces/{workspaceId}/state/memories/{memoryId}.json
workspaces/{workspaceId}/state/feedback/{feedbackId}.json
workspaces/{workspaceId}/state/investigations/{investigationId}.json
workspaces/{workspaceId}/state/evaluation-cases/{caseId}.json
workspaces/{workspaceId}/state/evaluation-runs/{runId}.json

workspaces/{workspaceId}/blobs/sha256/{contentHash}.json
workspaces/{workspaceId}/releases/{releaseId}/snapshot.json
workspaces/{workspaceId}/releases/{releaseId}/manifest.json
workspaces/{workspaceId}/heads/active-release.json
```

## Write and concurrency rules

- Create new objects with `If-None-Match: *`.
- Replace read models and heads with the ETag from the last read via `If-Match`.
- Re-read and retry conflicts a bounded number of times.
- Record changes under unique event keys; never overwrite an event.
- Represent deletion with a `deletedAt` tombstone.
- Do not grant the application runtime `DeleteObjectVersion`.

S3 does not provide multi-object transactions. The repository updates the
entity read model first and then writes the audit event. A reconciliation tool
should compare state and events during operational recovery.

A per-user lease at `identities/{userId}/heads/active-job.json` serializes work.
Concurrent requests receive HTTP 409 with `estimatedCompletionAt`. Leases
expire after interruption and are released in `finally` on normal or failed
completion.

## Reviewed releases

New data does not immediately change the active retrieval set:

1. Read approved memory and live document chunks.
2. Require a completed evaluation meeting the configured citation-recall gate.
3. Create a new immutable snapshot and checksum manifest.
4. Move the active-release head with a conditional write only after both exist.

Requests continue reading the previous release while a new snapshot is built.
Citations retain the release ID used when the answer was generated.

## AWS and cost controls

The SST API stack creates a private, versioned S3 bucket with public access
blocked, SSE-S3 encryption, TLS-only access, conditional-write enforcement, and
lifecycle cleanup for old mutable-object versions. Lambda receives only scoped
list/read/write permissions. Bedrock permissions are absent unless an exact
model ARN is configured.

The default stack does not require Aurora, RDS, a NAT Gateway, ECS, or any
always-on compute service. MinIO provides the local S3-compatible implementation.

## Recovery

1. Verify the active release manifest and snapshot checksum.
2. Conditionally point the head to a known-good release.
3. Rebuild damaged read models from immutable entity objects and events.
4. Restore a previous versioned object by copying it to a new current version.
5. Re-run evaluation before activating another release.

Versioning in the same bucket is not an independent backup. Add a separate
backup bucket or cross-region replication only after recovery requirements and
costs justify it.
