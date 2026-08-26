# Remote MCP server contract

The API exposes `POST /mcp` as a guarded extension point for derived
repositories. The template intentionally returns `404 MCP Not Configured`
until the application injects a concrete `McpServer`; this prevents a new
deployment from accidentally exposing tools with no authorization policy.

## Request flow

1. The HTTP adapter validates the JSON-RPC envelope and parses the request
   context from the authenticated session.
2. A bearer/OIDC session is required. Unauthenticated requests receive `401`
   and `WWW-Authenticate: Bearer`.
3. The injected server handles `initialize`, `tools/list`, and `tools/call`.
4. Every tool performs its own authorization check using the user id, roles,
   and request headers. A tool must enforce tenant scope and read/write policy.
5. Tool failures return a generic JSON-RPC error; stack traces and provider
   secrets never cross the HTTP boundary.

The core contract is transport-neutral, so a derived repository can mount the
same server behind another gateway or an MCP-compatible stream transport.

## Tool rules

- Register only typed, bounded capabilities. Never expose arbitrary SQL,
  filesystem access, shell execution, or a generic HTTP proxy.
- Return provenance and row limits for live-data tools so the chat layer can
  cite the observation without copying personal arguments into audit logs.
- Add an authorization and prompt-injection fixture for every new tool.
- Configure real OAuth/OIDC issuer, audience, and key rotation in the derived
  repository. The template's local OIDC mock is for tests only.

See [architecture](architecture.md), [authentication](authentication.md), and
[privacy and sensitive data](privacy-sensitive-data.md) for the surrounding
contracts.

## Failure notifications

Batch pipelines call an injectable `PipelineFailureNotifier`. The default is a
structured warning; production adapters can publish the redacted alert to SNS,
Slack, PagerDuty, or an internal incident API. The adapter receives a bounded
payload with `batchId`, `occurredAt`, and a recursively redacted error event.
Notifier failures are allowed to propagate so the Lambda can be retried or
handled by its configured dead-letter policy.
