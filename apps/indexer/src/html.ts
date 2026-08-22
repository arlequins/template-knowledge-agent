import { parse } from "parse5";

const EXCLUDED_ELEMENTS = new Set(["footer", "nav", "script", "style", "svg"]);
const BLOCK_ELEMENTS = new Set(["article", "div", "p", "pre", "section"]);

type HtmlNode = {
  childNodes?: HtmlNode[];
  nodeName: string;
  value?: string;
};

function findElement(node: HtmlNode, name: string): HtmlNode | undefined {
  if (node.nodeName.toLowerCase() === name) return node;
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, name);
    if (found) return found;
  }
  return undefined;
}

function renderNode(node: HtmlNode): string {
  const name = node.nodeName.toLowerCase();
  if (EXCLUDED_ELEMENTS.has(name)) return "";
  if (name === "#text") return node.value ?? "";
  const children = (node.childNodes ?? []).map(renderNode).join("");
  if (name === "h1") return `\n# ${children}\n`;
  if (name === "h2") return `\n## ${children}\n`;
  if (name === "h3") return `\n### ${children}\n`;
  if (name === "li") return `\n- ${children}`;
  if (name === "br") return "\n";
  if (BLOCK_ELEMENTS.has(name)) return `\n${children}\n`;
  return children;
}

export function officialHtmlToMarkdown(html: string) {
  const document = parse(html) as unknown as HtmlNode;
  return renderNode(findElement(document, "main") ?? document)
    .replace(/[ \t]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
