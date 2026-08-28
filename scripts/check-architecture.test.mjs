import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";

const checker = resolve(import.meta.dirname, "check-architecture.mjs");

async function runFixture(relativePath, source) {
  const root = await mkdtemp(join(tmpdir(), "architecture-fixture-"));
  const file = join(root, relativePath);
  await mkdir(dirname(file), {
    recursive: true,
  });
  await writeFile(file, source, "utf8");
  const result = spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8",
  });
  await rm(root, { force: true, recursive: true });
  return result;
}

describe("architecture boundary checker", () => {
  it("accepts a framework-free feature domain", async () => {
    const result = await runFixture(
      "packages/service/src/features/sample/domain.ts",
      "export type Sample = { value: string };\n",
    );
    assert.equal(result.status, 0, result.stderr);
  });

  it("rejects infrastructure imports from a feature domain", async () => {
    const result = await runFixture(
      "packages/service/src/features/sample/domain.ts",
      'import { z } from "zod"; export const schema = z.string();\n',
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Architecture boundary violations/);
  });

  it("rejects infrastructure imports from feature application code", async () => {
    const result = await runFixture(
      "packages/service/src/features/sample/application/use-cases/sample.ts",
      'import { db } from "@arlequins/db-backbone"; export const run = db;\n',
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /feature application code/);
  });

  it("rejects direct database imports from feature routers", async () => {
    const result = await runFixture(
      "packages/trpc/src/features/sample/router.ts",
      'import { db } from "@arlequins/db-backbone"; export const router = db;\n',
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /feature routers/);
  });

  it("rejects private cross-feature imports", async () => {
    const result = await runFixture(
      "packages/service/src/features/sample/domain.ts",
      'import type { Other } from "../other/domain"; export type Sample = Other;\n',
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /imports feature other directly/);
  });
});
