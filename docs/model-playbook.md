# Model selection and deployment playbook

This template implements OpenAI, Ollama, and Amazon Bedrock adapters. Gemini,
MLX, personal credential storage, and reviewed local LoRA are proven extension
patterns in a derived application but are not part of the baseline until their
packages, environment schema, tests, and UI are intentionally added.

Model IDs, regional availability, and pricing change. Verify the provider
catalog during deployment and evaluate every candidate against the same RAG
cases, citations, unsupported-claim checks, latency, and cost envelope.

## Implemented baseline

| Provider | Default in code | Best fit | Important constraints |
| --- | --- | --- | --- |
| OpenAI | `gpt-5.6-luna` and `text-embedding-3-small` | Fast hosted pilot | Responses API uses `store: false`; protect the server key |
| Ollama | `qwen2.5:3b` and `nomic-embed-text` | Portable local fallback | Loopback only; re-embed after changing embedding space |
| Bedrock | Deployment-supplied model ID | Managed AWS production | IAM and region/model compatibility; embeddings are a separate choice |

Provider selection in the current composition root is OpenAI first, then
Bedrock, then Ollama. A derived application that adds per-request routing must
make the selected provider/model visible and persist it with evaluation output.

## Extension model notes

### Ornith 1.5 9B

The derived Mac pilot currently uses
`ornith-ai/Ornith-1.5-9B-MLX-4bit` for repository and coding questions.
Primary qualification is English grounded/coding performance; Korean and
Japanese are secondary language checks. Thinking is disabled, `<think>` blocks
are removed, and generation stops before a repeated eight-token sequence.

The downloaded 4-bit weights are much smaller than training memory. The
validated two-layer LoRA run peaked around 15.5 GB of Mac system memory. Do not
describe this as an 8 GB RAM training profile.

MLX is not the EC2 runtime. Preserve the same evaluation cases when porting the
model to CUDA, and do not assume an MLX adapter is compatible with vLLM, TGI,
llama.cpp, GPTQ, AWQ, or bitsandbytes formats.

### Qwen 2.5

`mlx-community/Qwen2.5-14B-Instruct-4bit` is the derived Mac pilot's immutable
fallback. The baseline template's smaller Ollama default is `qwen2.5:3b`.
Record the exact parameter count, quantization, and runtime; "Qwen" alone is
not a reproducible model ID.

Use the larger MLX model as a rollback comparator, not as a substitute for
fixing stale evidence or dataset leakage. Use the smaller Ollama model for
portable smoke tests, then qualify whether its answer quality is sufficient.

### Gemma/Ollama

A derived profile may use `knowledge-agent-gemma3:12b` for local chat and
`nomic-embed-text` for embeddings. Ollama simplifies Mac/Linux local operation
but still needs request timeouts, bounded output, reasoning suppression, and
loopback network policy.

### OpenAI

The adapter uses the Responses API with provider response storage disabled.
Use it when a managed endpoint and strong general behavior matter more than a
fully local data path. Application history remains in PostgreSQL. Separate
shared server credentials from encrypted per-user credentials in any derived
model picker.

### Gemini

Gemini is an extension candidate for user-funded inference. Treat a personal
key as encrypted per-user data, never a browser-readable shared secret. The
derived completion adapter filters thought parts; embeddings remain a separate
provider decision.

### Amazon Bedrock

Bedrock is the preferred initial AWS production option when a supported model
passes the grounded suite. On-demand inference avoids paying for an idle GPU;
Provisioned Throughput is a capacity optimization for measured sustained
traffic.

Verify the selected model's API, region, lifecycle, and price:

- <https://docs.aws.amazon.com/bedrock/latest/userguide/models.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html>
- <https://aws.amazon.com/bedrock/pricing/>

Bedrock model customization supports only the listed model families and
regions. Switching to a supported custom model requires a new evaluation
baseline; it is not a managed way to fine-tune arbitrary Ornith MLX weights.

## EC2 local engine versus Bedrock

For a current Tokyo price snapshot and two plans below USD 100 per month, see
[EC2 model and tuning budget](ec2-model-budget.md). RDS is excluded from that
calculation.

AWS G6 uses NVIDIA L4 GPUs with 24 GB per full GPU and targets inference. G5
uses NVIDIA A10G GPUs with 24 GB and also targets moderately complex
single-node training. Useful starting points for a 9B-class 4-bit model are:

| Workload | Starting point | Qualification requirement |
| --- | --- | --- |
| Intermittent production chat | Bedrock on-demand | Pick the cheapest model that passes quality and region policy |
| Exact open-model inference | `g6.2xlarge` class | Benchmark 24 GB L4, 32 GiB host RAM, context, and concurrency |
| More host headroom | `g6.4xlarge` class | Same 24 GB GPU, 64 GiB host RAM |
| CUDA LoRA/QLoRA experiment | `g5.4xlarge` or `g6.4xlarge` class | Train away from serving; measure actual GPU/host peak |

AWS specifications:

- <https://aws.amazon.com/ec2/instance-types/g6/>
- <https://aws.amazon.com/ec2/instance-types/g5/>

These are test starting points, not guarantees. KV cache grows with context and
concurrent sequences. Price the target region and benchmark the exact runtime,
quantization, prompt size, output bound, and scheduler.

### Recommendation for about 100 light users

Start with **Bedrock on-demand**. Light, bursty demand rarely justifies a GPU
that accrues cost while idle, plus driver patching, model loading, autoscaling,
monitoring, and failure recovery. Keep the adapter boundary so the model can be
changed after evaluation.

Use EC2/SageMaker self-hosting only when:

- exact open weights or a specific LoRA are mandatory;
- sustained measured utilization amortizes an always-on GPU;
- isolation requirements prohibit the selected managed model; or
- custom CUDA/quantization/adapter loading is a product capability.

The recommended progression is:

1. validate RAG and reviewed learning locally;
2. deploy a Bedrock on-demand model that passes the same cases;
3. improve retrieval, prompts, and routing daily without daily weight training;
4. route only difficult coding cases to a stronger, costlier model; and
5. revisit self-hosting after collecting real token volume, latency, and spend.

## Evaluation record

For every candidate, record:

- exact provider, model version, region, runtime, and quantization;
- retrieved chunk IDs and citation recall;
- required and forbidden term results;
- repeated sentence/n-gram and unsupported-claim checks;
- first-token and total latency;
- peak host/GPU memory for self-hosted models;
- input/output tokens or instance-hours; and
- failure rate at representative concurrency.

Cost and speed cannot override evidence, authorization, citation, privacy, or
language regressions.
