# Public T3 and Fumadocs pilot

`examples/pilot` is a publishable, synthetic acceptance corpus for a repository
created from this template. It proves the shape of the first knowledge slice
without pretending that fixture data is a production application.

The corpus contains:

- Fumadocs-style MDX explaining project-specific React Hook usage;
- a small T3-style notice page and tRPC routers;
- a Drizzle-shaped sold-vehicle record;
- repository, official-document, live-data, and refusal questions; and
- required evidence, forbidden claims, and expected source locations.

Run:

```bash
pnpm pilot:verify
```

The verifier chunks the fixture, checks that project evidence ranks for six
repository questions, confirms two official sources are allowlisted, confirms
two live capability names exist, and validates two refusal contracts. This is
a deterministic preflight, not an LLM quality score. A derived repository must
add model replay, citation correctness, unsupported-claim, repetition,
authorization, latency, and cost checks before promotion.

## Replacing the fixture

1. Copy the public question schema into an ignored or access-controlled test
   dataset.
2. Replace synthetic paths with real repository paths and commit identifiers.
3. Keep train, validation, and held-out test examples disjoint.
4. Store current business-data questions as live capability cases, never as
   static RAG answers.
5. Redact or synthesize a small public regression set before contributing a
   reusable improvement back to the template.

Do not make the verifier pass by adding the desired answer to an unrelated
document. The expected file and required terms should represent the source that
a person would accept as evidence.
