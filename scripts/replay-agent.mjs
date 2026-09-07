import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
    const result = await replayAgent({
      baseUrl,
      workspaceId,
      cases: manifest.cases,
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: direct CLI credential, never a cached Turbo task.
      token: process.env.AGENT_REPLAY_TOKEN,
    });
    const directory = resolve(".local/evaluations");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const id = new Date().toISOString().replaceAll(":", "-");
    await writeFile(
      resolve(directory, `${id}.answers.json`),
      JSON.stringify(result.answers, null, 2),
      { flag: "wx", mode: 0o600 },
    );
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
