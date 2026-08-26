export type RetentionPolicy = {
  conversationDays: number;
  feedbackDays: number;
  memoryDays: number;
};

export function validateRetentionPolicy(policy: RetentionPolicy): void {
  for (const [name, days] of Object.entries(policy))
    if (!Number.isInteger(days) || days < 1 || days > 3_650)
      throw new Error(`Invalid retention days for ${name}`);
}

export function isExpired(createdAt: Date, now: Date, retentionDays: number) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1)
    throw new Error("Retention days must be a positive integer");
  return now.getTime() - createdAt.getTime() >= retentionDays * 86_400_000;
}
