# Synthetic agent integration reference

This directory is a public-only reference boundary. It contains no credentials,
provider configuration, private questions, source excerpts, model artifacts, or
approval records. Production integrations must be supplied by a derived
repository outside this template.

The reference runner uses both provider-neutral conformance suites:

```ts
import { runSyntheticReference } from "./reference";

const report = await runSyntheticReference();
if (!report.passed) throw new Error("synthetic integration failed");
```

Both suites provide deterministic, content-free synthetic adapters and can run
without arguments. Derived applications must replace these fixtures with
protected ports before enabling a production capability. The harness must not
return real data or raw adapter errors.

The generated `agent-integration` package starts with both capabilities disabled.
Running this reference does not enable either capability or create a production
command.

The generated package's capability commands must print the corresponding
machine-readable conformance envelope. The integration qualifier checks the
schema, contract version, capability, complete case-ID list, and issue-free
passed result; exit status alone is never sufficient. The generated synthetic
runner refuses an enabled manifest, so derived applications must replace it
with their protected harness before enabling a capability.
