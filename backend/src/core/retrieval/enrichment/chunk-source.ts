import type { SourceChunk } from "./types.js";

const MIN_CHUNK_CHARS = 80;
const MAX_CHUNK_CHARS = 600;

export function chunkCleanedText(text: string, _query: string, sourceUrl?: string): SourceChunk[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const units = normalized
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitParagraph(paragraph.trim()))
    .map((unit) => unit.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const unit of units) {
    chunks.push(...hardSplit(unit));
  }

  const normalizedChunks = mergeShortTail(chunks);
  return normalizedChunks.map((chunk, index) => ({
    index,
    text: chunk,
    charLength: chunk.length,
    ...(sourceUrl ? { url: sourceUrl } : {}),
  }));
}

function splitParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK_CHARS) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (!current || `${current} ${trimmed}`.length <= MAX_CHUNK_CHARS) {
      current = `${current} ${trimmed}`.trim();
    } else {
      chunks.push(current);
      current = trimmed;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function mergeShortTail(chunks: string[]): string[] {
  const output: string[] = [];
  for (const chunk of chunks) {
    const previous = output[output.length - 1];
    if (chunk.length < MIN_CHUNK_CHARS && previous && `${previous} ${chunk}`.length <= MAX_CHUNK_CHARS) {
      output[output.length - 1] = `${previous} ${chunk}`.trim();
    } else {
      output.push(chunk);
    }
  }
  return output;
}

function hardSplit(chunk: string): string[] {
  if (chunk.length <= MAX_CHUNK_CHARS) return [chunk];
  const output: string[] = [];
  let cursor = 0;
  while (cursor < chunk.length) {
    output.push(chunk.slice(cursor, cursor + MAX_CHUNK_CHARS).trim());
    cursor += MAX_CHUNK_CHARS;
  }
  return output.filter(Boolean);
}
