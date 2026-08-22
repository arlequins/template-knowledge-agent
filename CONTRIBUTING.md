# Contributing

## Workflow

1. Create a branch from the latest `main`.
2. Keep the change focused and preserve unrelated work.
3. Use Conventional Commits.
4. Open a pull request and complete the verification checklist.
5. Merge with squash after required checks and conversations are complete.

Use the `feature/` prefix for feature branches by default.

## Commit format

```text
<type>(optional-scope): <description>
```

Common types are `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, and
`chore`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

Examples:

```text
feat(retrieval): add TypeScript symbol lookup
fix(auth): retain the Google subject identifier
docs: explain the live data tool boundary
```

## Architecture constraints

- Domain packages must not import AWS, database, HTTP, UI, or provider SDKs.
- Model, retrieval, analyzer, credential, and live-data integrations implement
  explicit ports.
- A model must never generate or execute arbitrary SQL against application
  data.
- Live business-data tools are allowlisted, read-only, bounded, authorized, and
  audited.
- Repository ingestion treats source files and build scripts as untrusted.
- New analyzer plugins must emit the common knowledge model and pass contract
  fixtures before they can be enabled in production.

## Release behavior

Release Please derives SemVer changes from commits merged to `main`. Do not edit
`version.txt`, `.release-please-manifest.json`, or generated changelog entries by
hand outside a release bootstrap or recovery.
