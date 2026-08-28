import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root =
  process.argv[2] === "--root" && process.argv[3]
    ? resolve(process.argv[3])
    : fileURLToPath(new URL("..", import.meta.url));
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs"]);

const boundaries = [
  {
    directory: "packages/service/src",
    forbidden: [
      /^@arlequins\//,
      /^@aws-sdk\//,
      /^@trpc\//,
      /^zod(?:\/|$)/,
      /^drizzle-orm(?:\/|$)/,
      /^hono(?:\/|$)/,
    ],
    reason: "application and domain layers cannot depend on infrastructure",
  },
  {
    directory: "packages/auth/src/domain",
    forbidden: [/^@arlequins\//, /^jose(?:\/|$)/, /^zod(?:\/|$)/],
    reason: "the authentication domain must remain framework independent",
  },
  {
    directory: "packages/auth/src/application",
    forbidden: [/^@arlequins\//, /^jose(?:\/|$)/, /^zod(?:\/|$)/],
    reason:
      "authentication use cases may only depend on domain types and ports",
  },
  {
    directory: "packages/trpc/src/router",
    forbidden: [
      /^@arlequins\/db-/,
      /^@arlequins\/env(?:\/|$)/,
      /^@arlequins\/s3-cache(?:\/|$)/,
      /^@aws-sdk\//,
      /^drizzle-orm(?:\/|$)/,
    ],
    reason: "transport routers must call use cases instead of infrastructure",
  },
  {
    directory: "apps/batch/lib/usecases",
    forbidden: [/^@arlequins\/db-/, /^@aws-sdk\//, /^drizzle-orm(?:\/|$)/],
    reason: "batch use cases receive infrastructure through ports",
  },
];

// Feature slices are intentionally checked by path rather than by package
// exports. This keeps the rule useful in generated repositories where the
// number of features is not known by the template.
const featureBoundaries = [
  {
    directory: "packages/service/src/features",
    match: /\/domain\.ts$/,
    forbidden: [
      /^@arlequins\//,
      /^@aws-sdk\//,
      /^@trpc\//,
      /(?:^|\/)application(?:\/|$)/,
      /(?:^|\/)adapter(?:s)?(?:\/|$)/,
      /(?:^|\/)router(?:\/|$)/,
    ],
    reason: "feature domain code may only contain framework-free policy",
  },
  {
    directory: "packages/service/src/features",
    match: /\/application(?:\/|$)/,
    forbidden: [
      /^@arlequins\//,
      /^@aws-sdk\//,
      /^@trpc\//,
      /^drizzle-orm(?:\/|$)/,
      /(?:^|\/)adapter(?:s)?(?:\/|$)/,
      /(?:^|\/)router(?:\/|$)/,
    ],
    reason: "feature application code may depend only on domain and ports",
  },
  {
    directory: "packages/trpc/src/features",
    match: /\/router\.ts$/,
    forbidden: [
      /^@arlequins\/db-/,
      /^@arlequins\/env(?:\/|$)/,
      /^@aws-sdk\//,
      /^drizzle-orm(?:\/|$)/,
    ],
    reason: "feature routers must call composition and validate transport only",
  },
  {
    directory: "packages/trpc/src/features",
    match: /\/composition\.ts$/,
    forbidden: [/^@trpc\//, /^hono(?:\/|$)/],
    reason: "feature composition must not depend on delivery frameworks",
  },
];

const importPattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;

async function sourceFiles(directory) {
  const absolute = join(root, directory);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT")
      return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative(root, path));
      return sourceExtensions.has(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

const violations = [];
for (const boundary of [...boundaries, ...featureBoundaries]) {
  for (const file of await sourceFiles(boundary.directory)) {
    if (boundary.match && !boundary.match.test(file)) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[2];
      if (boundary.forbidden.some((pattern) => pattern.test(specifier))) {
        violations.push(
          `${relative(root, file)} imports ${specifier}: ${boundary.reason}`,
        );
      }
    }
  }
}

for (const directory of [
  "packages/service/src/features",
  "packages/trpc/src/features",
]) {
  for (const file of await sourceFiles(directory)) {
    const normalized = relative(root, file).replaceAll("\\", "/");
    const match = normalized.match(/\/features\/([^/]+)\//);
    if (!match?.[1]) continue;
    const feature = match[1];

    const source = await readFile(file, "utf8");
    for (const importMatch of source.matchAll(importPattern)) {
      const specifier = importMatch[2];
      const referenced = specifier.match(/(?:^|\/)features\/([^/]+)(?:\/|$)/);
      const relativeTarget = specifier.startsWith(".")
        ? relative(root, resolve(dirname(file), specifier)).replaceAll(
            "\\",
            "/",
          )
        : "";
      const relativeReferenced = relativeTarget.match(
        /(?:^|\/)features\/([^/]+)(?:\/|$)/,
      );
      const referencedFeature = referenced?.[1] ?? relativeReferenced?.[1];
      if (referencedFeature && referencedFeature !== feature) {
        violations.push(
          `${normalized} imports feature ${referencedFeature} directly: feature slices must communicate through published application ports or contracts`,
        );
      }
      if (specifier.includes("/adaptors/")) {
        violations.push(
          `${normalized} imports legacy /adaptors/ path: use /adapters/ in new feature slices`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    ["Architecture boundary violations:", ...violations].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries are valid.");
}
