# Privacy redaction foundation

`@arlequins/agent-core` exports `redactSensitiveText` and
`redactSensitiveRecord` for logs, evaluation reports, and tuning exports. They
cover common email, phone, API-key, bearer-token, and JWT shapes. Redaction is a
last defense: do not send restricted fields to a model or register them in a
live capability in the first place.

```ts
const safe = redactSensitiveRecord({ userId, input, providerResponse });
logger.info("model.completed", safe);
```

Derived repositories must add domain-specific patterns, retention/deletion
workflows, encryption and access review. Test redaction against representative
values without committing real personal data.
