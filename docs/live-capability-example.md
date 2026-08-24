# Read-only live capability example

Static repository indexing cannot answer “what is the newest notice?” or
“which vehicles sold this week?” reliably. This template therefore includes an
executable capability registry and a fake Aurora/tRPC-shaped adapter for:

- `notices.listRecent`; and
- `vehicles.listSold`.

The shared contract is in
[`packages/agent-core/src/live-capability.ts`](../packages/agent-core/src/live-capability.ts).
The public adapter and tests are in
[`packages/trpc/src/adaptors/example-live-capabilities.ts`](../packages/trpc/src/adaptors/example-live-capabilities.ts).

Each execution validates typed input, carries the authenticated actor, applies
tenant and permission filters, caps returned rows, emits a live-data citation,
and records audit metadata without copying result rows into the audit event.
Vehicle access also demonstrates record-level permission filtering and a
half-open date range: `soldFrom <= soldAt < soldTo`.

## Derived Aurora/tRPC implementation

Replace only the fake array reads with application queries that already enforce
the same domain authorization. Prefer an application query service behind a
tRPC procedure; do not give the model database credentials or generate SQL
from natural language.

The application composition root must:

1. map the verified login session to `userId`, `tenantId`, `workspaceId`, and
   permissions;
2. expose only an explicit capability allowlist to the model/tool router;
3. parse and bound dates, identifiers, pagination, and row limits;
4. execute through a read-only database identity or transaction;
5. persist the capability name, sanitized inputs, actor, time, row count, and
   live citation; and
6. reject results that fail authorization, schema validation, or output policy.

This release does **not** automatically let the chat model invoke these
capabilities. The registry is the tested boundary for a derived repository;
the model tool-selection loop, approval policy, and application-specific tRPC
composition must be added and evaluated there.
