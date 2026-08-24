export type SourceChunk = { content: string; locator: string; ordinal: number };

const MAX_CHARS = 2_400;
const SOURCE_LINES = 80;

function splitLongSection(
  content: string,
  locator: string,
  startOrdinal: number,
): SourceChunk[] {
  const chunks =
    content.match(new RegExp(`[\\s\\S]{1,${MAX_CHARS}}`, "g")) ?? [];
  return chunks.map((part, index) => ({
    content: part.trim(),
    locator: chunks.length === 1 ? locator : `${locator} · part ${index + 1}`,
    ordinal: startOrdinal + index,
  }));
}

export function chunkMarkdown(content: string, path: string): SourceChunk[] {
  const lines = content.split("\n");
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current = { heading: path, lines: [] as string[] };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading && current.lines.some((value) => value.trim())) {
      sections.push(current);
      current = { heading: heading[2]?.trim() || path, lines: [line] };
    } else {
      if (heading) current.heading = heading[2]?.trim() || path;
      current.lines.push(line);
    }
  }
  if (current.lines.some((value) => value.trim())) sections.push(current);
  const result: SourceChunk[] = [];
  for (const section of sections)
    result.push(
      ...splitLongSection(
        section.lines.join("\n"),
        `${path}#${section.heading}`,
        result.length,
      ),
    );
  return result.filter(({ content: value }) => value.length > 0);
}

export function chunkSource(content: string, path: string): SourceChunk[] {
  const lines = content.split("\n");
  const result: SourceChunk[] = [];
  for (let start = 0; start < lines.length; start += SOURCE_LINES) {
    const end = Math.min(start + SOURCE_LINES, lines.length);
    const value = lines.slice(start, end).join("\n").trim();
    if (value)
      result.push({
        content: value,
        locator: `${path}#L${start + 1}-L${end}`,
        ordinal: result.length,
      });
  }
  return result;
}
