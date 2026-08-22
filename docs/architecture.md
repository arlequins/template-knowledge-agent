# Architecture

## Product surfaces

One application core serves three entry points:

1. a Google-authenticated standalone chat with conversation history;
2. an origin-allowlisted embedded widget; and
3. an OAuth-protected remote MCP server.

All entry points share identity, authorization, conversations, retrieval,
citations, model routing, usage accounting, and evaluation contracts.

## Two knowledge planes

The agent intentionally separates relatively static engineering knowledge from
changing business data.

### Engineering knowledge plane

This plane answers questions such as:

- Where is vehicle pricing calculated?
- Which tRPC procedure supplies this page?
- What table and column back this response field?
- Which package owns Google authentication?

Inputs are immutable repository snapshots of Fumadocs Markdown/MDX and source
code. Ingestion emits normalized knowledge units, edges, and citations.

### Live application data plane

This plane answers questions such as:

- Are there any new announcements?
- Which vehicles were sold during the last seven days?
- How many pending applications exist today?

The model does not browse the page and does not issue arbitrary SQL. It selects
an allowlisted, typed, read-only application tool. The preferred implementation
calls an existing tRPC procedure through an internal adapter while preserving
the user's tenant and authorization context.

If an appropriate read-only procedure does not exist, the application adds one
through its normal review and deployment process. Direct model access to the
production Aurora schema is not a fallback.

Every result records the tool name, normalized arguments, observation time,
authorization scope, row limit, and safe result identifiers. These records act
as live-data citations alongside repository citations.

## T3-first analyzer

The first certified analyzer targets pnpm/Turborepo TypeScript systems and
understands:

- Fumadocs collections, frontmatter, headings, includes, and references;
- Next.js App Router pages, layouts, route handlers, and server actions;
- tRPC routers, procedures, middleware, inputs, outputs, and call sites;
- Zod schemas;
- Drizzle or Prisma schemas and migrations;
- React components and important data hooks;
- SST/AWS resources and environment declarations; and
- workspace package and import relationships.

TypeScript compiler semantics are preferred for symbols and references. A
syntax parser may provide a safe partial result when a project cannot be fully
type-checked.

## Analyzer plugin boundary

Legacy-language support is an extension, not a requirement for the first
vertical slice. The core consumes one normalized intermediate representation:

```text
KnowledgeUnit
  document | section | symbol | route | procedure | data-model | config | test

KnowledgeEdge
  imports | calls | renders | exposes | validates | reads | writes | documents

RuntimeCapability
  name | description | input-schema | output-schema | authorization | source
```

An analyzer plugin implements four operations:

```text
detect(workspace) -> confidence and project roots
plan(snapshot) -> bounded files and toolchain requirements
extract(snapshot) -> language-native facts
normalize(facts) -> common knowledge units and edges
```

Candidate future plugins include:

- Java: Maven/Gradle, Spring routes, JPA entities, and language symbols;
- Ruby: Bundler/Rails routes, controllers, Active Record, and language symbols;
- C#: solution/project files, ASP.NET endpoints, Entity Framework, and Roslyn
  symbols.

Plugins run in isolated batch jobs. They do not execute repository lifecycle
scripts by default. A plugin is experimental until it passes shared provenance,
incremental-update, malformed-project, and authorization fixtures.

## Retrieval without OpenSearch

OpenSearch is not a required component.

The default AWS profile uses:

- versioned S3 objects for repository snapshots and extraction artifacts;
- Aurora PostgreSQL in a dedicated knowledge schema for metadata, exact symbol
  lookup, relationships, and PostgreSQL full-text search; and
- optional S3 Vectors for semantic retrieval when enabled.

The knowledge schema uses a separate database role and migration history from
the application's business schema. Retrieval workload limits protect the live
application database. Installations that should not share the application
cluster can point the same port at a separate Aurora database without changing
the domain.

Hybrid retrieval combines exact identifiers, PostgreSQL full-text ranking,
semantic candidates, and graph expansion. A reranker is optional and invoked
only after authorization filters have been applied.

## Live tRPC capability catalog

Static analysis discovers tRPC procedures, schemas, and page call sites, but
discovery alone does not make a procedure callable by the agent. Production
tools are registered explicitly:

```text
notices.listRecent
  read-only: true
  maximum rows: 20
  authorization: current user's tenant

vehicles.listSold
  read-only: true
  input: { soldFrom, soldTo, cursor?, limit? }
  maximum rows: 100
  authorization: current user's tenant and vehicle scope
```

For a request such as "show vehicles sold in the last seven days", the tool
layer resolves the time range in the user's timezone, validates it with the
procedure schema, applies a hard row limit, calls the reviewed tRPC client, and
returns a structured result. The model formats that result but cannot expand
the query or authorization scope.

## Model adapters and routing

The domain depends on `ChatModelPort`, not a provider SDK. Planned adapters are:

- Amazon Bedrock Converse for production;
- Anthropic Messages for initial development or approved fallback; and
- Gemini for centrally funded or user-provided API credentials.

Routing profiles select fast, balanced, or deep models based on the question,
retrieval confidence, conflicting evidence, previous failed answers, workspace
data policy, and budget. Provider IDs and prices live in a versioned model
registry rather than domain code.

Recent messages, a rolling conversation summary, unresolved questions, and
prior answer fingerprints are supplied to the runtime. Final answers are not
shared-cached. A similarity guard can request one regeneration when a new
question receives a substantially repeated answer without new evidence.

## Daily improvement loop

Questions, retrieved evidence, tool calls, answers, citations, reactions,
provider usage, and cost are replayable. A daily batch job:

1. ingests changed repository snapshots;
2. groups retrieval failures and repeated answers;
3. proposes evaluation cases only after source verification;
4. compares retrieval, prompt, and routing candidates;
5. rejects candidates with authorization, citation, quality, cost, or latency
   regressions; and
6. promotes a versioned configuration after the configured approval gate.

User reactions are signals, not facts. Real-time fine-tuning is outside the
initial scope.

