# Agent operations

Run the read-only readiness check from a trusted operator environment:

```bash
pnpm agent:readiness --api-url https://api.example.com
```

The check validates process liveness and S3-backed readiness. Do not use liveness
alone to declare the service healthy.

For a local run, check both liveness and readiness. A web page returning 200 is
not sufficient when the API process is absent:

```bash
curl http://localhost:5000/health/live
curl http://localhost:5000/health/ready
pnpm agent:readiness --api-url http://localhost:5000
```

## Alert policy

| Signal | Warning | Urgent action |
| --- | --- | --- |
| `/health/ready` | One failed scheduled check | Three consecutive failures or five minutes unavailable |
| API 5xx rate | Above 1% for ten minutes | Above 5% for five minutes |
| Evaluation or indexing | Any failed run | Repeated failures; pause activation and inspect audit events |
| Workspace usage | 80% of product quota | 100%; reject new writes with a clear product error |
| Release checksum | Any mismatch | Stop release activation and restore a known-good head |
| Model candidate | Any held-out failure or repetition | Do not promote; retain the known-good provider/model |

## Recovery

1. Verify the active release manifest and snapshot checksum.
2. Conditionally point the active head to a known-good release.
3. Rebuild damaged read models from immutable objects and events.
4. Restore an older versioned object as a new current version.
5. Re-run evaluation before activating another release.

Do not overwrite a live state object without an ETag precondition. S3 Versioning
inside one bucket is not an independent backup; add a separate backup bucket or
cross-region replication only when recovery objectives justify the cost.

Derived weight-training profiles also need model-process reload and rollback
checks from [Reviewed feedback and learning pipeline](reviewed-learning.md).

Pipeline failures use the injectable `PipelineFailureNotifier` described in the
[MCP server contract](mcp-server.md). Keep the default structured warning in
development; configure SNS, Slack, PagerDuty, or an internal sink only in a
protected deployment. Alerts are recursively redacted before leaving the
process, and notifier errors should remain retryable.
