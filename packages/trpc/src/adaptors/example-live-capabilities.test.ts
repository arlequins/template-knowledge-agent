import { describe, expect, it, vi } from "vitest";

import { createExampleVehicleOperationsCatalog } from "./example-live-capabilities";

const clock = () => new Date("2026-08-25T00:00:00.000Z");
const baseActor = {
  permissions: [
    "customers:read:masked",
    "notices:read",
    "vehicles:read",
    "vehicle:vehicle-visible",
  ],
  tenantId: "tenant-a",
  userId: "user-1",
  workspaceId: "workspace-1",
};

function catalog(audit = vi.fn()) {
  return {
    audit,
    value: createExampleVehicleOperationsCatalog({
      audit,
      clock,
      customers: [
        {
          email: "private@example.com",
          id: "customer-visible",
          internalNote: "Never expose this account note",
          name: "Private Person",
          phone: "+81-90-1234-5678",
          tenantId: "tenant-a",
        },
        {
          email: "other@example.com",
          id: "customer-other-tenant",
          internalNote: "Other tenant note",
          name: "Other Tenant Person",
          phone: "+81-90-9999-9999",
          tenantId: "tenant-b",
        },
      ],
      notices: [
        {
          id: "notice-visible",
          publishedAt: "2026-08-24T12:00:00.000Z",
          tenantId: "tenant-a",
          title: "Visible notice",
        },
        {
          id: "notice-private",
          publishedAt: "2026-08-24T13:00:00.000Z",
          tenantId: "tenant-b",
          title: "Other tenant notice",
        },
      ],
      vehicles: [
        {
          id: "vehicle-visible",
          model: "Pilot hatchback",
          soldAt: "2026-08-24T08:00:00.000Z",
          tenantId: "tenant-a",
        },
        {
          id: "vehicle-not-authorized",
          model: "Hidden coupe",
          soldAt: "2026-08-24T09:00:00.000Z",
          tenantId: "tenant-a",
        },
        {
          id: "vehicle-other-tenant",
          model: "Other tenant van",
          soldAt: "2026-08-24T10:00:00.000Z",
          tenantId: "tenant-b",
        },
      ],
    }),
  };
}

describe("example vehicle operations capabilities", () => {
  it("returns only current-tenant notices and audits metadata", async () => {
    const { audit, value } = catalog();
    const result = await value.execute({
      actor: baseActor,
      capability: "notices.listRecent",
      input: { limit: 20, publishedSince: "2026-08-24T00:00:00.000Z" },
    });

    expect(result.rows).toEqual([
      {
        id: "notice-visible",
        publishedAt: "2026-08-24T12:00:00.000Z",
        title: "Visible notice",
      },
    ]);
    expect(JSON.stringify(audit.mock.calls)).not.toContain("Visible notice");
  });

  it("preserves tenant, vehicle scope, and half-open date boundaries", async () => {
    const { value } = catalog();
    await expect(
      value.execute({
        actor: baseActor,
        capability: "vehicles.listSold",
        input: {
          limit: 100,
          soldFrom: "2026-08-24T08:00:00.000Z",
          soldTo: "2026-08-25T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          id: "vehicle-visible",
          model: "Pilot hatchback",
          soldAt: "2026-08-24T08:00:00.000Z",
        },
      ],
    });
  });

  it("rejects an excessive date range and missing permission", async () => {
    const { value } = catalog();
    await expect(
      value.execute({
        actor: baseActor,
        capability: "vehicles.listSold",
        input: {
          soldFrom: "2026-06-01T00:00:00.000Z",
          soldTo: "2026-08-25T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("31 days");
    await expect(
      value.execute({
        actor: { ...baseActor, permissions: [] },
        capability: "notices.listRecent",
        input: { publishedSince: "2026-08-24T00:00:00.000Z" },
      }),
    ).rejects.toThrow("notices:read");
  });

  it("masks personal contact fields and marks the result ephemeral", async () => {
    const { audit, value } = catalog();
    const result = await value.execute({
      actor: baseActor,
      capability: "customers.lookupMaskedContact",
      input: { customerId: "customer-visible" },
    });

    expect(result).toMatchObject({
      classification: "personal",
      persistence: "ephemeral",
      rows: [
        {
          email: "{EMAIL}",
          id: "{CUSTOMER_ID}",
          name: "{NAME}",
          phone: "{PHONE}",
        },
      ],
    });
    const serialized = JSON.stringify({ audit: audit.mock.calls, result });
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("Private Person");
    expect(serialized).not.toContain("Never expose");

    await expect(
      value.execute({
        actor: baseActor,
        capability: "customers.lookupMaskedContact",
        input: { customerId: "customer-other-tenant" },
      }),
    ).resolves.toMatchObject({ rows: [] });
  });
});
