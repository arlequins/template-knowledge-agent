import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBehaviorPackManifest } from "@arlequins/tuning-kit";
import { describe, expect, it } from "vitest";

import { evaluateAndPromoteTuningPatterns } from "./evaluate-tuning-patterns";
import { rollbackBehaviorPack } from "./rollback-tuning-patterns";
import { verifyActiveBehaviorPack } from "./verify-active-tuning-pack";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("behavior-pack promotion", () => {
  it("keeps immutable releases and atomically rolls back the active pack", async () => {
    const directory = await mkdtemp(join(tmpdir(), "behavior-pack-"));
    const inputPath = resolve(
      REPOSITORY_ROOT,
      "examples/tuning/reviewed-patterns.json",
    );
    const outputPath = resolve(directory, "active.json");
    const releaseDirectory = resolve(directory, "releases");
    try {
      const first = await evaluateAndPromoteTuningPatterns({
        inputPath,
        now: () => new Date("2026-08-29T00:00:00.000Z"),
        outputPath,
        releaseDirectory,
      });
      const second = await evaluateAndPromoteTuningPatterns({
        inputPath,
        model: {
          model: "ornith-1.5-9b",
          provider: "local",
          quantization: "4bit",
          runtime: "mlx",
        },
        now: () => new Date("2026-08-30T00:00:00.000Z"),
        outputPath,
        releaseDirectory,
      });
      expect(first.version).not.toBe(second.version);
      expect(
        parseBehaviorPackManifest(
          JSON.parse(await readFile(first.releasePath, "utf8")),
        ),
      ).toBeDefined();
      expect(
        parseBehaviorPackManifest(
          JSON.parse(await readFile(outputPath, "utf8")),
        )?.model?.model,
      ).toBe("ornith-1.5-9b");

      const tampered = parseBehaviorPackManifest(
        JSON.parse(await readFile(outputPath, "utf8")),
      );
      expect(tampered).toBeDefined();
      await writeFile(
        outputPath,
        `${JSON.stringify(
          {
            ...tampered,
            behaviorPrompt: `${tampered?.behaviorPrompt}\nunsafe`,
          },
          undefined,
          2,
        )}\n`,
      );
      await expect(
        verifyActiveBehaviorPack({
          manifestPath: outputPath,
          sourcePath: inputPath,
        }),
      ).rejects.toThrow("prompt does not match");

      await rollbackBehaviorPack({
        outputPath,
        releasePath: first.releasePath,
      });
      expect(
        parseBehaviorPackManifest(
          JSON.parse(await readFile(outputPath, "utf8")),
        )?.version,
      ).toBe(first.version);
      await expect(
        verifyActiveBehaviorPack({
          manifestPath: outputPath,
          sourcePath: inputPath,
        }),
      ).resolves.toMatchObject({ version: first.version });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
