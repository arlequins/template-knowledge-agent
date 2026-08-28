# Feature-Sliced Clean Architecture

This template uses two complementary rules:

- **Clean Architecture** controls dependency direction: policy is independent
  from delivery, persistence, clouds, and model providers.
- **Feature-Sliced Design (FSD)** controls ownership: a business capability is
  kept in one named slice instead of being spread across global folders.

The result is a unit that can be reviewed, tested, enabled, or removed without
having to understand the whole repository.

## Canonical slice

New application behavior is generated with `pnpm gen:feature` and starts here:

```text
packages/service/src/features/<feature>/
  domain.ts                         # vocabulary and pure rules
  application/
    ports/<feature>-port.ts         # outbound contracts
    use-cases/<feature>.ts          # orchestration and policy
  <feature>.test.ts                 # use-case tests with port doubles

packages/trpc/src/features/<feature>/
  adapters/<feature>.ts              # database/provider translation
  composition.ts                     # dependency injection composition root
  router.ts                          # tRPC input/output and delivery mapping
```

The service slice is framework-free. The tRPC slice is a delivery adapter and
may import the service package, but the router never reaches a database or
provider SDK directly. The adapter implements a service port and is the only
place that knows the concrete persistence or provider API.

## Dependency direction

```text
domain <- application <- composition <- adapters
                                      <- router (delivery)
```

Arrows mean “may depend on”. In particular:

| Slice layer | May import | Must not import |
| --- | --- | --- |
| `domain.ts` | local types and pure helpers | workspace packages, tRPC, AWS, Drizzle, HTTP, adapters |
| `application/` | its own domain, ports, and framework-free cross-cutting contracts | adapters, routers, provider SDKs, environment loaders |
| `adapters/` | its own port and infrastructure SDKs | another feature's internals |
| `composition.ts` | service use cases and adapters | tRPC/Hono delivery code |
| `router.ts` | tRPC and its own composition | database clients, AWS SDKs, business rules |

Feature slices do not import another feature's private files. If two slices
need to collaborate, expose a stable application port or a shared domain
contract and compose them at the application boundary. Do not solve a cycle by
moving business logic into `shared`.

`pnpm architecture:check` enforces these rules for both checked-in and
generated slices. Existing `src/router` and `src/adaptors` paths are retained
as compatibility surfaces for the template's older example modules; new code
must use the canonical `features/<name>/adapters` layout.

## Request lifecycle

1. A delivery handler validates transport input and identity.
2. The feature router maps it to a domain input and calls composition.
3. The use case validates policy and calls a port.
4. An injected adapter performs I/O and returns a port result.
5. The router maps stable application errors to transport errors.

The same use case can therefore be called by tRPC, an Hono route, an MCP tool,
or a batch handler without duplicating policy. Each delivery surface gets its
own adapter and authorization context.

## Slice checklist

Before merging a feature:

1. Start with a domain input/result; do not start with a database row.
2. Add a port for every external effect and a use-case test for each policy
   branch.
3. Keep adapters thin and test malformed, timeout, and authorization failures.
4. Compose concrete dependencies in one composition root.
5. Keep routers thin with explicit input and output schemas.
6. Run `pnpm architecture:check`, `pnpm check`, `pnpm typecheck`, and the
   relevant tests.
7. Add the feature's public contract and documentation in the same change.

## Migration from the old layout

Do not move all modules in one risky rewrite. For each changed capability:

1. Freeze the existing transport contract with a contract test.
2. Copy policy into a new named slice and make the old handler delegate to it.
3. Move one adapter at a time behind the port.
4. Compare outputs and authorization decisions in replay tests.
5. Remove the old folder only after generated-repository qualification passes.

This strangler approach keeps the template usable while the derived repository
migrates its domain-specific modules.
