import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
export const PUBLIC_API_TARGETS = Object.freeze([
  Object.freeze({
    packageName: "@arlequins/agent-core",
    source: "packages/agent-core/src/index.ts",
    baseline: "agent-core.json",
  }),
  Object.freeze({
    packageName: "@arlequins/tuning-kit",
    source: "packages/tuning-kit/src/index.ts",
    baseline: "tuning-kit.json",
  }),
]);

const SNAPSHOT_SCHEMA_VERSION = 1;
const BASELINE_SCHEMA_VERSION = 1;
const IMPACT_RANK = Object.freeze({ none: 0, minor: 1, major: 2 });
const FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.InTypeAlias |
  ts.TypeFormatFlags.WriteTypeArgumentsOfSignature |
  ts.TypeFormatFlags.UseStructuralFallback;

function canonicalJson(value) {
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeSignature(value, repositoryRoot) {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll(repositoryRoot.replaceAll("\\", "/"), "<repo>")
    .replaceAll(/import\("[^"]+"\)\./g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function symbolType(checker, symbol, sourceFile) {
  const resolved =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const isDeclaredType =
    resolved.flags &
    (ts.SymbolFlags.Class |
      ts.SymbolFlags.Enum |
      ts.SymbolFlags.Interface |
      ts.SymbolFlags.TypeAlias |
      ts.SymbolFlags.TypeParameter);
  const type = isDeclaredType
    ? checker.getDeclaredTypeOfSymbol(resolved)
    : checker.getTypeOfSymbolAtLocation(symbol, sourceFile);
  return checker.typeToString(type, sourceFile, FORMAT_FLAGS);
}

export function snapshotPublicApi({
  packageName,
  source,
  repositoryRoot = REPOSITORY_ROOT,
}) {
  const sourcePath = resolve(repositoryRoot, source);
  if (!existsSync(sourcePath)) throw new Error("missing-public-api-source");
  const program = ts.createProgram([sourcePath], {
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: ["node"],
  });
  const sourceFile = program.getSourceFile(sourcePath);
  const checker = program.getTypeChecker();
  const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
  if (!sourceFile || !moduleSymbol)
    throw new Error("missing-public-api-module");
  const exports = checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => ({
      name: symbol.name,
      signature: normalizeSignature(
        symbolType(checker, symbol, sourceFile),
        repositoryRoot,
      ),
    }))
    .sort((left, right) => compareText(left.name, right.name));
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    packageName,
    source: relative(repositoryRoot, sourcePath).replaceAll("\\", "/"),
    exports,
  };
}

export function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalSnapshot(snapshot) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    packageName: snapshot.packageName,
    source: snapshot.source,
    exports: [...snapshot.exports]
      .map(({ name, signature }) => ({ name, signature }))
      .sort((left, right) => compareText(left.name, right.name)),
  };
}

export function snapshotSha256(snapshot) {
  return sha256(canonicalJson(canonicalSnapshot(snapshot).exports));
}

export function classifyPublicApiChange(previous, current) {
  const previousByName = new Map(
    previous.exports.map((entry) => [entry.name, entry.signature]),
  );
  const currentByName = new Map(
    current.exports.map((entry) => [entry.name, entry.signature]),
  );
  const added = [...currentByName.keys()]
    .filter((name) => !previousByName.has(name))
    .sort(compareText);
  const removed = [...previousByName.keys()]
    .filter((name) => !currentByName.has(name))
    .sort(compareText);
  const changed = [...currentByName.keys()]
    .filter(
      (name) =>
        previousByName.has(name) &&
        previousByName.get(name) !== currentByName.get(name),
    )
    .sort(compareText);
  return {
    added,
    changed,
    impact:
      removed.length > 0 || changed.length > 0
        ? "major"
        : added.length > 0
          ? "minor"
          : "none",
    removed,
  };
}

export function maxImpact(changes) {
  return changes.reduce(
    (maximum, change) =>
      IMPACT_RANK[change.impact] > IMPACT_RANK[maximum]
        ? change.impact
        : maximum,
    "none",
  );
}

export function isDeclaredImpactSufficient(declared, calculated) {
  return (
    (declared === "minor" || declared === "major") &&
    IMPACT_RANK[declared] >= IMPACT_RANK[calculated]
  );
}

function readReleaseVersion(repositoryRoot) {
  const packageJson = JSON.parse(
    readFileSync(join(repositoryRoot, "package.json"), "utf8"),
  );
  if (
    typeof packageJson.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(packageJson.version)
  )
    throw new Error("invalid-release-version");
  return packageJson.version;
}

function baselinePath(baselineDirectory, target) {
  return join(baselineDirectory, target.baseline);
}

function readBaseline(file) {
  const baseline = JSON.parse(readFileSync(file, "utf8"));
  if (
    baseline.schemaVersion !== BASELINE_SCHEMA_VERSION ||
    typeof baseline.packageName !== "string" ||
    typeof baseline.releaseVersion !== "string" ||
    typeof baseline.surfaceSha256 !== "string" ||
    !Array.isArray(baseline.exports)
  )
    throw new Error("invalid-public-api-baseline");
  return baseline;
}

function baselineRecord(target, snapshot, releaseVersion, metadata = {}) {
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    packageName: target.packageName,
    source: snapshot.source,
    releaseVersion,
    surfaceSha256: snapshotSha256(snapshot),
    exports: canonicalSnapshot(snapshot).exports,
    ...metadata,
  };
}

export function checkPublicApi({
  repositoryRoot = REPOSITORY_ROOT,
  baselineDirectory = join(repositoryRoot, "scripts/public-api-baseline"),
  snapshots = PUBLIC_API_TARGETS.map((target) =>
    snapshotPublicApi({ ...target, repositoryRoot }),
  ),
}) {
  const releaseVersion = readReleaseVersion(repositoryRoot);
  return PUBLIC_API_TARGETS.map((target, index) => {
    const snapshot = snapshots[index];
    const baseline = readBaseline(baselinePath(baselineDirectory, target));
    const change = classifyPublicApiChange(baseline, snapshot);
    const currentSha256 = snapshotSha256(snapshot);
    const baselineIntegrity =
      baseline.surfaceSha256 === snapshotSha256(baseline);
    return {
      packageName: target.packageName,
      releaseVersion,
      previousSha256: baseline.surfaceSha256,
      currentSha256,
      baselineIntegrity,
      ...change,
    };
  });
}

export function updatePublicApiBaselines({
  repositoryRoot = REPOSITORY_ROOT,
  baselineDirectory = join(repositoryRoot, "scripts/public-api-baseline"),
  snapshots = PUBLIC_API_TARGETS.map((target) =>
    snapshotPublicApi({ ...target, repositoryRoot }),
  ),
  declaredChange,
}) {
  if (declaredChange !== "minor" && declaredChange !== "major")
    throw new Error("explicit-change-required");
  const releaseVersion = readReleaseVersion(repositoryRoot);
  const records = PUBLIC_API_TARGETS.map((target, index) => {
    const file = baselinePath(baselineDirectory, target);
    const previous = readBaseline(file);
    const snapshot = snapshots[index];
    const change = classifyPublicApiChange(previous, snapshot);
    if (!isDeclaredImpactSufficient(declaredChange, change.impact))
      throw new Error("declared-impact-is-lower-than-calculated");
    return {
      file,
      record: baselineRecord(target, snapshot, releaseVersion, {
        previousSurfaceSha256: previous.surfaceSha256,
        previousReleaseVersion: previous.releaseVersion,
        declaredChange,
      }),
    };
  });
  mkdirSync(baselineDirectory, { recursive: true });
  for (const { file, record } of records)
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return records.map(({ record }) => record);
}

export function initializePublicApiBaselines({
  repositoryRoot = REPOSITORY_ROOT,
  baselineDirectory = join(repositoryRoot, "scripts/public-api-baseline"),
  snapshots = PUBLIC_API_TARGETS.map((target) =>
    snapshotPublicApi({ ...target, repositoryRoot }),
  ),
  metadataByPackage = {},
}) {
  const releaseVersion = readReleaseVersion(repositoryRoot);
  const records = PUBLIC_API_TARGETS.map((target, index) => {
    const file = baselinePath(baselineDirectory, target);
    if (existsSync(file)) throw new Error("baseline-already-exists");
    return {
      file,
      record: baselineRecord(
        target,
        snapshots[index],
        releaseVersion,
        metadataByPackage[target.packageName],
      ),
    };
  });
  mkdirSync(baselineDirectory, { recursive: true });
  for (const { file, record } of records)
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return records.map(({ record }) => record);
}

function parseArgs(argv) {
  const args = { change: undefined, initialize: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--change") args.change = argv[++index];
    else if (argv[index] === "--initialize") args.initialize = true;
    else if (argv[index] === "--root") args.root = resolve(argv[++index]);
    else if (argv[index] === "--baseline-dir")
      args.baselineDirectory = resolve(argv[++index]);
    else throw new Error("unknown-argument");
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    const repositoryRoot = args.root ?? REPOSITORY_ROOT;
    const baselineDirectory =
      args.baselineDirectory ??
      join(repositoryRoot, "scripts/public-api-baseline");
    const snapshots = PUBLIC_API_TARGETS.map((target) =>
      snapshotPublicApi({ ...target, repositoryRoot }),
    );
    if (args.initialize) {
      const baselines = initializePublicApiBaselines({
        baselineDirectory,
        repositoryRoot,
        snapshots,
      });
      console.log(
        JSON.stringify({
          command: "check-public-api",
          ok: true,
          action: "baseline-initialized",
          packages: baselines.map(({ packageName, surfaceSha256 }) => ({
            packageName,
            currentSha256: surfaceSha256,
          })),
        }),
      );
      return 0;
    }
    const reports = checkPublicApi({
      baselineDirectory,
      repositoryRoot,
      snapshots,
    });
    const calculated = maxImpact(reports);
    if (calculated !== "none") {
      if (!args.change) {
        console.log(
          JSON.stringify({
            command: "check-public-api",
            ok: false,
            reason: "baseline-drift",
            calculatedImpact: calculated,
            packages: reports,
          }),
        );
        return 1;
      }
      if (!isDeclaredImpactSufficient(args.change, calculated)) {
        console.log(
          JSON.stringify({
            command: "check-public-api",
            ok: false,
            reason: "declared-impact-is-lower-than-calculated",
            calculatedImpact: calculated,
            declaredChange: args.change,
            packages: reports,
          }),
        );
        return 1;
      }
      const baselines = updatePublicApiBaselines({
        baselineDirectory,
        declaredChange: args.change,
        repositoryRoot,
        snapshots,
      });
      console.log(
        JSON.stringify({
          command: "check-public-api",
          ok: true,
          action: "baseline-updated",
          calculatedImpact: calculated,
          declaredChange: args.change,
          packages: baselines.map(
            ({ packageName, surfaceSha256, previousSurfaceSha256 }) => ({
              packageName,
              previousSha256: previousSurfaceSha256,
              currentSha256: surfaceSha256,
            }),
          ),
        }),
      );
      return 0;
    }
    if (args.change) {
      console.log(
        JSON.stringify({
          command: "check-public-api",
          ok: false,
          reason: "change-not-needed",
          declaredChange: args.change,
          packages: reports,
        }),
      );
      return 1;
    }
    const ok = reports.every((report) => report.baselineIntegrity);
    console.log(
      JSON.stringify({
        command: "check-public-api",
        ok,
        calculatedImpact: "none",
        packages: reports,
      }),
    );
    return ok ? 0 : 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        command: "check-public-api",
        ok: false,
        reason: error instanceof Error ? error.message : "check-failed",
      }),
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await main();
