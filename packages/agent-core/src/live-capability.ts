export type LiveCapabilityActor = {
  permissions: readonly string[];
  tenantId: string;
  userId: string;
  workspaceId: string;
};

export type LiveCapabilityScalar = boolean | null | number | string;

export type LiveCapabilityRow = Readonly<Record<string, LiveCapabilityScalar>>;

export type LiveCapabilityDataClassification =
  | "internal"
  | "personal"
  | "public";

export type LiveCapabilityPersistence = "conversation" | "ephemeral";

export type LiveCapabilityFieldPolicy =
  | { exposure: "allow" }
  | { exposure: "mask"; replacement: string }
  | { exposure: "omit" };

export type LiveCapabilityOutputPolicy = {
  auditInput: "include" | "omit";
  classification: LiveCapabilityDataClassification;
  fields: Readonly<Record<string, LiveCapabilityFieldPolicy>>;
  persistence: LiveCapabilityPersistence;
};

export type LiveCapabilityAuditEvent = {
  actorUserId: string;
  capability: string;
  classification: LiveCapabilityDataClassification;
  executedAt: string;
  inputSummary?: Readonly<Record<string, boolean | number | string>>;
  returnedRows: number;
  persistence: LiveCapabilityPersistence;
  tenantId: string;
  truncated: boolean;
  workspaceId: string;
};

export type LiveCapabilityResult = {
  capability: string;
  citation: { label: string; locator: string };
  classification: LiveCapabilityDataClassification;
  generatedAt: string;
  persistence: LiveCapabilityPersistence;
  rows: readonly LiveCapabilityRow[];
  truncated: boolean;
};

export type LiveCapabilityDefinition = {
  description: string;
  execute(input: {
    actor: LiveCapabilityActor;
    now: Date;
    rawInput: unknown;
  }): Promise<{
    inputSummary?: Readonly<Record<string, boolean | number | string>>;
    rows: readonly LiveCapabilityRow[];
  }>;
  maxRows: number;
  name: string;
  outputPolicy: LiveCapabilityOutputPolicy;
  readOnly: true;
};

export type LiveCapabilityRegistry = {
  execute(input: {
    actor: LiveCapabilityActor;
    capability: string;
    input: unknown;
  }): Promise<LiveCapabilityResult>;
  list(): Array<{
    description: string;
    classification: LiveCapabilityDataClassification;
    maxRows: number;
    name: string;
    persistence: LiveCapabilityPersistence;
    readOnly: true;
  }>;
};

export function defineLiveCapability<T>(input: {
  description: string;
  execute(input: {
    actor: LiveCapabilityActor;
    input: T;
    now: Date;
  }): Promise<readonly LiveCapabilityRow[]>;
  maxRows: number;
  name: string;
  outputPolicy: LiveCapabilityOutputPolicy;
  parse(input: unknown): T;
  summarizeInput?(
    input: T,
  ): Readonly<Record<string, boolean | number | string>>;
}): LiveCapabilityDefinition {
  return {
    description: input.description,
    async execute({ actor, now, rawInput }) {
      const parsed = input.parse(rawInput);
      return {
        inputSummary: input.summarizeInput?.(parsed),
        rows: await input.execute({ actor, input: parsed, now }),
      };
    },
    maxRows: input.maxRows,
    name: input.name,
    outputPolicy: input.outputPolicy,
    readOnly: true,
  };
}

function validateOutputPolicy(
  name: string,
  policy: LiveCapabilityOutputPolicy,
) {
  const entries = Object.entries(policy.fields);
  if (entries.length === 0)
    throw new Error(`Live capability has no allowed output fields: ${name}`);
  if (
    policy.classification === "personal" &&
    (policy.persistence !== "ephemeral" || policy.auditInput !== "omit")
  )
    throw new Error(
      `Personal live capability must be ephemeral with omitted audit input: ${name}`,
    );
  for (const [field, rule] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field))
      throw new Error(`Invalid live capability output field: ${name}.${field}`);
    if (
      rule.exposure === "mask" &&
      (!rule.replacement || rule.replacement.length > 64)
    )
      throw new Error(`Invalid live capability mask: ${name}.${field}`);
  }
}

function applyOutputPolicy(
  name: string,
  row: LiveCapabilityRow,
  policy: LiveCapabilityOutputPolicy,
): LiveCapabilityRow {
  const unexpected = Object.keys(row).filter(
    (field) => !Object.hasOwn(policy.fields, field),
  );
  if (unexpected.length > 0)
    throw new Error(
      `Live capability returned undeclared fields: ${name}.${unexpected.join(",")}`,
    );
  const output: Record<string, LiveCapabilityScalar> = {};
  for (const [field, value] of Object.entries(row)) {
    const rule = policy.fields[field];
    if (
      value !== null &&
      typeof value !== "boolean" &&
      typeof value !== "number" &&
      typeof value !== "string"
    )
      throw new Error(
        `Live capability returned a non-scalar field: ${name}.${field}`,
      );
    if (!rule || rule.exposure === "omit") continue;
    output[field] = rule.exposure === "mask" ? rule.replacement : value;
  }
  return output;
}

export function assertLiveCapabilityResultPersistable(
  result: LiveCapabilityResult,
): void {
  if (result.persistence === "ephemeral")
    throw new Error(
      `Live capability result must not be persisted: ${result.capability}`,
    );
}

export function createLiveCapabilityRegistry(
  definitions: readonly LiveCapabilityDefinition[],
  options: {
    audit?: (event: LiveCapabilityAuditEvent) => Promise<void> | void;
    clock?: () => Date;
  } = {},
): LiveCapabilityRegistry {
  const catalog = new Map<string, LiveCapabilityDefinition>();
  for (const definition of definitions) {
    if (!/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/.test(definition.name))
      throw new Error(`Invalid live capability name: ${definition.name}`);
    if (
      !Number.isInteger(definition.maxRows) ||
      definition.maxRows < 1 ||
      definition.maxRows > 1_000
    )
      throw new Error(`Invalid maximum row count: ${definition.name}`);
    if (catalog.has(definition.name))
      throw new Error(`Duplicate live capability: ${definition.name}`);
    validateOutputPolicy(definition.name, definition.outputPolicy);
    catalog.set(definition.name, definition);
  }

  return {
    async execute({ actor, capability, input }) {
      const definition = catalog.get(capability);
      if (!definition)
        throw new Error(`Unknown live capability: ${capability}`);
      const now = options.clock?.() ?? new Date();
      const executed = await definition.execute({
        actor,
        now,
        rawInput: input,
      });
      const truncated = executed.rows.length > definition.maxRows;
      const rows = executed.rows
        .slice(0, definition.maxRows)
        .map((row) =>
          applyOutputPolicy(definition.name, row, definition.outputPolicy),
        );
      await options.audit?.({
        actorUserId: actor.userId,
        capability,
        classification: definition.outputPolicy.classification,
        executedAt: now.toISOString(),
        ...(definition.outputPolicy.auditInput === "include" &&
        executed.inputSummary
          ? { inputSummary: executed.inputSummary }
          : {}),
        persistence: definition.outputPolicy.persistence,
        returnedRows: rows.length,
        tenantId: actor.tenantId,
        truncated,
        workspaceId: actor.workspaceId,
      });
      return {
        capability,
        citation: {
          label: `Live capability: ${capability}`,
          locator: `live://${capability}/${now.toISOString()}`,
        },
        classification: definition.outputPolicy.classification,
        generatedAt: now.toISOString(),
        persistence: definition.outputPolicy.persistence,
        rows,
        truncated,
      };
    },
    list: () =>
      [...catalog.values()].map(
        ({ description, maxRows, name, outputPolicy, readOnly }) => ({
          classification: outputPolicy.classification,
          description,
          maxRows,
          name,
          persistence: outputPolicy.persistence,
          readOnly,
        }),
      ),
  };
}
