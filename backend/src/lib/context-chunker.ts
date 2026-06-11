import type { CompiledSourceBlock, FullSourceManifest } from "./source-compiler.js";

export interface ContextChunk {
  chunkIndex: number;
  totalChunks: number;
  anchorSources: string;
  chunkSources: string;
  numberedList: string;
  charCount: number;
}

export function chunkSourceManifest(
  manifest: FullSourceManifest,
  modelContextLimitChars: number,
): ContextChunk[] {
  const anchorBudget = Math.floor(modelContextLimitChars * 0.35);
  const windowBudget = Math.floor(modelContextLimitChars * 0.55);
  const anchorBlocks = [
    ...manifest.govSources,
    ...manifest.courtJudgements,
  ].slice(0, 12);
  const anchorIds = new Set(anchorBlocks.map((block) => block.index));

  const anchorText = anchorBlocks
    .map((block) => formatChunkSource(block, 4000))
    .join("\n\n")
    .slice(0, anchorBudget);

  const remaining = manifest.compiledBlocks.filter((block) => !anchorIds.has(block.index));
  const windows: ContextChunk[] = [];
  let sourceIndex = 0;

  while (sourceIndex < remaining.length || windows.length === 0) {
    const windowSources: string[] = [];
    const windowIds: number[] = [];
    let budget = windowBudget;

    while (sourceIndex < remaining.length && budget > 0) {
      const block = remaining[sourceIndex];
      const blockText = formatChunkSource(block, 3000);
      if (blockText.length <= budget) {
        windowSources.push(blockText);
        windowIds.push(block.index);
        budget -= blockText.length;
      } else if (block.score >= 8 && budget > 500) {
        windowSources.push(`${blockText.slice(0, budget - 100)}\n[truncated in this chunk]\n---`);
        windowIds.push(block.index);
        budget = 0;
      }
      sourceIndex += 1;
    }

    const ids = new Set([...anchorBlocks.map((block) => block.index), ...windowIds]);
    const numberedList = manifest.compiledBlocks
      .filter((block) => ids.has(block.index))
      .map((block) => `[${block.index}] ${block.badge} ${block.title} - ${block.url}`)
      .join("\n");
    const chunkSources = windowSources.join("\n\n");

    windows.push({
      chunkIndex: windows.length + 1,
      totalChunks: -1,
      anchorSources: anchorText,
      chunkSources,
      numberedList,
      charCount: anchorText.length + chunkSources.length,
    });

    if (sourceIndex >= remaining.length) break;
  }

  const totalChunks = windows.length || 1;
  return windows.map((window) => ({ ...window, totalChunks }));
}

function formatChunkSource(block: CompiledSourceBlock, contentLimit: number): string {
  const content = block.fullContent || block.snippet || "[No content available]";
  return `--- SOURCE [${block.index}] ${block.badge} ${block.title}\nURL: ${block.url}\nContent:\n${content.slice(0, contentLimit)}\n---`;
}
