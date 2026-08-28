# tRPC Router Convention

Read this when adding or changing procedures in `packages/trpc`.

## Architecture

```text
apps/api/src/app.ts
  -> packages/trpc/src/features/<name>/router.ts
       -> feature composition
            -> packages/service/src/features/<name>/application/use-cases
                 -> port <- feature adapter
```

The Hono app owns HTTP concerns. tRPC owns typed API contracts and request middleware. Services own application behavior and receive concrete I/O dependencies during composition. Drizzle owns persistence.

## Layer Rules

### Hono

- Mount tRPC through the fetch adapter in `apps/api/src/app.ts`.
- Keep CORS, request IDs, structured request logging, security headers, health checks, and ordinary HTTP endpoints here.
- Do not place domain behavior or Drizzle queries in Hono handlers.

### tRPC Context

- Build request-scoped dependencies in the feature's `composition.ts` and the
  application composition root.
- Resolve authentication once per request.
- Pass the request-scoped logger from Hono into tRPC and bind a component name for each service.
- Expose application operations through `ctx.services`.
- Keep concrete database construction out of routers.

```ts
export const createTRPCContext = async (opts: {
  headers: Headers;
  logger: Logger;
}) => {
  const session = await authApi.getSession({ headers: opts.headers });

  return {
    logger: opts.logger,
    session,
    services: {
      content: createContentService({ logger, repository }),
    },
  };
};
```

### Routers

- Keep routers thin: validate input, select authorization middleware, call one service operation, and return the result.
- Use `publicProcedure` for public operations and `protectedProcedure` for authenticated operations.
- Define routers with `satisfies TRPCRouterRecord`.
- Do not import a database client, Drizzle schema, or global service singleton.

```ts
export const postRouter = {
  all: publicProcedure.query(({ ctx }) => ctx.services.content.listContent()),

  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => ctx.services.content.getContentById(input.id)),
} satisfies TRPCRouterRecord;
```

### Services

- Define service factories in `packages/service`.
- Pass the database or an explicit port and a contextual `Logger` into the factory.
- Keep framework-specific request and response types out of service code.
- Export factories and types with named exports.

```ts
export function createPostService(database: Database, logger: Logger) {
  return {
    listPosts: () => {
      logger.debug("post.list");
      return database.query.Post.findMany();
    },
  };
}
```

For new domains, use `pnpm gen:feature` and keep the complete capability in a
named feature slice. Existing `src/router` modules are compatibility surfaces;
new routers belong in `packages/trpc/src/features/<name>/router.ts`.

The dependency direction is:

```text
router -> composition -> usecase -> port <- adapter
```

## Adding a Router

1. Add shared Zod input contracts to `packages/validators` when the web client also needs them.
2. Generate or extend a dependency-injected feature in `packages/service/src/features`.
3. Compose the feature in its `packages/trpc/src/features/{name}/composition.ts`.
4. Add a thin router in `packages/trpc/src/features/{name}/router.ts`.
5. Register it in `packages/trpc/src/root.ts`.
6. Export browser-safe types only through `@arlequins/trpc/client`.
7. Add tests for service behavior and representative router authorization or validation paths.

## Output Schemas

Add `.output()` when a procedure returns a complex or nested shape, when the response is an external contract that needs runtime validation, or when TypeScript reports TS7056 because the inferred type is too large.

```ts
const itemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
});

const itemRouter = {
  list: publicProcedure
    .output(z.array(itemSchema))
    .query(({ ctx }) => ctx.services.item.list()),
} satisfies TRPCRouterRecord;
```

## Browser Boundary

Client Components must import from `@arlequins/trpc/client`, never `@arlequins/trpc`. The server entry imports authentication, Drizzle, and Node-only database code; the client entry contains only constants, error helpers, and types.

## Common Mistakes

| Mistake | Correct approach |
| --- | --- |
| Writing Drizzle queries in a router | Add the operation to a dependency-injected service or adapter. |
| Calling an external API directly from a router | Inject an external API port into the service. |
| Importing a global service singleton | Compose the service in the request context and use `ctx.services`. |
| Importing `@arlequins/trpc` in a Client Component | Import browser-safe values and types from `@arlequins/trpc/client`. |
| Leaving `.output(z.unknown())` in place | Define an explicit Zod response schema. |
