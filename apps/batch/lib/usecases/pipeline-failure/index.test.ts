import type { Logger } from "@arlequins/logger";
import { describe, expect, it, vi } from "vitest";

import { notifyPipelineFailureAlert } from ".";

describe("notifyPipelineFailureAlert", () => {
  it("redacts sensitive values before invoking an alert adapter", async () => {
    const notifier = vi.fn();

    await notifyPipelineFailureAlert(
      {
        batchId: "index-docs",
        errorEvent: {
          message: "failed for owner@example.com",
          password: "do-not-send",
          nested: { authorization: "Bearer secret" },
        },
      },
      { notifier, now: () => new Date("2026-08-27T00:00:00.000Z") },
    );

    expect(notifier).toHaveBeenCalledWith({
      batchId: "index-docs",
      errorEvent: {
        message: "failed for [REDACTED_EMAIL]",
        password: "[REDACTED]",
        nested: { authorization: "[REDACTED]" },
      },
      occurredAt: "2026-08-27T00:00:00.000Z",
    });
  });

  it("uses a logger when no external adapter is configured", async () => {
    const warn = vi.fn();
    const logger = { warn } as unknown as Logger;

    await notifyPipelineFailureAlert(
      { batchId: "sync", errorEvent: { Cause: "timeout" } },
      { logger, now: () => new Date("2026-08-27T00:00:00.000Z") },
    );

    expect(warn).toHaveBeenCalledWith(
      "Pipeline failed after retries",
      expect.objectContaining({ batchId: "sync" }),
    );
  });
});
