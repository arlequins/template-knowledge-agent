# Privacy and sensitive-data boundary

Languages: **English** | [한국어](privacy-sensitive-data.ko.md) |
[日本語](privacy-sensitive-data.ja.md)

Read-only SQL prevents modification; it does not prevent disclosure. A query
result containing a name, email address, phone number, customer note, or other
personal data becomes sensitive everywhere it travels: tool output, model
input, model response, conversation history, logs, feedback, evaluation data,
and tuning exports.

This template therefore keeps real personal-data capabilities disabled until a
derived repository completes the controls in this document. This is an
engineering baseline, not a substitute for the organization's privacy, legal,
records-management, and security review.

## Data classes and default handling

| Class | Examples | Model policy | Persistence policy |
| --- | --- | --- | --- |
| Public | Published documentation and public source | Allowed after source validation | Normal conversation policy |
| Internal | Notices, aggregate sales, non-personal operational facts | Allowed through an authorized, bounded capability | Normal conversation policy when approved |
| Personal | Name, email, phone, address, customer or employee identifiers | Mask or omit before the model | Ephemeral; never conversation, memory, feedback, evaluation, or tuning data |
| Restricted | Passwords, credentials, payment data, government IDs, health data | Do not register as a model capability | Separate approved workflow only |

An identifier can be personal even when it is not a name. Classify source
fields with the data owner instead of relying only on regular expressions or a
model prompt.

## Enforced live-capability contract

Every registered capability declares an output policy with:

- `classification`: `public`, `internal`, or `personal`;
- `fields`: an explicit per-field `allow`, `mask`, or `omit` rule;
- `persistence`: `conversation` or `ephemeral`; and
- `auditInput`: whether a sanitized input summary may enter the audit event.

The registry fails closed when a query returns an undeclared field or a
non-scalar value. Personal capabilities must be ephemeral and must omit their
input summary from audit events. Masking happens before rows leave the registry,
and audit records contain only actor, capability, classification, time, row
count, truncation, tenant, and workspace metadata.

`assertLiveCapabilityResultPersistable` rejects an ephemeral result. Any future
tool loop must call this guard before serializing a result into conversation
history, memory, feedback, evaluation, or tuning data.

The public example includes `customers.lookupMaskedContact`. It reads a fake
personal record only after tenant and permission checks, replaces the customer
ID, name, email, and phone with type markers, omits the internal note, and marks
the result ephemeral. It never provides the exact contact data.

## Exact personal-data display

When an authorized employee genuinely needs an exact address or contact value,
do not send that value through the model. Use a separate purpose-specific tRPC
procedure and render a structured UI card after the same row- and field-level
authorization. Keep that response outside model context and conversation
history, apply a short cache policy, and audit access metadata without the
value.

For example, “show vehicles sold this week” can give the model vehicle ID,
model, and sale time. “Open the buyer contact” is a separate UI action with a
separate permission; it is not a more detailed version of the model tool.

### Application readiness gate

The provider-neutral `@arlequins/agent-core` package exports
`assertExactPersonalDataSourceReady` and
`authorizeExactPersonalDataSource`. A derived application must pass an
explicit readiness contract through this gate immediately before registering
an exact-personal-data source. The contract requires all of the following:

- a versioned structured UI route explicitly authorized for `non-model`
  transport, excluded from model context, and approved by a recognized
  data-owner, privacy-owner, or security-reviewer role, with approval ID,
  subject, source binding, policy version, timestamps, and route/version
  evidence;
- a bounded maximum retention period and a short, bounded UI-cache period;
- a provider-neutral deletion port with an identified workflow;
- a current access review no older than 90 days, with a due date no more than
  365 days ahead; and
- an affirmative, dated privacy-owner acceptance that is no older than 365 days
  and has a bounded, future expiry, with acceptance ID, subject, source binding,
  policy version, role, and timestamps.

The contract must inject an `ExactPersonalDataApprovalVerifierPort`; the
template has no default verifier. It must verify both approval records and
return the exact evidence, or `false`; a false result, thrown error, or any
identity, role, source, route/version, policy-version, or timestamp mismatch
fails closed.

The validator accepts `unknown` configuration and rejects missing, malformed,
future-dated, or expired evidence. There is no default-enabled or zero-argument
path. Successful authorization returns a frozen, module-issued opaque permit
and an immutable registration descriptor. The derived source-registration
boundary must pass both to `assertExactPersonalDataAuthorizationPermit`, which
returns the descriptor snapshot to use. Registration code therefore does not
re-read a mutable readiness object. The snapshot preserves the deletion
function identity and binds the permit to its UI route/version and expiry
evidence. This catches copied, fabricated, or cross-contract permits; the
template cannot stop a derived developer from bypassing its API, so code review
and integration tests remain required.

All contract timestamps must use canonical RFC3339 UTC form
`YYYY-MM-DDTHH:mm:ss.sssZ`; timezone-less, locale-formatted, offset, and
calendar-normalized dates are rejected. Access reviews are at most 90 days old
and due within 365 days. Privacy-owner acceptance is at most 365 days old and
must have a future expiry no more than 365 days ahead. Structured UI approvals
are at most 90 days old and their expiry is no more than 365 days ahead.

The deletion port receives an authenticated actor with tenant and workspace
context plus an explicit purpose. The derived repository must prove in
integration tests that deletion is idempotent, auditable, propagates to every
approved copy, and never exposes the source through the model allowlist. Passing
the gate does not permit exact values to enter model context, conversation
history, logs, feedback, evaluation, or tuning exports.

## Bedrock Guardrail integration

Set both values to attach an existing versioned Bedrock Guardrail to every
Converse stream request:

```dotenv
BEDROCK_GUARDRAIL_ARN=arn:aws:bedrock:REGION:ACCOUNT:guardrail/GUARDRAIL_ID
BEDROCK_GUARDRAIL_VERSION=1
```

The adapter refuses a partial pair and deliberately does not request guardrail
trace output because trace findings may contain the original value. The Lambda
receives `bedrock:ApplyGuardrail` only for the configured guardrail ARN.

Configure input and output sensitive-information policies, but keep the
application field policy as the primary control. Bedrock documents that PII
filtering is probabilistic, does not cover PII in `tool_use` parameters, and
does not redact original inputs in model invocation logs. Keep invocation
logging disabled for sensitive traffic unless an approved protected logging
design and CloudWatch log data protection are in place:

- <https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-sensitive-filters.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/usingVPC.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/data-encryption.html>

Bedrock does not use customer prompts and outputs to train base models, but the
application still owns its stored conversation history and every downstream
copy. Use an in-region endpoint or approved inference profile, least-privilege
IAM, TLS, KMS, and PrivateLink according to the deployment's data-location
policy:

- <https://aws.amazon.com/bedrock/faqs/>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html>

## Chat, memory, and tuning restrictions

The baseline chat implementation persists user and assistant text. It is not a
PII vault. Do not put an exact personal value into a prompt and assume a system
instruction will protect it.

A derived application that accepts personal text must add a reviewed input and
output inspection port, retention metadata, deletion workflow, encryption,
access audit, and an explicit `noPersist` route before enabling that use case.
Until then, reject the sensitive request or move it to the structured UI path.

Never export raw personal data into feedback, evaluation, distillation, LoRA,
QLoRA, or other tuning data. Fine-tuned models can reproduce training examples;
removing a database row does not remove a memorized value from an adapter.
AWS gives the same warning for Bedrock custom-model training data:

- <https://docs.aws.amazon.com/bedrock/latest/userguide/encryption-custom-job.html>

## Required request path

1. Verify the login and map it to user, tenant, workspace, roles, and purpose.
2. Select an explicit capability; never generate arbitrary SQL from natural
   language and never give the model database credentials.
3. Apply database/application row authorization and select only required
   columns.
4. Validate the returned schema and apply the field output policy.
5. Send only the sanitized model rows to inference.
6. Apply input/output guardrails and application output validation.
7. Persist only results whose policy explicitly permits conversation storage.
8. Audit metadata and test that raw values are absent from results, logs,
   history, feedback, and tuning exports.

## Production acceptance checklist

- [ ] Data owner approved every source field and purpose.
- [ ] Authentication is supplemented by tenant, role, record, and field
      authorization.
- [ ] Personal and restricted columns are absent from general chat capabilities.
- [ ] Schema drift and undeclared columns fail closed.
- [ ] Personal capability results are masked, ephemeral, and absent from audit
      input summaries.
- [ ] Exact personal values use a non-model structured UI path.
- [ ] The application passes the agent-core exact-personal-data readiness gate
      immediately before enabling the source.
- [x] The template primitive validates fresh, versioned structured-UI approval,
      issues an opaque permit bound to the exact readiness snapshot, and
      exposes a registration-boundary assertion; derived code must use it.
- [ ] Bedrock Guardrail input/output policies and least-privilege IAM are
      configured and tested.
- [ ] Model invocation logging is disabled or separately protected and approved.
- [ ] Cross-tenant, prompt-injection, history-leak, field-leak, and MCP/tool
      authorization tests pass.
- [ ] Conversation retention, deletion, incident response, and access reviews
      are operational.
- [ ] No personal data enters memory, feedback, evaluation, or tuning datasets.

Real Aurora personal-data access remains disabled until every applicable item
passes in the derived repository.
