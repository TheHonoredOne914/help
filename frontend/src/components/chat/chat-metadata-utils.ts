export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "#";
    }
    return url;
  } catch {
    return "#";
  }
}

export function stripRawSourceJson(content: string): string {
  return content
    .replace(/\n*\s*(?:```json\s*)?\{[\s\S]*"sources"\s*:\s*\[[\s\S]*$/i, "")
    .trimEnd();
}

export function extractCitedSourceNums(text: string): Set<number> {
  const nums = new Set<number>();
  for (const match of text.matchAll(/\[(?:Source\s*)?(\d+)\]/gi)) {
    nums.add(parseInt(match[1], 10));
  }
  return nums;
}
