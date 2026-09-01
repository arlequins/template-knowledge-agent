# Retention and deletion foundation

The core package provides bounded retention-policy validation and deterministic
expiry checks. A derived repository should schedule deletion of conversations,
memories, feedback, source snapshots, and tuning exports through its own
authorized repository adapter. Deletion must be auditable, idempotent, and
separate from model invocation; removing a database row cannot undo data already
learned by an unqualified model.

Exact personal-data sources have an additional application-level contract in
`@arlequins/agent-core`. Before enabling one, the derived repository must pass
`authorizeExactPersonalDataSource` with a bounded retention policy, a short
bounded UI-cache period, and an implemented `ExactPersonalDataDeletionPort`.
It also requires an injected approval identity/evidence verifier and returns
an immutable registration descriptor; the source-registration boundary should
consume that descriptor rather than re-read mutable readiness configuration.
The port is provider-neutral so the repository can connect its own authorized
database, object-store, or record-management workflow. The readiness validator
also requires a current access review and dated privacy-owner acceptance, and
fails closed when any evidence is missing or expired. Its deletion request
includes an authenticated tenant/workspace actor and an explicit purpose. The
derived repository must prove idempotency, auditability, deletion propagation,
and model-allowlist exclusion in integration tests. The template supplies no
default contract and therefore enables no exact personal-data source.
