import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBehaviorPackManifest } from "@arlequins/tuning-kit";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function pathInside(base: string, value: string) {
  const candidate = resolve(REPOSITORY_ROOT, value);
  const fromBase = relative(resolve(REPOSITORY_ROOT, base), candidate);
  if (fromBase === "" || fromBase === ".." || fromBase.startsWith(`..${sep}`))
    throw new Error(`Path must stay under ${base}/`);
  return candidate;
}

/** Atomically restores one immutable, validated release as the active pack. */
export async function rollbackBehaviorPack(options: {
  outputPath: string;
  releasePath: string;
}) {
  const serialized = await readFile(options.releasePath, "utf8");
  const manifest = parseBehaviorPackManifest(JSON.parse(serialized));
  if (!manifest) throw new Error("Rollback release manifest is invalid");
  await mkdir(dirname(options.outputPath), { recursive: true });
  const temporaryPath = `${options.outputPath}.rollback-${randomUUID()}`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, undefined, 2)}\n`,
      { flag: "wx" },
    );
    await rename(temporaryPath, options.outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return { outputPath: options.outputPath, version: manifest.version };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const release = argument("--release");
  if (!release) throw new Error("--release is required");
  const releasePath = pathInside(".local/tuning/releases", release);
  const outputPath = pathInside(
    ".local/tuning",
    argument("--output") ?? ".local/tuning/active-behavior-pack.json",
  );
  console.log(
    JSON.stringify(
      await rollbackBehaviorPack({ outputPath, releasePath }),
      undefined,
      2,
    ),
  );
}
