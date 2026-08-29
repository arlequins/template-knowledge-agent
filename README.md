# template-knowledge-agent

An AWS-ready, provider-neutral template for evidence-grounded chat over
Fumadocs documentation, T3 monorepos, approved live application data, and
eventually legacy codebases.

The same conversation and knowledge core serves three delivery surfaces:

- a Google-authenticated chat application with conversation history;
- an origin-allowlisted embedded chat widget; and
- an OAuth-protected remote MCP server.

The first runnable profile is intentionally local: PostgreSQL stores
conversations and indexed knowledge, while OpenAI provides chat completions and
embeddings. Real documents, source snapshots, database exports, evaluation
questions, and API keys belong in ignored local paths and are never part of the
public template.

## Design priorities

- Start with TypeScript, T3, and Fumadocs; add Java, Ruby, and C# through stable
  analyzer plugin contracts after the primary path is reliable.
- Keep model providers replaceable through clean-architecture adapters. OpenAI
  is the first hosted adapter; Amazon Bedrock is the intended AWS production
  adapter, with Anthropic and Gemini available by policy.
- Ground answers in repository locations, source excerpts, and live tool
  results. If the available evidence is insufficient, say so.
- Use PostgreSQL full-text and vector retrieval; OpenSearch is not required.
- Read changing business data through allowlisted, read-only tRPC tools rather
  than generated SQL or page scraping.
- Improve quality through replayable daily evaluations. Optional weight
  training requires source-reviewed examples, disjoint held-out data, guarded
  promotion, explicit reload, and rollback; it is never real-time.
- Organize new business behavior as independent Feature-Sliced Design slices;
  the generator and architecture check enforce the dependency direction.

## Stack

| Area | Technology |
| --- | --- |
| Workspace | pnpm catalogs, Turborepo, TypeScript, Biome |
| Web | Next.js App Router, React, Tailwind CSS |
| API | Hono and tRPC, local Node.js server, optional AWS Lambda |
| Local persistence | PostgreSQL with Drizzle migrations |
| Model boundary | Provider-neutral agent core with OpenAI, Bedrock, and Ollama adapters |
| Authentication | Local OIDC mock; Google-compatible OIDC configuration |
| Testing | Vitest, PostgreSQL integration tests, Playwright, accessibility checks |

## Local pilot

Requirements are Node.js and pnpm versions matching `package.json`, Docker, and
an OpenAI API key. Start from the checked-in examples; do not commit the local
environment file.

```bash
pnpm install
pnpm agent:setup
# Add OPENAI_API_KEY to .env.localhost
pnpm db:start
pnpm db:setup
pnpm knowledge:bootstrap
pnpm knowledge:index -- --source /absolute/path/to/your/repository --workspace-id <uuid-from-ui>
pnpm knowledge:sync-official -- --workspace-id <uuid-from-ui>
pnpm dev:local
```

Open `http://localhost:3000`. The local identity provider accepts any non-empty
username and password. The API is available at `http://localhost:5000`, with
liveness at `/health/live`, readiness at `/health/ready`, and tRPC at
`/api/trpc`.

The public example corpus lives under `examples/knowledge`. Private material is
loaded from ignored `.local/` paths or an explicitly supplied absolute source
path. The indexer reads files; it does not run repository lifecycle scripts.
The official documentation catalog in `config/official-knowledge-sources.json`
contains only public canonical URLs and host allowlists; downloaded text and
embeddings stay in the local database.

Before using private material, create a separate repository with
`pnpm template:create`; the complete flow is in
[Create a derived repository](docs/create-derived-repository.md). The synthetic
T3/Fumadocs acceptance corpus under `examples/pilot` can be checked with
`pnpm pilot:verify`.

## Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:local` | Start the local database, identity provider, API, and web app. |
| `pnpm agent:setup` | Create `.env.localhost` without overwriting existing values. |
| `pnpm knowledge:index` | Index an approved document or source tree. |
| `pnpm knowledge:bootstrap` | Create the repeatable local test workspace. |
| `pnpm knowledge:sync-official` | Index allowlisted official stack documentation. |
| `pnpm template:create` | Copy tracked public files into and initialize a separate repository. |
| `pnpm derived:qualify` | Run the deterministic generated-repository qualification gate; add `--full` for the complete suite. |
| `pnpm pilot:verify` | Verify the synthetic T3/Fumadocs, live-data, and refusal cases. |
| `pnpm tuning:patterns:verify` | Verify the public reviewed document-QA behavior pack and held-out isolation. |
| `pnpm tuning:patterns:generate` | Generate private structured candidates with Luna under `.local/`. |
| `pnpm tuning:patterns:daily` | Validate and atomically promote the reviewed behavior pack under `.local/`. |
| `pnpm check` | Run Biome formatting and lint checks. |
| `pnpm architecture:check` | Verify clean-architecture and feature-slice boundaries. |
| `pnpm typecheck` | Typecheck every workspace. |
| `pnpm test` | Run unit and contract tests. |
| `pnpm test:integration` | Test PostgreSQL-backed repositories. |
| `pnpm test:e2e` | Run the browser flow. |

## Architecture and operations

Start with the **[privacy and sensitive-data boundary](docs/privacy-sensitive-data.md)**
([한국어](docs/privacy-sensitive-data.ko.md) ·
[日本語](docs/privacy-sensitive-data.ja.md)), the
**[EC2 model and tuning budget](docs/ec2-model-budget.md)**
([한국어](docs/ec2-model-budget.ko.md) ·
[日本語](docs/ec2-model-budget.ja.md)), [the product
architecture](docs/architecture.md), [the delivery roadmap](docs/roadmap.md),
and [the documentation index](docs/README.md).
New feature placement is defined by [Feature-Sliced Clean Architecture](docs/conventions/feature-sliced-design.md)
([한국어](docs/conventions/feature-sliced-design.ko.md) ·
[日本語](docs/conventions/feature-sliced-design.ja.md)).
Deployment-specific controls are documented in
[deployment security](docs/deployment-security.md). AWS deployments use GitHub
Actions with OIDC; no long-lived AWS credential belongs in this repository.
The [reviewed learning contract](docs/reviewed-learning.md) explains how a
derived app can safely add scheduled LoRA, while the
[model playbook](docs/model-playbook.md) covers provider, EC2, and Bedrock
choices. The EC2 guide gives a Tokyo-region price snapshot, sub-USD-100 options
with RDS excluded, an initial light-use conversational target, and the quality
and safety implications of different tuning windows.
Owner-only feedback investigations and their promotion gates are described in
[the review workbench guide](docs/review-workbench.md).
The [Luna-assisted tuning kit](docs/tuning-kit.md)
([한국어](docs/tuning-kit.ko.md) · [日本語](docs/tuning-kit.ja.md)) adds reviewed
synthetic behavior patterns that work immediately as few-shot guidance and can
later feed a separately qualified local student model. For a new product,
follow the [derived-repository qualification guide](docs/create-derived-repository.md)
instead of modifying this checkout in place.

## Releases

Releases follow [Semantic Versioning](https://semver.org/) and are automated by
Release Please from Conventional Commits. Merging the reviewed release pull
request publishes the tag, changelog, and GitHub release.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Direct
changes to `main` are not part of the normal workflow. The project is available
under the [MIT License](LICENSE), with upstream attribution in [NOTICE](NOTICE).
