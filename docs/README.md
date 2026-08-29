# Documentation

Use this page as the entry point for project documentation. The root
[README](../README.md) covers installation and the shortest path to a running
local application; the pages below explain design decisions and ongoing work.

## Start Here

1. **[Privacy and sensitive-data boundary](privacy-sensitive-data.md)**
   ([한국어](privacy-sensitive-data.ko.md) ·
   [日本語](privacy-sensitive-data.ja.md)) defines what may reach the model,
   conversation history, audit events, feedback, evaluation, and tuning data.
2. **[EC2 model and tuning budget](ec2-model-budget.md)**
   ([한국어](ec2-model-budget.ko.md) · [日本語](ec2-model-budget.ja.md)) compares
   the initial 100-user chat target, Tokyo instance sizes, sub-USD-100 plans,
   and what different fine-tuning windows can and cannot change.
3. **[Luna-assisted document-QA tuning kit](tuning-kit.md)**
   ([한국어](tuning-kit.ko.md) · [日本語](tuning-kit.ja.md)) provides safe
   synthetic patterns, immediate reviewed few-shot behavior, and local-student
   training exports.
4. [Application architecture](architecture.md) explains workspace boundaries
   and the browser-to-storage request flow.
5. [Knowledge agent platform](agent-platform.md) explains project, official,
   and live knowledge boundaries plus provider-neutral model routing.
6. [Developer experience](developer-experience.md) covers generators, fast
   feedback commands, and template qualification.
7. [Create a derived repository](create-derived-repository.md) provides the
   non-destructive copy-and-initialize workflow and public/private boundary.
8. [Derived qualification](create-derived-repository.md#first-qualification)
   defines the repeatable pre-handoff gate for generated repositories.
9. [Template readiness](template-readiness.md) lists the capabilities to retain
   or deliberately remove when adapting the template.
10. [Generic application baseline](generic-application.md) explains reusable
   CRUD, authorization, upload, and Clean Architecture service patterns.
11. [Feature-sliced clean architecture](conventions/feature-sliced-design.md)
    ([한국어](conventions/feature-sliced-design.ko.md) ·
    [日本語](conventions/feature-sliced-design.ja.md)) defines the canonical
    feature layout and machine-checked dependency rules.

## Development

- [OpenID Connect authentication](authentication.md): provider registration,
  local identity provider, token validation, and application authorization.
- [Database operations](database-operations.md): migration order, backups,
  restore verification, and failure recovery.
- [Agent operations](agent-operations.md): readiness monitoring, alert policy,
  quotas, backups, and retrieval-incident recovery.
- [Local agent demo](local-agent-demo.md): run PostgreSQL, OpenAI, repository
  indexing, and official technology-document retrieval.
- [Public T3 and Fumadocs pilot](public-pilot.md): synthetic source corpus,
  evaluation manifest, and deterministic verification.
- [Read-only live capability example](live-capability-example.md): typed,
  tenant-scoped current-data access for notices and sold vehicles.
- [Embedded chat contract](embedded-widget.md) · [한국어](embedded-widget.ko.md) ·
  [日本語](embedded-widget.ja.md): origin allowlisting and safe popup handoff.
- [Remote MCP server contract](mcp-server.md) · [한국어](mcp-server.ko.md) ·
  [日本語](mcp-server.ja.md): guarded JSON-RPC transport, per-tool
  authorization, and redacted failure notifications.
- [Reviewed feedback and learning pipeline](reviewed-learning.md): source
  approval, isolated datasets, guarded LoRA promotion, reload, and rollback.
- [Owner review workbench and daily promotion](review-workbench.md) ·
  [한국어](review-workbench.ko.md) · [日本語](review-workbench.ja.md): owner-only
  evidence-bound investigation review, versioned daily behavior-pack
  promotion, and rollback.
- [Model registry and replay evaluation](model-evaluation.md) ·
  [한국어](model-evaluation.ko.md) · [日本語](model-evaluation.ja.md): deterministic
  routing and Golden Evaluation replay.
- [Model selection and deployment playbook](model-playbook.md): OpenAI,
  Ollama/Qwen, Ornith/MLX, Gemini, Bedrock, and EC2 guidance.
- [SST local testing](sst-local-testing.md): what can be validated without SST
  sign-in or AWS credentials.
- [Test operations](testing-operations.md): test layers, external test
  environments, and flaky-test policy.
- [Dependency and release automation](automation.md): Renovate policy,
  automated release PRs, tags, and changelog updates.
- [Observability](observability.md): structured logs, metrics, traces, and OTLP
  collector configuration.
- [UI development](ui-development.md): component tests, Storybook, and
  accessibility checks.
- [S3 cache](s3-cache.md): API and database caching, TTL, invalidation, and
  local configuration.
- [S3-primary agent persistence](s3-primary-architecture.md): optional
  production profile retained for deployments that require immutable releases.

## Deployment and Operations

- [CI/CD operations](ci-cd.md): workflow responsibilities, required repository
  settings, deployment environment loading, and release flow.
- [Deployment and supply-chain security](deployment-security.md): GitHub OIDC,
  protected environments, security checks, and response headers.
- [Incident runbook](incident-runbook.md): triage, mitigation, recovery, and
  observability integration points.
- [Semantic versioning](semantic-versioning.md): release impact and repository
  version policy.

## Engineering Conventions

- [Git, branches, commits, and releases](conventions/git.md)
- [Monorepo operations](conventions/monorepo.md)
- [Testing policy](conventions/testing.md)
- [tRPC router convention](conventions/trpc.md)
- [TypeScript, imports, exports, constants, and types](conventions/typescript.md)
- [AI collaboration convention](conventions/ai.md)

## AI Context

- [AI memory](ai-memory.md) is a compact repository map for coding agents. It
  supplements the engineering conventions and does not override them.

## Document Boundaries

- Put setup commands and the first successful local run in the root README.
- Put stable engineering rules under `docs/conventions/`.
- Put operational procedures in a dedicated top-level page under `docs/`.
- Update both the implementation and its canonical document in the same PR.
- Link to the canonical page instead of copying procedures into multiple files.
