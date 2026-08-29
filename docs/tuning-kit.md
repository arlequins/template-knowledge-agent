# Luna-assisted document-QA tuning kit

[한국어](tuning-kit.ko.md) · [日本語](tuning-kit.ja.md)

The tuning kit turns reviewed evidence into reusable document-QA behavior
patterns. It improves a derived agent in two different ways:

1. use reviewed **training-split** examples as a small few-shot behavior pack
   immediately; and
2. export the same reviewed training rows for a separately qualified local
   student-model trainer later.

OpenAI `gpt-5.6-luna` is the synthetic-data teacher and reviewer assistant in
this workflow, not the fine-tuned student. Luna supports the Responses API and
Structured Outputs but does not support fine-tuning. See the official
[Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
and [evaluation guide](https://developers.openai.com/api/docs/guides/evals).

## Shipped components

- `@arlequins/tuning-kit` defines evidence, seeds, candidates, reviewed
  patterns, deterministic group-aware splits, quality gates, behavior-prompt
  compilation, and JSONL export.
- `createOpenAISyntheticPatternGenerator` calls the Responses API with
  `gpt-5.6-luna`, `store: false`, no tools, and a strict JSON Schema.
- `examples/tuning/seeds.json` is a safe public generation manifest.
- `examples/tuning/reviewed-patterns.json` is a manually reviewed public pack
  covering eight behaviors in English, Japanese, and Korean.
- `pnpm tuning:patterns:verify` checks citations, required and forbidden
  claims, exact duplicates, lexical near-duplicates across splits, repetition,
  possible sensitive data, group leakage, and held-out prompt leakage.

The eight behavior classes are grounded answer, insufficient evidence,
conflicting evidence, required citation, static-versus-live data, code
navigation, clarification, and prompt-injection resistance.

## Generate private candidates with Luna

Put the server-side key in ignored `.env.localhost`, then run:

```bash
OPENAI_API_KEY=replace-me
pnpm tuning:patterns:generate
```

The default output is `.local/tuning/luna-candidates.json`. The command refuses
to write generated candidates outside `.local/`, does not overwrite an
existing file unless `--force` is present, and never enables provider-side
response storage.

Optional arguments:

```bash
pnpm tuning:patterns:generate -- \
  --seed examples/tuning/seeds.json \
  --output .local/tuning/luna-candidates-v2.json \
  --model gpt-5.6-luna
```

Evidence sent to a hosted provider must already satisfy the project's data
handling decision. Do not submit raw business rows, personal data, credentials,
private source excerpts, or user conversations merely because the output path
is local.

## Review and activate

Generated rows always have `status: "candidate"`. Luna cannot approve its own
claims. An owner must compare every answer with active source evidence, remove
unsupported facts, assign the entire semantic `groupKey` to one split, and add
review identity and time before changing the status to `reviewed`.

Only reviewed `train` rows may be passed to
`compileReviewedBehaviorPrompt`. Validation and test rows are deliberately
excluded, so a held-out question remains useful evidence of improvement. Set
the result on the agent profile:

```ts
import {
  compileReviewedBehaviorPrompt,
  type PatternBatch,
} from "@arlequins/tuning-kit";

const reviewedBehaviorPrompt = compileReviewedBehaviorPrompt(batch, {
  language: "ko",
  maxExamples: 6,
});

const profile = {
  id: "knowledge-agent",
  instructions: "Answer from retrieved evidence.",
  name: "Knowledge Agent",
  reviewedBehaviorPrompt,
  workspaceId,
};
```

The examples teach response behavior, not repository facts. The runtime prompt
explicitly says not to copy example facts into unrelated answers and still
requires current retrieved evidence.

The automatic near-duplicate gate uses character-trigram overlap within the
same language. It catches accidental paraphrase leakage but does not replace
the reviewer-assigned semantic `groupKey` or a domain-specific embedding audit.

## Student-model export

`exportReviewedTrainingJsonl(batch)` exports only reviewed training rows. It
does not train or promote a model. A derived Ornith/Qwen/other local pipeline
must still provide the trainer, validation, held-out evaluation, repetition and
unsupported-claim guards, atomic promotion, serving reload, and rollback.

Never use the validation or test split for gradient updates, hyperparameter
choice, behavior-pack prompting, or retry selection. A lower training loss is
not proof that document answers improved.

## Fast qualification loop

1. Keep a stable held-out question and expected evidence.
2. Generate several candidate phrasings and failure-mode patterns with Luna.
3. Review sources and approve only grounded rows.
4. Run `pnpm tuning:patterns:verify`.
5. Compare the base runtime with the reviewed behavior pack on held-out cases.
6. If a stable behavior gap remains, export training rows for a local student.
7. Promote only when application-level RAG, citation, privacy, latency, and
   repetition gates all pass.

This loop can improve usefulness quickly without pretending that every user
reaction changes model weights the next day.
