# Embedded chat contract

Derived repositories may expose a compact `/embed` iframe using the same
workspace-scoped chat as the standalone application. Require an exact,
server-configured parent-origin allowlist and keep API bearer authentication,
workspace membership, CORS, rate limits, and audit logging enabled.

The template intentionally does not implement a cross-origin token handoff.
Add a top-level popup callback only with an exact `targetOrigin`, state/nonce
validation, a short-lived one-time code, replay protection, and an audit event.
Never put an access token in an unvalidated `postMessage`. See the [privacy
boundary](privacy-sensitive-data.md) before enabling business data.

See [한국어](embedded-widget.ko.md) and [日本語](embedded-widget.ja.md).
