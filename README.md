# template-knowledge-agent

An AWS-first template for evidence-grounded chat over Fumadocs documentation,
T3 monorepos, and approved live application data.

The project will expose three delivery surfaces backed by one conversation and
knowledge core:

- a small Google-authenticated chat application with conversation history;
- an embeddable chat widget for approved websites; and
- a remote MCP server for other applications and AI clients.

## Design priorities

- Start with TypeScript and T3 monorepos; add legacy-language analyzers through
  stable plugin contracts after the primary path is reliable.
- Keep model providers replaceable through clean architecture adapters. Amazon
  Bedrock is the intended production default, with Anthropic and Gemini
  adapters available by policy.
- Keep answers grounded in repository snapshots, source locations, and live
  tool results.
- Use Aurora PostgreSQL, PostgreSQL full-text search, and optional S3 Vectors;
  do not require OpenSearch.
- Read changing business data through allowlisted, read-only tRPC tools rather
  than generated SQL or page scraping.
- Improve retrieval and answer quality through replayable daily evaluations,
  not real-time fine-tuning.

## Current status

The repository is in architecture and governance bootstrap. Implementation will
begin with a T3/Fumadocs vertical slice before additional language analyzers are
added.

See [the architecture](docs/architecture.md) and [the roadmap](docs/roadmap.md).

## Releases

Releases follow [Semantic Versioning](https://semver.org/) and are automated by
Release Please from Conventional Commits:

- `fix:` creates a patch release;
- `feat:` creates a minor release;
- `feat!:` or a `BREAKING CHANGE:` footer creates a major release; and
- `docs:`, `test:`, `refactor:`, and `chore:` do not independently request a
  version bump.

Release Please maintains a release pull request. Merging that reviewed pull
request publishes the tag, changelog, and GitHub release.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Direct
changes to `main` are not part of the normal workflow.
