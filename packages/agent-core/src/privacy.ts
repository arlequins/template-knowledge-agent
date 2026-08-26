/** Replace common credential and personal-data shapes before logging or export. */
const REDACTION_RULES: readonly [RegExp, string][] = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[REDACTED_EMAIL]"],
  [/(?:Bearer\s+)[A-Za-z0-9._~-]+/giu, "Bearer [REDACTED_TOKEN]"],
  [/(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}/gu, "[REDACTED_API_KEY]"],
  [/(?<!\d)(?:\+?\d[\d ()-]{8,}\d)(?!\d)/gu, "[REDACTED_PHONE]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[REDACTED_JWT]"],
];

export function redactSensitiveText(value: string): string {
  return REDACTION_RULES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

export function redactSensitiveRecord<T>(value: T): T {
  if (typeof value === "string") return redactSensitiveText(value) as T;
  if (Array.isArray(value))
    return value.map((item) => redactSensitiveRecord(item)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value))
      output[key] = redactSensitiveRecord(item);
    return output as T;
  }
  return value;
}
