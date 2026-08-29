import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const workspaceYaml = await readFile(
  path.join(root, "pnpm-workspace.yaml"),
  "utf8",
);

if (packageJson.pnpm?.overrides) {
  throw new Error(
    "Root package.json must not define pnpm.overrides; use pnpm-workspace.yaml.",
  );
}

const expectedOverrides = {
  "@types/minimatch": "6.0.0",
  "brace-expansion": "2.1.4",
  esbuild: "0.28.1",
  lightningcss: "1.32.0",
  nanoid: "3.3.18",
  postcss: "8.5.24",
  sharp: "0.35.4",
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const [name, version] of Object.entries(expectedOverrides)) {
  const key = escapeRegExp(name);
  const pinnedVersion = escapeRegExp(version);
  const pattern = new RegExp(
    `^\\s+['\\"]?${key}['\\"]?:\\s*${pinnedVersion}\\s*$`,
    "m",
  );
  if (!pattern.test(workspaceYaml)) {
    throw new Error(
      `Missing workspace dependency override: ${name}@${version}`,
    );
  }
}

console.log(
  `Dependency override policy OK (${Object.keys(expectedOverrides).length} pins)`,
);
