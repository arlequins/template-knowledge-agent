# Roadmap

## Phase 0: repository and contracts

- Repository governance, automated SemVer releases, and architecture records.
- Shared schemas for users, conversations, citations, knowledge units, analyzer
  plugins, model providers, live tools, usage, and evaluations.
- Small Fumadocs and T3 fixtures with initial gold questions.

## Phase 1: T3 vertical slice

- Google-authenticated standalone chat and conversation history.
- Fumadocs and TypeScript/T3 ingestion with commit, file, symbol, and line
  provenance.
- Retrieval through PostgreSQL full-text search and optional S3 Vectors.
- Bedrock/Anthropic model adapters and grounded streaming answers.

## Phase 2: embedded chat and MCP

- Origin-allowlisted iframe widget with popup authentication.
- Remote MCP endpoint with scoped OAuth authorization.
- Shared conversation history across web, widget, and MCP channels.

## Phase 3: live business data

- Explicit read-only tRPC capability registry.
- Typed tool execution with user/tenant authorization, bounded results, audit
  records, and live-data citations.
- Initial announcement and recently sold vehicle query fixtures.

## Phase 4: evaluation and scale

- Daily replay, verified gold cases, provider routing, cost budgets, repetition
  checks, and guarded configuration promotion.
- Incremental indexing and operational limits for larger monorepos.

## Phase 5: legacy analyzers

- Add one language at a time, selected from real demand.
- Begin with project detection and symbol/route/data-model extraction; avoid a
  universal parser framework until the T3 contract has proved stable.
- Candidates are Java/Spring, Ruby/Rails, and C#/ASP.NET.

