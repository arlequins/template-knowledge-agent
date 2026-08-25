# Template Readiness

This checklist records the reusable baseline provided by the repository. When
adapting the template, retain each capability or remove it deliberately with
its related code, tests, environment variables, and documentation.

## Local Development

- [x] OIDC Authorization Code with PKCE in the browser and JWT access-token
  validation in the API.
- [x] Sample seeds restricted to local and test stages unless explicitly
  enabled.
- [x] Local PostgreSQL through Docker Compose with setup and teardown commands.
- [x] Configurable PostgreSQL TLS behavior.
- [x] Migration, seed idempotency, and representative tRPC integration tests.

## Template Composition

- [x] Non-destructive `template:create` flow that copies Git-tracked public
  files into an empty sibling directory before initialization.
- [x] Repository initialization for package scope, machine name, display name,
  metadata, and example domains.
- [x] Full and minimal presets with selectable auth, batch, SST, and example UI
  features.
- [x] Pairwise qualification of every two-feature enabled/disabled state.
- [x] Prune mode for physically removing unselected modules and dependencies.
- [x] Application, package, and DIP-aligned tRPC domain generators.
- [x] Cross-package clean-architecture feature generator for commands and queries.
- [x] Removable and regenerable example CRUD functionality.
- [x] Generic CRUD UI with search, sorting, pagination, shared states, and
  permission-aware actions.
- [x] Provider-neutral file upload port with an optional S3 adapter.
- [x] Exact OIDC identity based initial-administrator bootstrap.

## Operations and Security

- [x] Structured logging, request ID propagation, liveness, and readiness.
- [x] GitHub Actions AWS OIDC deployment with preview cleanup and production
  approval guidance.
- [x] Dependency review, CodeQL, secret scanning guidance, SBOM generation, and
  license checks.
- [x] Deployment migration ordering, advisory locking, backup, side-by-side
  restore verification, and rollback guidance.
- [x] Replaceable tracing and error reporting with CloudWatch metrics, alarms,
  and an incident runbook.
- [x] Provider-neutral application rate limiting, request body limits, and
  explicit API security headers with standard 413/429 responses.

## Authentication and Authorization

- [x] Application-user provisioning by stable issuer and subject.
- [x] Dependency-injected role and permission checks.
- [x] Multi-provider issuer configuration and authentication audit logs.
- [x] Expiry, renewal failure, logout propagation, and end-to-end sign-out
  coverage.

## Qualification

- [x] Isolated full and minimal generated-repository qualification.
- [x] Detection of leftover template identity values after initialization.
- [x] Early Node.js and pnpm runtime validation.
- [x] Initializer tests on Linux, macOS, and Windows.
- [x] PostgreSQL migration upgrades and tRPC contract regression tests.
- [x] Chromium and mobile-emulated Playwright authentication and accessibility coverage.
- [x] AWS sandbox smoke tests and a documented load-test policy.
- [x] Required sandbox endpoint variables with manual workflow overrides and
  visible failure when cloud qualification is not configured.
- [x] Environment schema synchronization and changed-workspace checks.
- [x] Optional OpenTelemetry export, component testing, Storybook, and an
  S3-backed application cache are available as reusable building blocks.

## Evidence and Learning Safety

- [x] Feedback is scoped to an authenticated user and workspace and remains a
  signal until source review.
- [x] The template documents active-evidence approval, duplicate rejection,
  disjoint datasets, held-out promotion gates, reload, and rollback contracts.
- [x] Private questions, source excerpts, credentials, adapters, and evaluation
  reports are excluded from the public-template contract.
- [x] Synthetic T3/Fumadocs pilot covers repository, official-document,
  live-data, and evidence-refusal cases.
- [x] Read-only live capability registry validates inputs, scopes actors,
  bounds rows, enforces allow/mask/omit field policies, marks personal results
  ephemeral, emits citations, and records result-free audit metadata.
- [x] Optional Bedrock Guardrail configuration is version-paired and scoped to
  an exact guardrail ARN in the example runtime policy.
- [ ] A production profile that needs exact personal values must provide a
  separately authorized non-model structured UI, retention/deletion controls,
  access review, and privacy-owner acceptance before enabling the data source.
- [ ] A generated repository that enables weight training must add its own
  tested exporter, trainer, output guard, scheduler, promotion, and rollback
  implementation before advertising tuning commands.
- [ ] A production profile must add an owner-only investigation review API/UI;
  direct operator database approval is not the target interface.

## Adaptation Review

Run `pnpm template:doctor` after initialization and whenever local setup changes.
It checks runtime tools, required environment values, OIDC/SST contracts, and
whether local PostgreSQL and OIDC endpoints are reachable. Use `--json` for
automation and `--strict` when warnings must fail qualification.

Before publishing a repository created from this template:

1. Run `pnpm template:create` with a separate target, scope, name, display name,
   and domain.
2. Choose a preset and prune modules that the application will not use.
3. Replace local and example identity, domain, seed, and IAM values.
4. Configure protected environments, branch rules, and cloud roles.
5. Run the full qualification commands documented in the
   [root README](../README.md#template-qualification).
6. Update `LICENSE`, `NOTICE`, ownership, support, and incident contacts.
