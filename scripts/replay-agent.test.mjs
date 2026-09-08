import assert from "node:assert/strict";
import test from "node:test";
import { replayAgent, serializeReplayEvidence } from "./replay-agent.mjs";

test("writes only bounded evaluation evidence, not complete service responses", () => {
  const snapshot = serializeReplayEvidence({
    runtime: {
      behaviorPack: {
        generatedAt: "2026-09-07T00:00:00.000Z",
        model: { provider: "local" },
        version: "daily-test",
      },
      modelId: "local",
      ignored: "not persisted",
    },
    answers: [
      {
        answer: "Grounded answer",
        caseId: "purpose",
        citations: [
          { content: "Evidence", filename: "README.md", locator: "L1" },
        ],
        conversationId: "never persisted",
        latencyMs: 10,
        messageId: "never persisted",
        model: "local",
      },
    ],
  });
  assert.deepEqual(snapshot, {
    runtime: {
      behaviorPack: {
        generatedAt: "2026-09-07T00:00:00.000Z",
        model: '{"provider":"local"}',
        version: "daily-test",
      },
      behaviorPackStatus: null,
      modelId: "local",
      modelProvider: null,
    },
    answers: [
      {
        answer: "Grounded answer",
        caseId: "purpose",
        citationCount: 1,
        citations: [
          { content: "Evidence", filename: "README.md", locator: "L1" },
        ],
        latencyMs: 10,
        model: "local",
      },
    ],
  });
  assert.throws(() =>
    serializeReplayEvidence({
      answers: [
        {
          answer: "x".repeat(100_001),
          caseId: "a",
          citations: [],
          latencyMs: 0,
        },
      ],
    }),
  );
});

test("replays isolated conversations through authenticated application endpoints", async () => {
  const calls = [];
  const responses = [
    { modelId: "test-model" },
    { id: "conversation-1" },
    {
      message: {
        id: "message-1",
        content: "Grounded answer",
        model: "test-model",
      },
    },
    [{ chunkId: "source-1" }],
  ];
  const result = await replayAgent({
    baseUrl: "http://localhost:5000",
    workspaceId: "workspace",
    token: "secret",
    cases: [{ id: "purpose", question: "What is the purpose?" }],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ result: { data: { json: responses.shift() } } });
    },
  });
  assert.equal(result.answers[0].answer, "Grounded answer");
  assert.equal(result.answers[0].citationCount, 1);
  assert.equal(result.answers[0].messageId, "message-1");
  assert.equal(calls[2].url.pathname, "/api/trpc/agent.complete");
  assert.deepEqual(JSON.parse(calls[2].options.body).json, {
    workspaceId: "workspace",
    conversationId: "conversation-1",
    question: "What is the purpose?",
  });
  assert.ok(
    calls.every(
      ({ options }) =>
        options.headers.authorization === "Bearer secret" &&
        options.redirect === "error",
    ),
  );
});

test("rejects insecure remote destinations and invalid suites before sending credentials", async () => {
  for (const baseUrl of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/?token=value",
  ])
    await assert.rejects(
      replayAgent({
        baseUrl,
        token: "secret",
        workspaceId: "workspace",
        cases: [{ id: "a", question: "Q" }],
        fetchImpl: () => assert.fail("Must not send a request"),
      }),
    );
  await assert.rejects(
    replayAgent({
      baseUrl: "http://localhost:5000",
      token: "secret",
      workspaceId: "workspace",
      cases: [],
      fetchImpl: () => assert.fail("Must not send a request"),
    }),
  );
});

test("authentication failures stop the run without disclosing response contents", async () => {
  await assert.rejects(
    replayAgent({
      baseUrl: "http://localhost:5000",
      token: "secret",
      workspaceId: "workspace",
      cases: [{ id: "a", question: "Q" }],
      fetchImpl: async () => new Response("private detail", { status: 401 }),
    }),
    { message: "Replay runtimeInfo failed (HTTP 401)" },
  );
});
