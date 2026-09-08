import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_ANSWER_CHARS = 100_000;
const MAX_CITATION_CHARS = 50_000;
const MAX_CITATIONS = 12;
const MAX_IDENTIFIER_CHARS = 256;

function boundedString(value, field, limit) {
  if (typeof value !== "string" || value.length > limit)
    throw new Error(`Replay returned an invalid ${field}`);
  return value;
}

function boundedBehaviorPack(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Replay returned an invalid behavior pack");
  return {
    generatedAt: boundedString(
      value.generatedAt,
      "behavior pack timestamp",
      MAX_IDENTIFIER_CHARS,
    ),
    model:
      value.model == null
        ? null
        : boundedString(
            JSON.stringify(value.model),
            "behavior pack model",
            MAX_IDENTIFIER_CHARS,
          ),
    version: boundedString(
      value.version,
      "behavior pack version",
      MAX_IDENTIFIER_CHARS,
    ),
  };
}

/**
 * Converts untrusted HTTP responses into a bounded evidence record. These
 * records are review artifacts only and are never loaded as configuration,
 * code, prompts, or executable input.
 */
export function serializeReplayEvidence(result) {
  if (!Array.isArray(result?.answers))
    throw new Error("Replay returned invalid answers");
  const answers = result.answers.map((answer) => {
    if (
      !Array.isArray(answer.citations) ||
      answer.citations.length > MAX_CITATIONS
    )
      throw new Error("Replay returned invalid citations");
    return {
      answer: boundedString(answer.answer, "answer", MAX_ANSWER_CHARS),
      caseId: boundedString(answer.caseId, "case id", MAX_IDENTIFIER_CHARS),
      citationCount: answer.citations.length,
      citations: answer.citations.map((citation) => ({
        content: boundedString(
          citation.content,
          "citation content",
          MAX_CITATION_CHARS,
        ),
        filename: boundedString(
          citation.filename,
          "citation filename",
          MAX_IDENTIFIER_CHARS,
        ),
        locator:
          citation.locator == null
            ? null
            : boundedString(
                citation.locator,
                "citation locator",
                MAX_IDENTIFIER_CHARS,
              ),
      })),
      latencyMs:
        Number.isSafeInteger(answer.latencyMs) && answer.latencyMs >= 0
          ? answer.latencyMs
          : 0,
      model:
        answer.model == null
          ? null
          : boundedString(answer.model, "model", MAX_IDENTIFIER_CHARS),
    };
  });
  const runtime = {
    behaviorPack: boundedBehaviorPack(result.runtime?.behaviorPack),
    behaviorPackStatus:
      result.runtime?.behaviorPackStatus == null
        ? null
        : boundedString(
            result.runtime.behaviorPackStatus,
            "behavior pack status",
            MAX_IDENTIFIER_CHARS,
          ),
    modelId:
      result.runtime?.modelId == null
        ? null
        : boundedString(
            result.runtime.modelId,
            "model id",
            MAX_IDENTIFIER_CHARS,
          ),
    modelProvider:
      result.runtime?.modelProvider == null
        ? null
        : boundedString(
            result.runtime.modelProvider,
            "model provider",
            MAX_IDENTIFIER_CHARS,
          ),
  };
  return { answers, runtime };
}

/** Exercise the same authenticated completion and persistence path as the UI. */
export async function replayAgent({
  baseUrl,
  token,
  workspaceId,
  cases,
  fetchImpl = fetch,
}) {
  const base = new URL(baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      ))
  )
    throw new Error(
      "Use HTTPS or a loopback HTTP API URL without credentials, query, or fragment",
    );
  if (
    !token ||
    !workspaceId ||
    !cases.length ||
    new Set(cases.map((item) => item.id)).size !== cases.length
  )
    throw new Error("Token, workspace, and nonempty unique cases are required");
  for (const item of cases)
    if (!item.id || !item.question?.trim())
      throw new Error("Every case needs an id and question");
  async function rpc(name, input, mutation = false) {
    const url = new URL(`/api/trpc/agent.${name}`, base);
    const data = JSON.stringify({ json: input });
    if (!mutation) url.searchParams.set("input", data);
    const response = await fetchImpl(url, {
      method: mutation ? "POST" : "GET",
      redirect: "error",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(mutation ? { body: data } : {}),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok)
      throw new Error(`Replay ${name} failed (HTTP ${response.status})`);
    const payload = await response.json();
    if (payload.error || !payload.result?.data)
      throw new Error(`Replay ${name} returned an invalid response`);
    return payload.result.data.json;
  }
  const runtime = await rpc("runtimeInfo", { workspaceId });
  const answers = [];
  for (const item of cases) {
    const conversation = await rpc(
      "createConversation",
      { workspaceId, title: `Evaluation: ${item.id}` },
      true,
    );
    const started = Date.now();
    const { message } = await rpc(
      "complete",
      { workspaceId, conversationId: conversation.id, question: item.question },
      true,
    );
    const latencyMs = Date.now() - started;
    const citations = await rpc("messageCitations", {
      workspaceId,
      messageId: message.id,
    });
    if (typeof message.content !== "string" || !Array.isArray(citations))
      throw new Error("Replay returned invalid message or citations");
    answers.push({
      caseId: item.id,
      answer: message.content,
      citationCount: citations.length,
      citations,
      latencyMs,
      conversationId: conversation.id,
      messageId: message.id,
      model: message.model,
    });
  }
  return { runtime, answers };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [baseUrl, workspaceId, casesPath] = process.argv.slice(2);
    if (!baseUrl || !workspaceId || !casesPath)
      throw new Error(
        "Usage: pnpm pilot:replay <api-url> <workspace-id> <cases.json>; set AGENT_REPLAY_TOKEN",
      );
    const manifest = JSON.parse(await readFile(resolve(casesPath), "utf8"));
    const result = serializeReplayEvidence(
      await replayAgent({
        baseUrl,
        workspaceId,
        cases: manifest.cases,
        // biome-ignore lint/suspicious/noUndeclaredEnvVars: direct CLI credential, never a cached Turbo task.
        token: process.env.AGENT_REPLAY_TOKEN,
      }),
    );
    const directory = resolve(".local/evaluations");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const id = new Date().toISOString().replaceAll(":", "-");
    // codeql[js/http-to-file-access]: Bounded review evidence stays in ignored .local storage and is never executed or loaded as configuration.
    await writeFile(
      resolve(directory, `${id}.answers.json`),
      JSON.stringify(result.answers, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    // codeql[js/http-to-file-access]: Bounded metadata snapshot stays in ignored .local storage and is never executed or loaded as configuration.
    await writeFile(
      resolve(directory, `${id}.runtime.json`),
      JSON.stringify(result.runtime, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      `Replayed ${result.answers.length} cases. Private results: .local/evaluations/${id}.answers.json`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Replay failed");
    process.exitCode = 1;
  }
}
