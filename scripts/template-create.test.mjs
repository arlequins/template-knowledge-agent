import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { createDerivedRepository } from "./template-create.mjs";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "knowledge-template-create-"));
  const sourceRoot = resolve(root, "source");
  const targetRoot = resolve(root, "derived");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    resolve(sourceRoot, "package.json"),
    `${JSON.stringify({ name: "template-knowledge-agent" }, null, 2)}\n`,
  );
  await writeFile(
    resolve(sourceRoot, "README.md"),
    "# Knowledge Agent Template\n\n@arlequins/template-knowledge-agent\n",
  );
  return { root, sourceRoot, targetRoot };
}

const options = {
  name: "pilot-agent",
  scope: "@example",
  target: "unused",
};

test("creates and initializes a derived repository outside the checkout", async () => {
  const { sourceRoot, targetRoot } = await fixture();
  const result = await createDerivedRepository(options, {
    files: ["package.json", "README.md"],
    sourceRoot,
    targetRoot,
  });

  assert.equal(result.written, true);
  assert.equal(
    JSON.parse(await readFile(resolve(targetRoot, "package.json"), "utf8"))
      .name,
    "pilot-agent",
  );
  assert.match(
    await readFile(resolve(targetRoot, "README.md"), "utf8"),
    /@example\/pilot-agent/,
  );
});

test("refuses a non-empty target", async () => {
  const { sourceRoot, targetRoot } = await fixture();
  await mkdir(targetRoot, { recursive: true });
  await writeFile(resolve(targetRoot, "keep.txt"), "owned by the user\n");

  await assert.rejects(
    createDerivedRepository(options, {
      files: ["package.json", "README.md"],
      sourceRoot,
      targetRoot,
    }),
    /Target directory is not empty/,
  );
});

test("refuses a target inside the template checkout", async () => {
  const { sourceRoot } = await fixture();
  await assert.rejects(
    createDerivedRepository(options, {
      files: ["package.json", "README.md"],
      sourceRoot,
      targetRoot: resolve(sourceRoot, "derived"),
    }),
    /outside the template checkout/,
  );
});
