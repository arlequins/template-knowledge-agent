# EC2 model and tuning budget under USD 100

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
