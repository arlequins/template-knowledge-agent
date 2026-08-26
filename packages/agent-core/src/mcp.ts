export type McpRequestContext = {
  headers: Headers;
  roles: readonly string[];
  subject: string;
};

export type McpToolDefinition = {
  authorize?: (
    context: McpRequestContext,
    input: unknown,
  ) => boolean | Promise<boolean>;
  description: string;
  execute: (context: McpRequestContext, input: unknown) => Promise<unknown>;
  inputSchema: Record<string, unknown>;
  name: string;
};

export type McpRequest = {
  id?: number | string | null;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type McpResponse = {
  error?: { code: number; message: string };
  id: number | string | null;
  jsonrpc: "2.0";
  result?: unknown;
};

const PROTOCOL_VERSION = "2025-06-18";

function errorResponse(
  id: McpResponse["id"],
  code: number,
  message: string,
): McpResponse {
  return { error: { code, message }, id, jsonrpc: "2.0" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Protocol-neutral MCP request handling. Authentication is intentionally
 * supplied by the HTTP adapter; tools still authorize every call.
 */
export function createMcpServer(input: {
  name: string;
  version: string;
  tools: readonly McpToolDefinition[];
}) {
  const names = new Set<string>();
  for (const tool of input.tools) {
    if (!tool.name.trim() || names.has(tool.name))
      throw new Error(`Duplicate or empty MCP tool: ${tool.name}`);
    names.add(tool.name);
  }

  return {
    async handle(
      request: McpRequest,
      context: McpRequestContext,
    ): Promise<McpResponse | undefined> {
      const id = request.id ?? null;
      if (request.method === "notifications/initialized") return undefined;
      if (request.jsonrpc !== "2.0" || typeof request.method !== "string")
        return errorResponse(id, -32600, "Invalid JSON-RPC request");

      if (request.method === "initialize") {
        return {
          id,
          jsonrpc: "2.0",
          result: {
            capabilities: { tools: {} },
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: { name: input.name, version: input.version },
          },
        };
      }
      if (request.method === "tools/list") {
        return {
          id,
          jsonrpc: "2.0",
          result: {
            tools: input.tools.map(({ description, inputSchema, name }) => ({
              description,
              inputSchema,
              name,
            })),
          },
        };
      }
      if (request.method !== "tools/call")
        return errorResponse(id, -32601, "Method not found");

      if (!isRecord(request.params) || typeof request.params.name !== "string")
        return errorResponse(id, -32602, "Tool name is required");
      const params = request.params;
      const tool = input.tools.find(({ name }) => name === params.name);
      if (!tool) return errorResponse(id, -32602, "Unknown tool");
      const toolInput = params.arguments ?? {};
      if (tool.authorize && !(await tool.authorize(context, toolInput)))
        return errorResponse(id, -32001, "Tool access denied");

      try {
        const result = await tool.execute(context, toolInput);
        return {
          id,
          jsonrpc: "2.0",
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          },
        };
      } catch {
        return errorResponse(id, -32000, "Tool execution failed");
      }
    },
    listTools: () =>
      input.tools.map(({ description, inputSchema, name }) => ({
        description,
        inputSchema,
        name,
      })),
  };
}

export type McpServer = ReturnType<typeof createMcpServer>;
