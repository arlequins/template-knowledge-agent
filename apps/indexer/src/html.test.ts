import { describe, expect, it } from "vitest";
import { officialHtmlToMarkdown } from "./html";

describe("officialHtmlToMarkdown", () => {
  it("keeps main headings and removes navigation scripts", () => {
    expect(
      officialHtmlToMarkdown(
        "<nav>menu</nav ><main><h1>React &amp; UI</h1><p>Components</p><script>bad()</script ></main>",
      ),
    ).toBe("# React & UI\nComponents");
  });
});
