import { describe, expect, it } from "vitest";

import { isExpired, validateRetentionPolicy } from "./retention";

describe("retention policy", () => {
  it("validates bounded retention and expires old records", () => {
    expect(() =>
      validateRetentionPolicy({
        conversationDays: 30,
        feedbackDays: 90,
        memoryDays: 365,
      }),
    ).not.toThrow();
    expect(isExpired(new Date("2026-01-01"), new Date("2026-02-01"), 30)).toBe(
      true,
    );
    expect(isExpired(new Date("2026-01-15"), new Date("2026-02-01"), 30)).toBe(
      false,
    );
  });

  it("rejects unbounded policies", () => {
    expect(() =>
      validateRetentionPolicy({
        conversationDays: 0,
        feedbackDays: 1,
        memoryDays: 1,
      }),
    ).toThrow();
  });
});
