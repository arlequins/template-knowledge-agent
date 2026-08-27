# Model registry and replay evaluation

The core package provides a provider-neutral deterministic model router and the
indexer provides a Golden Evaluation gate. Keep model IDs and runtime metadata
explicit; a nickname such as “Qwen” is not reproducible.

## Route a request

Register candidates with capabilities (`fast`, `balanced`, `coding`, `deep`) and
cost metadata, then call `createModelRouter(entries).select({ question })`.
Coding terms route to a coding-capable candidate, conflicting evidence routes to
`deep`, and an explicit budget filters by estimated input/output cost. The
selection result includes a reason so it can be replayed and audited.

## Connect the selected runtime

The completion use case accepts an optional `ModelSelectionPort`. Its `select`
method returns the concrete `ModelProviderPort`, model ID, route profile, and
reason. Wire the registry to provider adapters in the composition root; do not
make the chat use case import an SDK. If no selector is supplied, the configured
single provider remains active.

## Replay a model

Save provider output as an ignored JSON file matching `PilotAnswer`:

```json
[{"caseId":"repository-purpose","answer":"...","citationCount":2,"latencyMs":420}]
```

Run the deterministic gate:

```bash
pnpm pilot:evaluate -- --answers .local/evals/ollama-qwen.json
```

It checks required terms, forbidden claims, non-empty answers, citations for
non-refusal cases, repeated sentence loops, and duplicate answers across cases.
A failed gate exits non-zero and must not be promoted. Add
provider/model/runtime/quantization metadata beside each report so comparisons
remain meaningful.

This is a quality gate, not a model benchmark or fine-tuning job. Extend a
derived repository with token accounting, p95 latency, cost, authorization,
and held-out business cases before production promotion.
