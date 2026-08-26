import { describe, expect, it } from "vitest";

import { redactSensitiveRecord, redactSensitiveText } from "./privacy";

describe("privacy redaction", () => {
  it("redacts emails, credentials, tokens and phone-like values", () => {
    const value = redactSensitiveText(
      "mail person@example.com key sk-1234567890123456 Bearer abc.def phone +81 90-1234-5678",
    );
    expect(value).not.toContain("person@example.com");
    expect(value).not.toContain("sk-1234567890123456");
    expect(value).toContain("[REDACTED_EMAIL]");
    expect(value).toContain("[REDACTED_API_KEY]");
    expect(value).toContain("[REDACTED_TOKEN]");
    expect(value).toContain("[REDACTED_PHONE]");
  });

  it("recursively redacts structured log records", () => {
    expect(
      redactSensitiveRecord({ nested: [{ email: "person@example.com" }] }),
    ).toEqual({ nested: [{ email: "[REDACTED_EMAIL]" }] });
  });
});
