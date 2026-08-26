import { describe, expect, it } from "vitest";

import { type AnalyzerPlugin, createAnalyzerRegistry } from "./analyzer";

const plugin: AnalyzerPlugin = {
  id: "typescript-t3",
  async detect() {
    return { confidence: 0.9, roots: ["apps/web"] };
  },
  async plan(snapshot) {
    return { files: snapshot.files, requirements: ["node", "pnpm"] };
  },
  async extract() {
    return { edges: [], units: [] };
  },
  normalize(facts) {
    return facts;
  },
};

describe("analyzer registry", () => {
  it("detects and resolves plugins through the normalized boundary", async () => {
    const registry = createAnalyzerRegistry([plugin]);
    expect(registry.list()).toEqual(["typescript-t3"]);
    await expect(
      registry.detect({ files: ["package.json"], root: "." }),
    ).resolves.toEqual([
      { confidence: 0.9, plugin: "typescript-t3", roots: ["apps/web"] },
    ]);
    expect(registry.get("typescript-t3")).toBe(plugin);
  });

  it("rejects duplicate and unknown plugins", () => {
    expect(() => createAnalyzerRegistry([plugin, plugin])).toThrow(
      "duplicate IDs",
    );
    expect(() => createAnalyzerRegistry([])).toThrow("cannot be empty");
    expect(() => createAnalyzerRegistry([plugin]).get("java-spring")).toThrow(
      "Unknown analyzer",
    );
  });
});
