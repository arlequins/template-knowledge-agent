import { describe, expect, it, vi } from "vitest";

import {
  createLiveCapabilityRegistry,
  defineLiveCapability,
} from "./live-capability";

const actor = {
  permissions: ["items:read"],
  tenantId: "tenant-1",
  userId: "user-1",
  workspaceId: "workspace-1",
};

describe("live capability registry", () => {
  it("validates input, caps rows, and audits metadata without result content", async () => {
    const audit = vi.fn();
    const registry = createLiveCapabilityRegistry(
      [
        defineLiveCapability<{ limit: number }>({
          description: "List bounded example items",
          execute: async ({ input }) =>
            Array.from({ length: input.limit + 1 }, (_, index) => ({
              id: `private-${index}`,
            })),
          maxRows: 2,
          name: "items.list",
          parse: (input) => input as { limit: number },
          summarizeInput: ({ limit }) => ({ limit }),
        }),
      ],
      { audit, clock: () => new Date("2026-08-25T00:00:00.000Z") },
    );

    await expect(
      registry.execute({
        actor,
        capability: "items.list",
        input: { limit: 2 },
      }),
    ).resolves.toMatchObject({
      capability: "items.list",
      generatedAt: "2026-08-25T00:00:00.000Z",
      rows: [{ id: "private-0" }, { id: "private-1" }],
      truncated: true,
    });
    expect(audit).toHaveBeenCalledWith({
      actorUserId: "user-1",
      capability: "items.list",
      executedAt: "2026-08-25T00:00:00.000Z",
      inputSummary: { limit: 2 },
      returnedRows: 2,
      tenantId: "tenant-1",
      truncated: true,
      workspaceId: "workspace-1",
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("private-0");
  });

  it("rejects unknown and duplicate capabilities", async () => {
    const definition = defineLiveCapability<unknown>({
      description: "Example",
      execute: async () => [],
      maxRows: 1,
      name: "items.list",
      parse: (input) => input,
    });
    expect(() =>
      createLiveCapabilityRegistry([definition, definition]),
    ).toThrow("Duplicate live capability");
    const registry = createLiveCapabilityRegistry([definition]);
    await expect(
      registry.execute({ actor, capability: "items.delete", input: {} }),
    ).rejects.toThrow("Unknown live capability");
  });
});
