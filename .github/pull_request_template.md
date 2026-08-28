## Summary

- What changed, and why is this the smallest safe change?
- Which package, feature slice, or workflow owns the change?

## Verification

- [ ] Tests or contract fixtures cover the change where appropriate.
- [ ] Documentation and examples are updated.
- [ ] Workspace, repository, tenant, and live-data authorization boundaries are preserved.
- [ ] No secrets, production data, generated artifacts, or unrelated changes are included.
- [ ] The pull request title follows Conventional Commits.

## Risk and rollback

- User-visible or data impact (write `None` when not applicable):
- Rollback or mitigation if the change fails:

## Deployment impact

- [ ] No deployment impact.
- [ ] AWS changes require a protected environment diff and reviewed-commit deployment.
