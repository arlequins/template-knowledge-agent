# Security policy

## Reporting

Please use GitHub private vulnerability reporting for security issues. Do not
open a public issue containing credentials, private source code, production
data, or reproduction material that exposes another user's information.

## Security boundaries

- Google email is profile data; identity is keyed by the issuer and immutable
  subject identifier.
- Credentials are server-side only and must not be committed, logged, embedded
  in widget configuration, or returned to MCP clients.
- Knowledge retrieval is filtered by workspace and repository authorization
  before content is returned to a model.
- Live application data is accessed only through reviewed read-only tools with
  the caller's authorization context.
- Provider fallback is permitted only when the workspace policy allows data to
  be sent to that provider.
- AWS deployment uses GitHub Actions OIDC and protected environments. Long-lived
  AWS credentials are not accepted.
