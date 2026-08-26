import { redactSensitiveText } from "@arlequins/agent-core";
import type { Logger } from "@arlequins/logger";
import { createLogger } from "@arlequins/logger";

/** Called when any pipeline step fails after retries. */
export type PipelineFailurePayload = {
  /** From `lambdaInvoke.payload.batchId` in `sst.config.ts` (one shared failure Lambda). */
  batchId: string;
  /** Step Functions passes error context; shape varies by runtime. */
  errorEvent: unknown;
};

export type PipelineFailureAlert = PipelineFailurePayload & {
  occurredAt: string;
};

/** Adapter boundary for SNS, Slack, PagerDuty, or an internal incident API. */
export type PipelineFailureNotifier = (
  alert: PipelineFailureAlert,
) => void | Promise<void>;

export type PipelineFailureAlertOptions = {
  notifier?: PipelineFailureNotifier;
  logger?: Logger;
  now?: () => Date;
};

const sensitiveKey = /authorization|cookie|password|secret|token|api[-_]?key/i;

function redactAlertValue(
  value: unknown,
  key?: string,
  seen = new WeakSet<object>(),
): unknown {
  if (key && sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value))
    return value.map((item) => redactAlertValue(item, undefined, seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (value instanceof Error)
      return { name: value.name, message: redactSensitiveText(value.message) };
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactAlertValue(entryValue, entryKey, seen),
      ]),
    );
  }
  return value;
}

export async function notifyPipelineFailureAlert(
  payload: PipelineFailurePayload,
  options: PipelineFailureAlertOptions = {},
): Promise<void> {
  const alert: PipelineFailureAlert = {
    batchId: payload.batchId,
    errorEvent: redactAlertValue(payload.errorEvent),
    occurredAt: (options.now ?? (() => new Date()))().toISOString(),
  };

  if (options.notifier) {
    await options.notifier(alert);
    return;
  }

  (options.logger ?? createLogger({ service: "batch-pipeline-failure" })).warn(
    "Pipeline failed after retries",
    alert,
  );
}
