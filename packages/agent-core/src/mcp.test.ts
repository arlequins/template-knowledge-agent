import { describe, expect, it } from "vitest";

import { createMcpServer } from "./mcp";

const context = {
  headers: new Headers({ authorization: "Bearer test" }),
  roles: ["member"],
  subject: "user-1",
};

describe("createMcpServer", () => {
  it("serves initialize and tool metadata without exposing execution details", async () => {
    const server = createMcpServer({
      name: "knowledge-agent",
      version: "1.0.0",
      tools: [
        {
          description: "Search approved knowledge",
          execute: async () => ({ count: 1 }),
          inputSchema: { type: "object" },
          name: "knowledge.search",
        },
      ],
    });

    await expect(
      server.handle({ id: 1, jsonrpc: "2.0", method: "initialize" }, context),
    ).resolves.toMatchObject({
      result: {
        capabilities: { tools: {} },
        protocolVersion: "2025-06-18",
      },
    });
    await expect(
      server.handle({ id: 2, jsonrpc: "2.0", method: "tools/list" }, context),
    ).resolves.toMatchObject({
      result: { tools: [{ name: "knowledge.search" }] },
    });
  });

  it("authorizes each call and returns structured content", async () => {
    const server = createMcpServer({
      name: "knowledge-agent",
      version: "1.0.0",
      tools: [
        {
          authorize: ({ roles }) => roles.includes("agent:read"),
          description: "Read data",
          execute: async (_context, input) => ({ input }),
          inputSchema: { type: "object" },
          name: "data.read",
        },
      ],
    });

    await expect(
      server.handle(
        {
          id: "denied",
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: {}, name: "data.read" },
        },
        context,
      ),
    ).resolves.toMatchObject({ error: { code: -32001 } });
    await expect(
      server.handle(
        {
          id: "ok",
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: { query: "react" }, name: "data.read" },
        },
        { ...context, roles: ["agent:read"] },
      ),
    ).resolves.toMatchObject({
      result: { structuredContent: { input: { query: "react" } } },
    });
  });

  it("does not leak tool errors to remote callers", async () => {
    const server = createMcpServer({
      name: "knowledge-agent",
      version: "1.0.0",
      tools: [
        {
          description: "Broken tool",
          execute: async () => {
            throw new Error("database password=secret");
          },
          inputSchema: { type: "object" },
          name: "broken",
        },
      ],
    });

    await expect(
      server.handle(
        {
          id: 3,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "broken" },
        },
        context,
      ),
    ).resolves.toMatchObject({
      error: { code: -32000, message: "Tool execution failed" },
    });
  });
});
