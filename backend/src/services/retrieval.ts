export function deduplicateQueriesSemantically(queries: string[], threshold = 0.70): string[] {
  const normalized = queries.map(q => q.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim());
  const selected: number[] = [];
  for (let i = 0; i < normalized.length; i++) {
    if (selected.every(j => getWordOverlap(normalized[i], normalized[j]) < threshold)) selected.push(i);
  }
  return selected.map(i => queries[i]);
}

export function getWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(" ").filter(w => w.length > 3));
  const wordsB = new Set(b.split(" ").filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  return intersection / Math.min(wordsA.size, wordsB.size);
}
