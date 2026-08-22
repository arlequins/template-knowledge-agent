const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function officialHtmlToMarkdown(html: string) {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
  return decodeEntities(
    main
      .replace(/<(script|style|svg|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<h1\b[^>]*>/gi, "\n# ")
      .replace(/<h2\b[^>]*>/gi, "\n## ")
      .replace(/<h3\b[^>]*>/gi, "\n### ")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<(br|p|pre|div|section|article)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ +\n/g, "\n")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .trim(),
  );
}
