/** Extract cited source indices from answer text (bracket and footnote forms). */
export function extractCitedIndices(answerText: string): Set<number> {
  const cited = new Set<number>();
  const re = /\[(?:[Ss]ource\s*)?(\d+(?:\s*,\s*\d+)*)\]|\[\^(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(answerText)) !== null) {
    const group = match[1] ?? match[2];
    for (const value of group.split(",")) {
      const parsed = parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) cited.add(parsed);
    }
  }
  return cited;
}

/** Legacy alias — simple [Source N] / [N] extraction for metadata utilities. */
export function extractCitedSourceNums(text: string): Set<number> {
  return extractCitedIndices(text);
}
