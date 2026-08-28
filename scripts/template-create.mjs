#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { initializeTemplate, parseArgs } from "./template-init.mjs";

function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

async function assertEmptyTarget(target) {
  try {
    const entries = await readdir(target);
    if (entries.length > 0)
      throw new Error(`Target directory is not empty: ${target}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function createDerivedRepository(options, runtime = {}) {
  if (!options.target?.trim()) throw new Error("--target is required");
  const sourceRoot = resolve(runtime.sourceRoot ?? process.cwd());
  const targetRoot = resolve(runtime.targetRoot ?? options.target);
  if (isInside(sourceRoot, targetRoot))
    throw new Error("--target must be outside the template checkout");
  await assertEmptyTarget(targetRoot);

  const files = runtime.files ?? trackedFiles(sourceRoot);
  if (options.dryRun)
    return { changed: [], files, sourceRoot, targetRoot, written: false };

  await mkdir(targetRoot, { recursive: true });
  for (const relativePath of files) {
    const source = resolve(sourceRoot, relativePath);
    const target = resolve(targetRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    const sourceStat = await stat(source);
    if (sourceStat.mode & 0o111) await chmod(target, sourceStat.mode);
  }

  const changed = await initializeTemplate(
    { ...options, dryRun: false, force: true },
    { files, root: targetRoot },
  );
  return { changed, files, sourceRoot, targetRoot, written: true };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  try {
    const options = parseArgs(process.argv.slice(2), { allowTarget: true });
    const result = await createDerivedRepository(options);
    if (!result.written) {
      console.log(
        `Would copy ${result.files.length} tracked files to ${result.targetRoot}`,
      );
    } else {
      console.log(
        `Created ${options.name} in ${result.targetRoot} from ${result.files.length} tracked files.`,
      );
      console.log(`Customized ${result.changed.length} files.`);
      console.log(
        "Next: pnpm install && pnpm agent:setup && pnpm template:doctor && pnpm check:fix",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(
      "pnpm template:create -- --target ../my-agent --name my-agent --scope @company [--display-name 'My Agent'] [--preset full|minimal] [--features auth,batch,sst,example-ui] [--prune] [--description text] [--domain example.org] [--dry-run]",
    );
    process.exitCode = 1;
  }
}
