# Read-only live capability example

Static repository indexing cannot answer “what is the newest notice?” or
“which vehicles sold this week?” reliably. This template therefore includes an
executable capability registry and a fake Aurora/tRPC-shaped adapter for:

- `notices.listRecent`; and
- `vehicles.listSold`; and
- `customers.lookupMaskedContact`.

The shared contract is in
[`packages/agent-core/src/live-capability.ts`](../packages/agent-core/src/live-capability.ts).
The public adapter and tests are in
[`packages/trpc/src/adaptors/example-live-capabilities.ts`](../packages/trpc/src/adaptors/example-live-capabilities.ts).

Each execution validates typed input, carries the authenticated actor, applies
tenant and permission filters, caps returned rows, emits a live-data citation,
enforces an explicit allow/mask/omit field policy, and records audit metadata
without copying result rows into the audit event.
Vehicle access also demonstrates record-level permission filtering and a
half-open date range: `soldFrom <= soldAt < soldTo`.

The customer example uses only fake data. It masks all personal identifiers,
omits the internal note, omits the lookup input from audit metadata, and marks
the result `ephemeral`. The persistence guard rejects that result if a future
tool loop tries to store it in a conversation, memory, feedback, evaluation, or
tuning record. Exact personal data belongs in a separately authorized,
non-model structured UI; see the
[privacy and sensitive-data boundary](privacy-sensitive-data.md).

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
5. persist the capability name, policy-permitted sanitized inputs, actor, time,
   row count, and live citation, but never persist an ephemeral result; and
6. reject results that fail authorization, schema validation, or output policy.

This release does **not** automatically let the chat model invoke these
capabilities. The registry is the tested boundary for a derived repository;
the model tool-selection loop, approval policy, and application-specific tRPC
composition must be added and evaluated there.
