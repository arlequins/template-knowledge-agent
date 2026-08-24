import { describe, expect, it } from "vitest";

import { verifyPilot } from "./verify-pilot";

describe("public pilot corpus", () => {
  it("keeps every retrieval, official, live, and refusal case answerable", async () => {
    await expect(verifyPilot()).resolves.toMatchObject({
      cases: 12,
      status: "pass",
    });
  });
});
