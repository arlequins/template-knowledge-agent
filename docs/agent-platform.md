# Knowledge agent platform

This repository is a reusable foundation for evidence-grounded conversations
about application documentation, source code, official technology references,
and approved live business capabilities.

## Runtime boundary

`@arlequins/agent-core` owns the provider-neutral retrieval/model boundary. The
following is the target composed loop; live execution is an explicit derived
application integration, not an automatic baseline behavior:

```text
question
  -> workspace-scoped approved memory
  -> workspace-scoped project and official-document retrieval
  -> approved live capability when current data is required
  -> model provider stream
  -> answer, citations, feedback, and evaluation record
```

| Port | Local pilot | AWS profile |
| --- | --- | --- |
| Model provider | OpenAI Responses API; optional Ollama fallback | Amazon Bedrock or another approved adapter |
| Persistence | PostgreSQL in Docker | Aurora PostgreSQL or the optional reviewed S3 profile |
| Retrieval | PostgreSQL metadata, keyword search, and locally stored embeddings | PostgreSQL plus optional S3 Vectors |
| Authentication | Included OIDC mock | Google-compatible OIDC provider |

The API streams model output over HTTP. tRPC remains the typed transport for
workspaces, conversations, documents, memory, feedback, and evaluation.

## Knowledge classes

- Project knowledge comes from explicitly selected Markdown, MDX, TypeScript,
  configuration, schema, migration, and test files.
- Official stack knowledge comes only from the canonical URL and exact host
  allowlists in `config/official-knowledge-sources.json`.
- Live business knowledge comes only from explicitly registered read-only
  capabilities such as `notices.listRecent` and `vehicles.listSold`.

Downloaded official pages, private repositories, embeddings, database exports,
and evaluation questions remain in local PostgreSQL or ignored `.local/`
paths. The public repository contains configuration and public fixtures only.

## Authorization and citations

Every database query is scoped by a verified OIDC identity and workspace
membership. Retrieved chunks retain a document label and a file, heading, line,
or canonical URL locator. The model receives these labels with the evidence,
and the UI stores the exact citations with the assistant message.

Static documents are not evidence for current business state. If the question
requires current records and an approved live tool is unavailable, the runtime
must say so rather than infer from code or old documentation.

The template supplies a tested read-only registry and fake-data adapter, but it
does not expose them to the model by default. See the
[read-only live capability example](live-capability-example.md) for the exact
implemented boundary and the remaining derived-repository work.

## Improvement loop

Feedback kinds are `helpful`, `incorrect`, `missing`, and
`needs-investigation`. They are signals, not facts. Reviewed retrieval cases
record the expected evidence chunks, and scheduled evaluations compare citation
recall, answer quality, latency, and cost before a prompt or routing change is
promoted. The initial profile does not perform real-time fine-tuning.

The template defines a separate optional reviewed-learning contract for derived
applications. It requires active source evidence, distinct and disjoint data,
held-out quality gates, atomic promotion, explicit serving reload, and rollback.
The baseline does not claim those commands exist until a generated repository
adds and tests the implementation. See
[Reviewed feedback and learning pipeline](reviewed-learning.md).

## Provider policy

The local OpenAI adapter uses the Responses API with provider-side response
storage disabled. Application history remains in PostgreSQL. Production model
selection is an adapter and policy decision: Bedrock, OpenAI, Anthropic, Gemini,
and Ollama do not leak into the agent domain.

Use [Model selection and deployment playbook](model-playbook.md) for exact model
notes and the Bedrock-versus-EC2 decision.

AWS deployment is optional and runs through protected GitHub Actions with OIDC.
Long-lived AWS credentials are not a supported repository configuration.
