# Reviewed feedback and learning pipeline

This document defines the reusable learning contract for repositories generated
from this template. The baseline template stores feedback and supports
evaluation cases. It also ships a provider-neutral
[document-QA tuning kit](tuning-kit.md) for reviewed synthetic patterns,
few-shot behavior packs, and training JSONL export. It does **not** ship a
real-time trainer or silently convert reactions into model weights.

A derived knowledge-agent has validated an optional Apple-Silicon MLX/LoRA
extension. The reference results below record what worked, what failed, and
which boundaries a derived application must preserve when implementing an
equivalent trainer.

## Improvement layers

Treat answer quality as four independently versioned layers:

1. indexed knowledge and live read-only tools;
2. retrieval, ranking, and workspace authorization;
3. prompts, provider routing, and runtime output guards; and
4. optional reviewed model adapters.

Most daily improvements should happen in the first three layers. Fine-tuning is
appropriate only when a stable, repeated behavior remains after the correct
evidence is already retrieved. A model that refuses without evidence but
answers correctly through RAG is behaving safely.

## Required lifecycle

```text
authenticated feedback
  -> queued investigation
  -> source review by an owner
  -> approved resolution and evidence constraints
  -> deterministic disjoint dataset
  -> candidate training
  -> held-out evidence and repetition gate
  -> reject or atomically promote
  -> reload model process
  -> application-level RAG replay
```

### Feedback is not truth

Persist feedback by user, workspace, conversation, and assistant message. A
rating or correction can create an investigation, but it must not enter a
training export until an owner independently verifies it against active source
chunks.

An approval record needs:

- the exact question and concise corrected answer;
- at least one completed, non-deleted evidence chunk in the same workspace;
- terms a correct answer must contain;
- known unsupported claims the answer must omit;
- reviewer identity and completion time; and
- an immutable audit event.

Reject preferences, unverifiable assertions, stale/generated sources, and
answers copied from previous assistant output. If the real problem is a missing
document, wrong workspace, bad ranking, or unavailable live tool, fix that
layer instead of training around it.

### Dataset isolation

A compliant exporter must:

- require at least six distinct approved questions and answers;
- normalize Unicode, case, and whitespace before duplicate detection;
- order examples deterministically with a stable identifier hash;
- create non-overlapping train, validation, and test splits;
- keep the test split out of both training and hyperparameter selection;
- include evidence in prompts but never leak the expected resolution into a
  held-out probe; and
- keep all rows and manifests outside the public repository.

The validated six-example pilot used `4 train / 1 validation / 1 test`. Larger
datasets should retain a meaningful held-out set and should group semantic
paraphrases before splitting so near-duplicates cannot cross boundaries.

### Candidate gates

Passing loss alone is insufficient. Require every held-out answer to:

- contain required concepts and omit forbidden claims;
- cite or remain consistent with the supplied evidence;
- avoid repeated sentences and repeated token sequences;
- introduce no unsupported identifiers, URLs, filenames, schedules, times, or
  numeric technical claims;
- remain in the requested language; and
- satisfy authorization, latency, and cost budgets in the full application.

Archive failed adapters locally for diagnosis and retain the last known-good
base model or adapter. Promotion should update a versioned pointer atomically;
it must not destroy the rollback target.

### Runtime reload is explicit

A promoted file or symlink does not change a model already loaded in memory.
The deployment workflow must reload or replace the model process, wait for
readiness, restart dependent API processes when configuration changed, and
then replay application-level cases. Do not report a tuning run as active until
the serving process identifies the promoted model/adapter.

## Daily schedule contract

Daily means scheduled evaluation and candidate processing, not continuous
online learning. A derived application may install a local 03:00 job, an AWS
scheduled workflow, or another reviewed schedule. Documentation of a schedule
does not prove it is enabled; record the active configuration and timezone.

A question can improve after the next run only when:

1. its correction was approved from evidence;
2. the cumulative dataset passes distinctness and split validation;
3. training completes;
4. every held-out gate passes;
5. the new adapter is loaded; and
6. current RAG retrieval supplies the intended evidence.

There is no requirement to change wording for its own sake. Repeated identical
answers are a problem only when they ignore new evidence, repeat unnaturally,
or fail the question.

## Validated Apple-Silicon reference

The derived local pilot used
`ornith-ai/Ornith-1.5-9B-MLX-4bit`, 40 iterations, batch size 1, two LoRA
layers, maximum sequence length 768, learning rate `1e-5`, prompt masking, and
gradient checkpointing. One compact evidence prompt capped each source excerpt
at 2,000 characters.

The accepted run reduced training loss from `1.810` at iteration 10 to `0.203`
at iteration 40 and validation loss from `1.424` to `1.168`. The observed peak
memory was about `15.5 GB`. The held-out test gate passed before promotion.

Failed experiments established the guardrails:

| Experiment | Failure | Reusable lesson |
| --- | --- | --- |
| 8 layers, sequence 1,024 | Metal out of memory | Quantized artifact size is not training RAM |
| 4 layers, sequence 512 | `NaN` loss | The long prompt truncated answer tokens |
| 2 layers, sequence 768, three prompts | `NaN` loss | Redundant prompts exhausted the useful token budget |
| 2 layers, sequence 768, one compact prompt | Passed | Inspect token placement before spending compute |

These results are a reproducibility note, not a model benchmark or a promise
that another Mac will use the same memory.

## Reference implementation boundary

The baseline now implements evidence-bound pattern schemas, Luna-assisted
candidate generation, duplicate/citation/repetition/privacy gates,
semantic-group and lexical-near-duplicate split checks, held-out prompt
exclusion, strict owner approval, reviewed training export, versioned behavior
pack activation, no-op detection for unchanged packs, request-time behavior
hot-loading with visible runtime provenance, and local behavior-pack rollback.
The exporter includes only evidence chunks cited by accepted corrections.
Cited evidence is also scanned for sensitive-looking values before it can enter
the pack. Generated rows remain candidates and are written under `.local/`;
this does not replace owner approval or student-model weight qualification.

An MLX extension for a generated repository should add, test, and document:

- an isolated Python/MLX-LM environment;
- an approved-example exporter;
- deterministic split validation;
- a candidate training command;
- held-out quality checks;
- atomic promotion and rejected-run storage;
- a loopback-only model server with reasoning/repetition guards;
- a user-scoped scheduler and log paths;
- explicit post-promotion reload; and
- base-model rollback plus application replay.

Do not advertise commands such as `agent:tune:daily` in a generated repository
until the corresponding implementation and tests are present. The template's
current baseline remains reviewed patterns, provider-neutral evaluation, and
RAG—not automatic weight training.

## Provider-neutral weight-training contract

`@arlequins/tuning-kit` provides pure, default-deny evidence contracts for the
optional weight-training stage. `createTrainingDatasetIdentity` requires an
external protected-source verifier, canonicalizes a quality-gated reviewed
batch with NFC/code-point ordering, and returns a module-issued frozen identity
that binds train JSONL, source bytes, and full content for every split to
SHA-256 identities. `validateWeightTrainingRunSpec` requires external dataset,
privacy, and license verification; exact base-model, trainer-code, and
trainer-config digests; bounded cost, duration, concurrency, and lease values;
and a canonical run-identity idempotency key.

`authorizeWeightTrainingCandidate` snapshots and deep-freezes the candidate,
requires content-addressed artifact locator/version and artifact/manifest
hashes, a mandatory protected artifact resolver that returns immutable artifact
and manifest bytes with registry identity, strict external signature
verification over the frozen metadata/bytes snapshot, and matching full provenance, and
an external verifier for every evaluation gate. Each gate binds the exact run,
dataset, base weights, trainer config, and artifact. The gate set includes split
integrity, held-out evidence, citation, unsupported claims, repetition,
language, privacy, authorization, latency, and cost. `assertWeightTrainingActivationReady`
then binds the served artifact to the candidate after reload, checks freshness
and chronological ordering, requires a distinct available rollback target, and
requires a passing full application RAG/citation replay. `authorizeWeightTraining`
issues a permit only with an exact immutable candidate/activation descriptor.
Its expiry is the minimum of explicit approval expiry, approval/run age
deadlines, and artifact, gate, and activation evidence freshness deadlines.

This contract does not train, schedule, persist, promote, reload, or roll back a
model. It does not verify signatures or protected-source evidence itself; the
derived repository supplies cryptographic and approval verifiers. A derived
implementation must enforce the idempotency key and concurrency lease, keep
artifacts in a protected immutable registry, and perform the operations
represented by the evidence before advertising a weight-training command.

## AWS adaptation

MLX is Apple-Silicon-specific. An EC2 implementation needs a Linux/NVIDIA model
artifact, a serving runtime such as vLLM, Text Generation Inference, or
llama.cpp, and a new CUDA-compatible tuning path. An MLX LoRA is not assumed to
be portable to another quantization or runtime.

For intermittent traffic, prefer Bedrock on-demand and keep the daily loop in
retrieval, prompts, routing, and evaluation. If exact open weights are a hard
requirement, qualify a separate EC2/SageMaker profile and run training away
from the serving GPU. See [Model selection and operating playbook](model-playbook.md).

Bedrock fine-tuning supports only the model families and regions listed by AWS;
it is not a general host for an arbitrary MLX model:

- <https://docs.aws.amazon.com/bedrock/latest/userguide/custom-model-fine-tuning.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/models.html>

## Privacy and security

- Keep feedback text, source excerpts, manifests, adapters, reports, and keys in
  private stores with workspace authorization.
- Never use an assistant answer or user assertion as evidence.
- Do not expose hidden reasoning; store only final user-visible content.
- Require audit events for approval, rejection, promotion, reload, and rollback.
- Separate training compute from production business-data access.
- Do not send private examples to a hosted judge without an explicit provider
  data-handling decision.

## Acceptance checklist for a derived repository

- [ ] Owner-only review path exists and records active evidence chunks.
- [ ] Duplicate and semantic-near-duplicate leakage is tested.
- [ ] Train, validation, and test data are demonstrably disjoint.
- [ ] Held-out probes reject repetition and unsupported facts.
- [ ] Failed candidates leave the current adapter untouched.
- [ ] Serving reload and rollback are automated or explicitly documented.
- [ ] Full RAG answers and citations are replayed after model promotion.
- [ ] Private artifacts are ignored and absent from commits and CI logs.
- [ ] Mac and AWS runtimes are treated as separate qualified profiles.
- [ ] Dataset, base model, trainer code/config, and artifact identities are
      immutable and cryptographically recorded.
- [ ] Privacy and license approvals are fresh, explicit, and bound to the run.
- [ ] Budget, concurrency lease, and deterministic idempotency behavior are
      enforced by the derived coordinator.
- [ ] Artifact signature/provenance verification, post-reload readiness,
      distinct rollback, and application replay evidence are required before
      activation.
