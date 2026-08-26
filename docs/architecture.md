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

Official technology documentation is a separate source class. The public
catalog commits only canonical URLs, package identities, version policy, and
exact host allowlists. A local sync job downloads the selected React, Next.js,
tRPC, Drizzle, Zod, Fumadocs, SST, Turborepo, pnpm, and Hono pages into the same
workspace index. Citations retain the canonical URL, and downloaded content is
not committed to the template repository.

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

Every result records only policy-permitted metadata such as the tool name,
observation time, authorization scope, row limit, and row count. Personal
arguments and result values are omitted. These records act as live-data
citations alongside repository citations.

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

The registry and synthetic adapter for these examples are executable and
covered by contract tests. Model tool selection and the real Aurora/tRPC query
composition remain derived-application work; see the
[read-only live capability example](live-capability-example.md).

Every registered capability also declares a data classification, explicit
allow/mask/omit rules for every returned field, an audit-input rule, and a
conversation-or-ephemeral persistence rule. Schema drift fails closed. Exact
personal values must use a separate authorized structured UI outside the model
and conversation history; see the
[privacy and sensitive-data boundary](privacy-sensitive-data.md).

## Model adapters and routing

The domain depends on a model-provider port, not a provider SDK. The baseline
implements OpenAI Responses, Ollama chat/embeddings, and Amazon Bedrock
Converse. Gemini personal credentials and Apple-Silicon MLX/Ornith are derived
extension patterns that require their own packages, tests, and environment
contracts.

Routing profiles select fast, balanced, or deep models based on the question,
retrieval confidence, conflicting evidence, previous failed answers, workspace
data policy, and budget. Provider IDs and prices live in a versioned model
registry rather than domain code.

The completion use case accepts an optional `ModelSelectionPort`. It returns a
concrete `ModelProviderPort` and model metadata for each request, so a derived
repository can route coding questions to a local coding model or sensitive
questions to a guarded provider without changing chat or retrieval code. The
baseline omits the selector and uses the one configured model.

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

An optional scheduled weight-training extension must preserve the source
approval, isolated dataset, held-out gate, atomic promotion, serving reload,
and rollback boundary in
[Reviewed feedback and learning pipeline](reviewed-learning.md). For roughly
100 intermittent users, Bedrock on-demand is the initial production
recommendation; EC2 self-hosting is a separately qualified NVIDIA runtime. See
the [model playbook](model-playbook.md) and the
[sub-USD-100 EC2 budget](ec2-model-budget.md).

## Clean architecture and dependency direction

This template keeps policy independent from delivery frameworks and providers.
The example content slice is intentionally small, but it demonstrates the same
dependency direction expected from production features.

```text
apps/web -> tRPC router -> application use case -> port <- adapter
apps/api ------^                                      <- S3 / OIDC / model provider
apps/batch -> composition -> application use case    <- provider SDKs
```

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain | `packages/*/src/domain` | Business vocabulary and rules with no framework dependencies |
| Application | `packages/*/src/application` | Use cases and outbound ports |
| Adapters | `packages/trpc/src/adaptors`, `packages/db-backbone`, `apps/*/src/adaptors` | Translate object storage, optional databases, identity, and delivery mechanisms into ports |
| Composition | `packages/trpc/src/composition`, `apps/*/composition` | Select concrete adapters and construct use cases |
| Delivery | tRPC routers, Hono routes, Lambda handlers, React views | Validate and translate requests, then call application behavior |

Dependencies point inward. Domain and application code never imports Drizzle,
Hono, tRPC, AWS SDKs, environment loaders, or concrete logging packages.

Application failures use stable framework-neutral codes from `@arlequins/service`.
Delivery adapters map those contracts to tRPC codes or HTTP status responses;
unknown infrastructure errors remain private and are reported as internal errors.

## Workspace Responsibilities

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | Static Next.js App Router output, browser interactions, and client-side tRPC queries |
| `apps/api` | Hono delivery adapter, HTTP policy, health endpoints, local server, and Lambda entry point |
| `apps/batch` | Step Functions and Lambda delivery adapters plus batch composition roots |
| `packages/trpc` | Typed transport contracts, middleware, infrastructure adapters, and request composition |
| `packages/service` | Framework-independent domain models, application ports, and use cases |
| `packages/db-backbone` | Drizzle adapters, PostgreSQL schema, migrations, and seeds |
| `packages/auth` | Authorization policy, session use cases, and OIDC infrastructure adapters |
| `packages/logger` | Structured logging and telemetry adapters |

## Request Flow

1. A Client Component calls the browser-safe `@arlequins/trpc/client` entry point.
2. The client sends a request to `${NEXT_PUBLIC_API_URL}/api/trpc`.
3. Hono applies request IDs, request guards, security headers, and CORS.
4. The tRPC composition root validates the OIDC session and constructs use cases.
5. A router validates input, applies authorization, and calls one use case.
6. The use case reaches external systems only through injected ports.

Client Components must never import the server entry point `@arlequins/trpc`. Use
`@arlequins/trpc/client`, which contains browser-safe constants, error helpers, and
types.

## Feature Workflow

1. Define domain vocabulary without transport or persistence types.
2. Define an application port for every required external effect.
3. Implement and unit test a use case against port doubles.
4. Implement adapters at the infrastructure boundary.
5. Select adapters in a composition root.
6. Add a thin transport handler that validates input and calls the use case.

Run `pnpm architecture:check` after moving files or adding dependencies. The
check is also part of the root test command and rejects common inward dependency
violations.

## Local Development

For the complete local stack, create the local environment file and run:

```bash
cp .env.localhost.example .env.localhost
pnpm dev:local
```

This starts PostgreSQL and runs the local OIDC provider, API, and web app. The
defaults are:

- Web: `http://localhost:3000`
- API: `http://localhost:5000`
- Liveness: `http://localhost:5000/health/live`
- Readiness: `http://localhost:5000/health/ready`
- API explorer: `http://localhost:5000/docs`
- OpenAPI contract: `http://localhost:5000/openapi.json`
- tRPC: `http://localhost:5000/api/trpc`
- PostgreSQL: `localhost:55433`

`API_PORT` changes the local API port. `API_CORS_ORIGINS` accepts a
comma-separated allowlist and defaults to `NEXT_PUBLIC_SITE_URL`.

## Deployment

- `apps/web/sst.config.ts` deploys the static Next.js export to S3 and CloudFront.
- `apps/api/sst.config.ts` selects a Lambda Function URL or API Gateway HTTP API preset.
- Optional VPC variables attach API and batch Lambdas to private resources.

After deploying the API, set `NEXT_PUBLIC_API_URL` to its public URL before
building and deploying the web app.

## Extension Rules

- Add typed application APIs as thin routers in `packages/trpc/src/router`.
- Add ordinary HTTP endpoints as dedicated Hono route modules.
- Put provider implementations in adapter directories and select them in composition roots.
- Keep S3 events immutable and update mutable read models with ETag preconditions.
- Add Drizzle tables under `packages/db-backbone/src/schemas` only for optional relational extensions.
- Centralize environment parsing in `@arlequins/env` and update examples plus `turbo.json`.
- Commit a migration for every schema change and numbered seeds for data changes.
