import { describe, expect, it } from "vitest";
import { chunkMarkdown, chunkSource } from "./chunk";

describe("knowledge chunks", () => {
  it("keeps Markdown headings as evidence locators", () => {
    const chunks = chunkMarkdown(
      "# Sales\nSeven days.\n## Rules\nApproved only.",
      "docs/sales.md",
    );
    expect(chunks.map((chunk) => chunk.locator)).toEqual([
      "docs/sales.md#Sales",
      "docs/sales.md#Rules",
    ]);
  });

  it("keeps source line ranges", () => {
    const chunks = chunkSource(
      Array.from({ length: 90 }, (_, index) => `line ${index + 1}`).join("\n"),
      "src/api.ts",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[1]?.locator).toBe("src/api.ts#L81-L90");
  });
});
