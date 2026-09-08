# Application answer replay

`pilot:verify` checks synthetic fixtures; it does not call a model.
`agent:readiness` checks HTTP health; it does not establish answer quality.
`pilot:replay` calls the running application's authenticated tRPC endpoints,
including the same completion service used by streaming chat. It uses the
configured database retrieval, model adapter, behavior pack, and message store.

## Run a baseline

Start a generated local application, sign in, create a dedicated evaluation
workspace, and index `examples/pilot/repository` into that workspace. Use the
normal index command documented in the README. Synchronize official sources
before evaluating official-document questions. Live cases require a derived
live-tool integration and must not be reported as qualified without one.

Supply the signed-in user's current bearer token through the environment
variable `AGENT_REPLAY_TOKEN`. Never put it in arguments, reports, or Git.
The command does not bypass authentication or create an administrator.

```bash
pnpm pilot:replay http://localhost:5000 WORKSPACE_UUID examples/pilot/questions.json
pnpm pilot:evaluate -- --answers .local/evaluations/TIMESTAMP.answers.json
```

Every question creates a separate persisted conversation to prevent history
from contaminating other cases. The output includes conversation/message IDs,
stored citations, model ID, and elapsed completion time. A separate runtime
snapshot records the configured provider and behavior pack. Results remain in
ignored `.local/evaluations` and may contain private answers and evidence.
The run stops on a failed request; already-created conversations remain visible
for investigation. It does not retry billable completions automatically.

The answer gate rejects empty suites, missing answers, ambiguous case IDs,
unknown answers, missing/invalid citation counts, configured forbidden claims,
missing required terms, and detected repetition. These are deterministic
screening checks, not proof that a citation supports a claim. Stored citations
currently represent retrieved sources; a reviewer must check whether the answer
actually uses and accurately represents the expected source.

## Verify a reviewed improvement

1. Save the baseline report and runtime snapshot.
2. Open the recorded conversation and submit an incorrect or missing-evidence
   feedback signal for the recorded assistant message.
3. Review the investigation with a corrected answer and current source
   citations using the owner workbench. Approval must follow evidence review.
4. Run the documented `tuning:patterns:daily:with-feedback` workflow. Record
   whether it promoted a changed behavior pack or rejected/no-op'd the input.
5. Replay the same questions in fresh conversations and save the new report.
6. Compare the target case and held-out questions. Inspect source support,
   refusal behavior, repetition, and latency. Roll back a regression using the
   documented behavior-pack rollback command.

Changing wording alone is not improvement. A failed baseline must become a
source-supported answer without breaking held-out behavior. Behavior-pack
promotion changes prompt guidance; it does not train model weights. A derived
LoRA implementation must independently qualify training, serving reload, and
rollback before claiming a weight-training result.

See [review workbench](review-workbench.md), [tuning kit](tuning-kit.md), and
[derived repository setup](create-derived-repository.md).
