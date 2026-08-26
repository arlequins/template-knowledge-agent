# Create a derived knowledge-agent repository

Use `template:create` when starting a product repository. It copies only files
tracked by Git into a new directory and initializes the copy; it does not
rewrite or prune the template checkout in place.

```bash
pnpm install
pnpm template:create -- \
  --target ../fleet-knowledge-agent \
  --name fleet-knowledge-agent \
  --scope @example \
  --display-name "Fleet Knowledge Agent" \
  --domain fleet.example.com \
  --preset full
```

The target must be outside this checkout and empty. Use `--dry-run` to inspect
the copy and initialization plan. Add `--prune` only when the selected preset
is final because pruning physically removes unselected modules from the new
repository.

## First qualification

From the generated repository:

```bash
pnpm install
pnpm agent:setup
pnpm template:doctor
pnpm pilot:verify
pnpm tuning:patterns:verify
pnpm check:fix
pnpm check
pnpm typecheck
pnpm test
```

Then initialize its Git history, configure branch protection and Release
Please, and replace example ownership, domains, OIDC clients, IAM roles, and
incident contacts. Do not copy a real `.env`, database export, source snapshot,
question history, feedback record, or trained adapter into the public Git
history.

## Public and private layers

Keep these in the public derived repository:

- provider and repository interfaces;
- fake-data live capability adapters and contract tests;
- synthetic Fumadocs/T3 fixtures and evaluation cases;
- synthetic tuning seeds, reviewed public behavior patterns, and private-data
  quality gates;
- schemas, migrations, operational documentation, and redacted examples; and
- quality gates that contain no private questions or source excerpts.

Load these only from ignored local paths or protected infrastructure:

- business documents and source repositories;
- Aurora snapshots and production records;
- user conversations, feedback, reviewed examples, and evaluation reports;
- API keys, OIDC secrets, encryption keys, and AWS role values; and
- model weights and LoRA adapters unless their licenses and contents have been
  explicitly approved for publication.

The synthetic pilot in [`examples/pilot`](../examples/pilot) is the replacement
guide: preserve its shapes and tests while replacing its data adapters and
questions with private equivalents outside Git.

The same rule applies to [`examples/tuning`](../examples/tuning): keep its
public schemas and synthetic examples, but write Luna-generated candidates to
`.local/tuning/`. Never commit a derived product's source excerpts, user
questions, reviewer identities, evaluation reports, or student-model exports.
