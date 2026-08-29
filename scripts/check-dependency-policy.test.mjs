import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("workspace dependency override policy is valid", async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "scripts/check-dependency-policy.mjs")],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dependency override policy OK/);
});
