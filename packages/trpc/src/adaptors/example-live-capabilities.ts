import {
  createLiveCapabilityRegistry,
  defineLiveCapability,
  type LiveCapabilityAuditEvent,
} from "@arlequins/agent-core";
import { z } from "zod/v4";

export type ExampleNotice = {
  id: string;
  publishedAt: string;
  tenantId: string;
  title: string;
};

export type ExampleSoldVehicle = {
  id: string;
  model: string;
  soldAt: string;
  tenantId: string;
};

export type ExampleCustomerContact = {
  email: string;
  id: string;
  internalNote: string;
  name: string;
  phone: string;
  tenantId: string;
};

const recentNoticeInput = z.object({
  limit: z.number().int().min(1).max(20).default(20),
  publishedSince: z.iso.datetime({ offset: true }),
});

const soldVehicleInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(100),
    soldFrom: z.iso.datetime({ offset: true }),
    soldTo: z.iso.datetime({ offset: true }),
  })
  .refine(
    ({ soldFrom, soldTo }) => Date.parse(soldFrom) < Date.parse(soldTo),
    "soldFrom must be earlier than soldTo",
  )
  .refine(
    ({ soldFrom, soldTo }) =>
      Date.parse(soldTo) - Date.parse(soldFrom) <= 31 * 24 * 60 * 60 * 1_000,
    "sold vehicle queries are limited to 31 days",
  );

const maskedCustomerInput = z.object({
  customerId: z.string().min(1).max(128),
});

function requirePermission(permissions: readonly string[], permission: string) {
  if (!permissions.includes(permission))
    throw new Error(`Missing live capability permission: ${permission}`);
}

/**
 * Public fake-data adapter. Replace only its data access functions in a derived
 * repository; keep the registry, validation, tenant filters, caps, and audit boundary.
 */
export function createExampleVehicleOperationsCatalog(input: {
  audit?: (event: LiveCapabilityAuditEvent) => Promise<void> | void;
  clock?: () => Date;
  customers?: readonly ExampleCustomerContact[];
  notices: readonly ExampleNotice[];
  vehicles: readonly ExampleSoldVehicle[];
}) {
  return createLiveCapabilityRegistry(
    [
      defineLiveCapability<z.infer<typeof recentNoticeInput>>({
        description: "List recently published notices for the current tenant",
        execute: async ({ actor, input: query }) => {
          requirePermission(actor.permissions, "notices:read");
          return input.notices
            .filter(
              (notice) =>
                notice.tenantId === actor.tenantId &&
                Date.parse(notice.publishedAt) >=
                  Date.parse(query.publishedSince),
            )
            .sort((left, right) =>
              right.publishedAt.localeCompare(left.publishedAt),
            )
            .slice(0, query.limit)
            .map(({ id, publishedAt, title }) => ({ id, publishedAt, title }));
        },
        maxRows: 20,
        name: "notices.listRecent",
        outputPolicy: {
          auditInput: "include",
          classification: "internal",
          fields: {
            id: { exposure: "allow" },
            publishedAt: { exposure: "allow" },
            title: { exposure: "allow" },
          },
          persistence: "conversation",
        },
        parse: (raw) => recentNoticeInput.parse(raw),
        summarizeInput: ({ limit, publishedSince }) => ({
          limit,
          publishedSince,
        }),
      }),
      defineLiveCapability<z.infer<typeof soldVehicleInput>>({
        description: "List sold vehicles in a bounded half-open date range",
        execute: async ({ actor, input: query }) => {
          requirePermission(actor.permissions, "vehicles:read");
          const allowedVehicleIds = new Set(
            actor.permissions
              .filter((permission) => permission.startsWith("vehicle:"))
              .map((permission) => permission.slice("vehicle:".length)),
          );
          return input.vehicles
            .filter(
              (vehicle) =>
                vehicle.tenantId === actor.tenantId &&
                allowedVehicleIds.has(vehicle.id) &&
                Date.parse(vehicle.soldAt) >= Date.parse(query.soldFrom) &&
                Date.parse(vehicle.soldAt) < Date.parse(query.soldTo),
            )
            .sort((left, right) => right.soldAt.localeCompare(left.soldAt))
            .slice(0, query.limit)
            .map(({ id, model, soldAt }) => ({ id, model, soldAt }));
        },
        maxRows: 100,
        name: "vehicles.listSold",
        outputPolicy: {
          auditInput: "include",
          classification: "internal",
          fields: {
            id: { exposure: "allow" },
            model: { exposure: "allow" },
            soldAt: { exposure: "allow" },
          },
          persistence: "conversation",
        },
        parse: (raw) => soldVehicleInput.parse(raw),
        summarizeInput: ({ limit, soldFrom, soldTo }) => ({
          limit,
          soldFrom,
          soldTo,
        }),
      }),
      defineLiveCapability<z.infer<typeof maskedCustomerInput>>({
        description:
          "Confirm an authorized customer contact while masking personal values",
        execute: async ({ actor, input: query }) => {
          requirePermission(actor.permissions, "customers:read:masked");
          return (input.customers ?? [])
            .filter(
              (customer) =>
                customer.tenantId === actor.tenantId &&
                customer.id === query.customerId,
            )
            .slice(0, 1)
            .map(({ email, id, internalNote, name, phone }) => ({
              email,
              id,
              internalNote,
              name,
              phone,
            }));
        },
        maxRows: 1,
        name: "customers.lookupMaskedContact",
        outputPolicy: {
          auditInput: "omit",
          classification: "personal",
          fields: {
            email: { exposure: "mask", replacement: "{EMAIL}" },
            id: { exposure: "mask", replacement: "{CUSTOMER_ID}" },
            internalNote: { exposure: "omit" },
            name: { exposure: "mask", replacement: "{NAME}" },
            phone: { exposure: "mask", replacement: "{PHONE}" },
          },
          persistence: "ephemeral",
        },
        parse: (raw) => maskedCustomerInput.parse(raw),
        summarizeInput: () => ({ lookupByCustomerId: true }),
      }),
    ],
    { audit: input.audit, clock: input.clock },
  );
}
