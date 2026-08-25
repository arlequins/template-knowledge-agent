import { describe, expect, it, vi } from "vitest";

import {
  assertLiveCapabilityResultPersistable,
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
          outputPolicy: {
            auditInput: "include",
            classification: "internal",
            fields: { id: { exposure: "allow" } },
            persistence: "conversation",
          },
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
      classification: "internal",
      generatedAt: "2026-08-25T00:00:00.000Z",
      persistence: "conversation",
      rows: [{ id: "private-0" }, { id: "private-1" }],
      truncated: true,
    });
    expect(audit).toHaveBeenCalledWith({
      actorUserId: "user-1",
      capability: "items.list",
      classification: "internal",
      executedAt: "2026-08-25T00:00:00.000Z",
      inputSummary: { limit: 2 },
      persistence: "conversation",
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
      outputPolicy: {
        auditInput: "include",
        classification: "public",
        fields: { id: { exposure: "allow" } },
        persistence: "conversation",
      },
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

  it("masks personal fields, omits denied fields, and forbids persistence", async () => {
    const audit = vi.fn();
    const registry = createLiveCapabilityRegistry(
      [
        defineLiveCapability<unknown>({
          description: "Return a masked personal record",
          execute: async () => [
            {
              email: "private@example.com",
              id: "customer-1",
              internalNote: "never expose",
              name: "Private Person",
            },
          ],
          maxRows: 1,
          name: "customers.lookupMasked",
          outputPolicy: {
            auditInput: "omit",
            classification: "personal",
            fields: {
              email: { exposure: "mask", replacement: "{EMAIL}" },
              id: { exposure: "mask", replacement: "{CUSTOMER_ID}" },
              internalNote: { exposure: "omit" },
              name: { exposure: "mask", replacement: "{NAME}" },
            },
            persistence: "ephemeral",
          },
          parse: (input) => input,
        }),
      ],
      { audit },
    );
    const result = await registry.execute({
      actor,
      capability: "customers.lookupMasked",
      input: {},
    });

    expect(result).toMatchObject({
      classification: "personal",
      persistence: "ephemeral",
      rows: [{ email: "{EMAIL}", id: "{CUSTOMER_ID}", name: "{NAME}" }],
    });
    expect(() => assertLiveCapabilityResultPersistable(result)).toThrow(
      "must not be persisted",
    );
    expect(JSON.stringify({ audit: audit.mock.calls, result })).not.toContain(
      "private@example.com",
    );
    expect(JSON.stringify({ audit: audit.mock.calls, result })).not.toContain(
      "never expose",
    );
  });

  it("fails closed for undeclared output fields and persistent personal data", async () => {
    const undeclared = defineLiveCapability<unknown>({
      description: "Unsafe schema drift",
      execute: async () => [{ id: "item-1", leakedEmail: "leak@example.com" }],
      maxRows: 1,
      name: "items.unsafe",
      outputPolicy: {
        auditInput: "include",
        classification: "internal",
        fields: { id: { exposure: "allow" } },
        persistence: "conversation",
      },
      parse: (input) => input,
    });
    await expect(
      createLiveCapabilityRegistry([undeclared]).execute({
        actor,
        capability: "items.unsafe",
        input: {},
      }),
    ).rejects.toThrow("undeclared fields");

    const persistentPersonal = defineLiveCapability<unknown>({
      description: "Invalid personal policy",
      execute: async () => [],
      maxRows: 1,
      name: "items.personal",
      outputPolicy: {
        auditInput: "include",
        classification: "personal",
        fields: { id: { exposure: "allow" } },
        persistence: "conversation",
      },
      parse: (input) => input,
    });
    expect(() => createLiveCapabilityRegistry([persistentPersonal])).toThrow(
      "must be ephemeral with omitted audit input",
    );
  });

  it("rejects non-scalar values even when the field would be omitted", async () => {
    const nestedValue = defineLiveCapability<unknown>({
      description: "Unsafe nested result",
      execute: async () => [
        { id: "item-1", metadata: { email: "leak@example.com" } } as never,
      ],
      maxRows: 1,
      name: "items.nested",
      outputPolicy: {
        auditInput: "include",
        classification: "internal",
        fields: {
          id: { exposure: "allow" },
          metadata: { exposure: "omit" },
        },
        persistence: "conversation",
      },
      parse: (input) => input,
    });

    await expect(
      createLiveCapabilityRegistry([nestedValue]).execute({
        actor,
        capability: "items.nested",
        input: {},
      }),
    ).rejects.toThrow("non-scalar field");
  });

  it("treats object prototype names as undeclared output fields", async () => {
    const prototypeField = defineLiveCapability<unknown>({
      description: "Unsafe prototype-shaped result",
      execute: async () => [{ constructor: "leak@example.com", id: "item-1" }],
      maxRows: 1,
      name: "items.prototype",
      outputPolicy: {
        auditInput: "include",
        classification: "internal",
        fields: { id: { exposure: "allow" } },
        persistence: "conversation",
      },
      parse: (input) => input,
    });

    await expect(
      createLiveCapabilityRegistry([prototypeField]).execute({
        actor,
        capability: "items.prototype",
        input: {},
      }),
    ).rejects.toThrow("undeclared fields");
  });
});
