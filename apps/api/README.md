# Hono API

The API exposes health endpoints, a streaming agent endpoint, and the tRPC
transport used by the static Next.js client.

```bash
pnpm --filter @arlequins/api dev
pnpm --filter @arlequins/api test
pnpm --filter @arlequins/api sst:deploy
```

| Path | Purpose |
| --- | --- |
| `GET /health/live` | Process liveness and request ID. |
| `GET /health/ready` | Readiness including S3 bucket access. |
| `GET /health` | Compatibility alias for liveness. |
| `GET /docs` | Interactive Scalar API reference. |
| `GET /openapi.json` | OpenAPI 3.1 contract. |
| `POST /agent/stream` | Authenticated newline-delimited streaming completion. |
| `/api/trpc/*` | Typed agent queries and mutations. |

`src/app.ts` is runtime-independent. `src/dev.ts` serves it with Node and
`src/lambda.ts` adapts it to AWS Lambda.

## AWS deployment

`apps/api/sst.config.ts` creates a private, versioned, SSE-S3 encrypted bucket,
blocks public access, denies insecure transport and unconditional writes, and
grants the Lambda only scoped list/read/write actions. Bedrock stream permission
is added only when `BEDROCK_MODEL_ARN` is set.

Set `API_DEPLOYMENT_PRESET=function-url` for the minimum-cost default, or
`api-gateway` when managed throttling is required. Optional custom-domain and
WAF settings retain the existing preset validation.
