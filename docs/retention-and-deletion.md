# Retention and deletion foundation

The core package provides bounded retention-policy validation and deterministic
expiry checks. A derived repository should schedule deletion of conversations,
memories, feedback, source snapshots, and tuning exports through its own
authorized repository adapter. Deletion must be auditable, idempotent, and
separate from model invocation; removing a database row cannot undo data already
learned by an unqualified model.
