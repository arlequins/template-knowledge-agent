# EC2 model and tuning budget under USD 100

Languages: **English** | [한국어](ec2-model-budget.ko.md) |
[日本語](ec2-model-budget.ja.md)

This estimate answers a narrow planning question: what can run in AWS for less
than USD 100 per month when the application database already exists? It is a
price snapshot, not a quote.

## Assumptions

- Region: Asia Pacific (Tokyo), `ap-northeast-1`.
- Price snapshot: 2026-08-25 AWS public Price List, Linux On-Demand,
  shared tenancy.
- A month is 730 instance-hours.
- RDS is excluded as requested.
- Taxes, internet/NAT transfer, load balancers, S3, CloudWatch, snapshots,
  public IPv4, and surplus T-instance CPU credits are excluded.
- gp3 storage uses the included baseline IOPS and throughput.
- Stopped EC2 instances do not accrue compute charges, but attached EBS still
  does.

Always refresh the calculation from the
[AWS Price List API](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api-fetching-price-list-files-manually.html)
and the [EBS pricing page](https://aws.amazon.com/ebs/pricing/) before deploying.

## Tokyo price snapshot

| Resource | Capacity relevant here | Unit price | 730-hour compute |
| --- | --- | ---: | ---: |
| `t4g.large` | 2 vCPU, 8 GiB RAM, Arm | $0.0864/hour | $63.07 |
| `t4g.xlarge` | 4 vCPU, 16 GiB RAM, Arm | $0.1728/hour | $126.14 |
| `g4dn.xlarge` | 4 vCPU, 16 GiB RAM, NVIDIA T4 16 GB | $0.7100/hour | $518.30 |
| `g6.xlarge` | 4 vCPU, 16 GiB RAM, NVIDIA L4 24 GB | $1.1672/hour | $852.06 |
| `g5.xlarge` | 4 vCPU, 16 GiB RAM, NVIDIA A10G 24 GB | $1.4590/hour | $1,065.07 |
| gp3 EBS | baseline performance | $0.096/GB-month | 40 GB = $3.84 |

AWS documents that G6 uses an NVIDIA L4 with 24 GB per full GPU. That memory is
a plausible starting point for a carefully bounded 9B QLoRA experiment, but it
does not guarantee a given context length, batch size, optimizer, or serving
concurrency. See the [G6 specifications](https://aws.amazon.com/ec2/instance-types/g6/).

## Initial launch target: useful general conversation

The first release should already feel like a usable conversational agent; it
should not wait for project-specific fine-tuning. Use **Bedrock On-Demand** as
the default always-available inference path and evaluate Amazon Nova 2 Lite as
the first low-cost general-chat candidate. Keep the provider adapter boundary
so a derived repository can replace it with another Bedrock, Claude, Gemini,
OpenAI, or local model after the same replay suite passes. Bedrock On-Demand
scales without reserved capacity and charges for processed tokens; quotas still
vary by model and region. See the
[Nova On-Demand guidance](https://docs.aws.amazon.com/nova/latest/nova2-userguide/on-demand-inference.html)
and [Nova 2 Lite model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html).

Use this as an initial planning profile, not a capacity guarantee:

- 100 registered users, 20–30 daily active users, and up to five simultaneous
  conversations under ordinary light use;
- a short burst queue for traffic above the concurrency target, with a clear
  busy/retry message instead of silent failure;
- streaming text responses, multi-turn history, Markdown rendering, answer
  copy, regeneration, and cancellation;
- English, Japanese, and Korean acceptance conversations, with per-language
  quality measured rather than assumed;
- bounded history and retrieved context so one long conversation cannot consume
  the entire latency and token budget; and
- per-user and per-workspace rate limits plus daily token and cost alarms.

Route requests by evidence need:

1. general conversation goes directly to the selected foundation model with a
   concise behavior and safety prompt;
2. repository, Fumadocs, React, Drizzle, or other approved technical questions
   add retrieved source chunks and citations;
3. current notices, sales, and business records invoke allowlisted read-only
   live capabilities; and
4. unsupported or unauthorized questions receive an explicit limitation, not
   an invented answer.

Before launch, replay at least a multi-turn general-chat set, the public pilot
corpus, refusal cases, and a five-concurrent-user load test. Measure time to
first token, complete-response latency, token use, error rate, repeated
sentences, unsupported claims, and citation correctness. Fine-tuning begins
only after this baseline works and reviewed failures show a repeated behavior
problem that retrieval, prompting, or routing cannot fix.

## Plan A: always-on small CPU model plus intermittent tuning

This is the only self-hosted, continuously reachable shape that fits the
budget without relying on Spot pricing.

| Monthly item | Calculation | Cost |
| --- | ---: | ---: |
| `t4g.large` service | 730 × $0.0864 | $63.07 |
| Service gp3 | 40 GB × $0.096 | $3.84 |
| `g4dn.xlarge` tuning runner | 30 hours × $0.7100 | $21.30 |
| Tuning gp3 | 30 GB × $0.096 | $2.88 |
| **Subtotal** |  | **$91.09** |
| Unallocated ceiling | $100 − $91.09 | **$8.91** |

Use a 1.5B–3B instruct model quantized to 4-bit for CPU inference. Treat 8 GiB
as a hard whole-process budget, including runtime, KV cache, retrieval context,
and the operating system. This can support about 100 registered users only when
traffic is light and concurrency is deliberately queued; benchmark time to
first token and simultaneous requests before calling it production-ready.

The 30 GPU hours are appropriate for short, checkpointed 1.5B/3B QLoRA jobs and
evaluation. A 7B/9B job on the T4 16 GB may require very short sequences, tiny
batches, gradient checkpointing, and CPU offload, and is not the recommended
baseline. Run tuning separately from serving and promote only after held-out
quality and safety gates pass.

## Plan B: Ornith 1.5 9B in scheduled GPU windows

`ornith-ai/Ornith-1.5-9B` is a 9B dense model. The Mac-specific
`Ornith-1.5-9B-MLX-4bit` artifact cannot be loaded directly by an NVIDIA CUDA
runtime. On EC2, start from the licensed Hugging Face weights for CUDA QLoRA or
a compatible GGUF/quantization for inference, then re-run the same evaluation
suite.

| Monthly item | Calculation | Cost |
| --- | ---: | ---: |
| `g6.xlarge` | 75 hours × $1.1672 | $87.54 |
| gp3 | 80 GB × $0.096 | $7.68 |
| **Subtotal** |  | **$95.22** |
| Unallocated ceiling | $100 − $95.22 | **$4.78** |

Seventy-five hours is about 2.5 hours per day. This plan can perform scheduled
QLoRA/evaluation and serve interactive tests during that window, but it is not
a 24/7 service. The 24 GB L4 is the more credible of these low-cost instances
for a 9B experiment; its 16 GiB host RAM is still tight, so measure actual peak
memory and use small datasets, bounded sequence length, gradient
checkpointing, and resumable checkpoints. Stop the instance after each job.

Spot can extend the GPU hours, but its price and capacity are not a budget
guarantee. Persist checkpoints and handle the
[two-minute interruption notice](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html).

## What changes with fine-tuning time

Training time is a capacity budget, not a quality score. More GPU time can
process more approved examples, evaluate more candidates, or use a longer
sequence length. Repeating the same small dataset for more epochs can instead
increase memorization, repetition, unsupported claims, and regression. It
cannot add current facts that are absent from the evidence; current notices,
sales, and repository changes should come from RAG or read-only live tools.

| GPU time for one candidate cycle | What it can reasonably change | What it proves |
| --- | --- | --- |
| Up to 30 minutes | Verify the CUDA stack, dataset format, token placement, checkpointing, and one end-to-end smoke case | Only that the pipeline runs; never enough for promotion |
| 30 minutes–2 hours | Train one small LoRA/QLoRA candidate on a compact reviewed dataset and run a short held-out replay | A pilot signal, not broad behavior improvement |
| 2–8 hours | Use more approved examples or sequence budget, compare a few learning-rate/rank choices, and run stronger citation, repetition, language, and refusal checks | A credible candidate only if a disjoint test set and application replay pass |
| 8–24 hours | Run multiple seeds or candidates, broader regression suites, and latency/cost measurements | Greater comparison confidence, not guaranteed answer quality |
| More than 24 hours | Explore a larger dataset or model, wider hyperparameter search, or repeated robustness tests | Often diminishing returns; investigate retrieval, data quality, or model fit before buying more compute |

The elapsed window also contains export, model loading, evaluation, report
generation, and checkpoint upload. Do not treat all scheduled instance time as
optimizer time. Record at least dataset version, base model, adapter settings,
GPU type, training steps, tokens processed, validation loss, held-out results,
wall-clock time, and peak memory so two runs can be compared.

### Monthly effect of the schedule

The monthly GPU compute portion is approximately:

```text
monthly GPU cost = hourly price × hours per run × runs per month
```

At this Tokyo price snapshot:

| Schedule example | Monthly GPU hours | Compute cost | Practical use |
| --- | ---: | ---: | --- |
| Four 2-hour `g4dn.xlarge` cycles per month | 8 | $5.68 | Pipeline and small-model pilot checks |
| Daily 1-hour `g4dn.xlarge` cycle | 30 | $21.30 | The tuning allowance used in Plan A |
| Four 4-hour `g6.xlarge` cycles per month | 16 | $18.68 | 9B candidate training plus guarded evaluation |
| Daily 2.5-hour `g6.xlarge` window | 75 | $87.54 | The full scheduled GPU window in Plan B; EBS leaves the total at $95.22 |

These rows are ceilings, not recommended minimums. Start a tuning run only
when enough new, source-approved examples exist. Otherwise use the scheduled
window for retrieval evaluation or skip it entirely. A daily evaluation can
still run without producing a new adapter; promotion should be less frequent
than evaluation and occur only when the candidate clearly beats the deployed
version without safety, latency, or cost regression.

### Controls that must not change with the time budget

- Keep train, validation, and test sets disjoint, including semantic
  paraphrases.
- Never select hyperparameters against the test set.
- Stop early when validation quality degrades or repetition rises.
- Compare against the current base model and deployed adapter, not only the
  previous training step.
- Reload the serving process and replay complete RAG answers before declaring
  a promoted adapter active.
- Preserve a versioned rollback target and reject a run even after expensive
  training when its gates fail.

## Recommended service shape

For 100 people making light, bursty requests, use the existing application
compute and RDS with **Bedrock on-demand** for 24/7 inference, and reserve EC2
GPU windows only for an open-model experiment that has a measured advantage.
No On-Demand GPU above fits an always-on USD 100 Tokyo budget.

As a scale example rather than a Tokyo quote, an AWS cost study calculated
22,000 monthly Nova Micro requests (800 input and 60 output tokens each) at
about $0.80 for inference, with a sample fine-tuning run at $8.00. Model support,
customization support, price, and regional availability must be checked for the
exact deployment date. See the
[AWS Bedrock cost study](https://aws.amazon.com/blogs/machine-learning/cost-efficient-custom-text-to-sql-using-amazon-nova-micro-and-amazon-bedrock-on-demand-inference/)
and [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/).

The practical sequence is:

1. run daily retrieval/prompt/routing evaluation without changing weights;
2. collect only source-approved feedback into isolated datasets;
3. tune weekly or on demand when enough approved examples accumulate;
4. compare the candidate with the deployed model on a disjoint held-out set;
5. reject repetition, unsupported claims, citation, authorization, latency, or
   cost regressions; and
6. promote a versioned adapter with explicit reload and rollback.

Choose Plan A only if offline/local inference is more important than response
quality. Choose Plan B for an Ornith experiment, not continuous service. For
the stated user count and budget, Bedrock on-demand is the default production
recommendation.
