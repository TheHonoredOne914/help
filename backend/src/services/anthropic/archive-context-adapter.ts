export function buildArchiveContextText(topic?: string | null, summary?: string | null): string {
  return [topic, summary].filter(Boolean).join("\n\n");
}
