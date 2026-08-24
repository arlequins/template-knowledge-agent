export type LiveCapabilityActor = {
  permissions: readonly string[];
  tenantId: string;
  userId: string;
  workspaceId: string;
};

export type LiveCapabilityRow = Readonly<Record<string, unknown>>;

export type LiveCapabilityAuditEvent = {
  actorUserId: string;
  capability: string;
  executedAt: string;
  inputSummary?: Readonly<Record<string, boolean | number | string>>;
  returnedRows: number;
  tenantId: string;
  truncated: boolean;
  workspaceId: string;
};

export type LiveCapabilityResult = {
  capability: string;
  citation: { label: string; locator: string };
  generatedAt: string;
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
    maxRows: number;
    name: string;
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
    readOnly: true,
  };
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
      const rows = executed.rows.slice(0, definition.maxRows);
      await options.audit?.({
        actorUserId: actor.userId,
        capability,
        executedAt: now.toISOString(),
        inputSummary: executed.inputSummary,
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
        generatedAt: now.toISOString(),
        rows,
        truncated,
      };
    },
    list: () =>
      [...catalog.values()].map(({ description, maxRows, name, readOnly }) => ({
        description,
        maxRows,
        name,
        readOnly,
      })),
  };
}
