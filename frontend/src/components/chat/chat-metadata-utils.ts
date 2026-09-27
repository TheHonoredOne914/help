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
    .replace(/\n*(?:```json\s*)?\{\s*"sources"\s*:\s*\[[\s\S]*$/i, "")
    .trimEnd();
}

export { extractCitedSourceNums, extractCitedIndices } from "@/lib/citation-indices";
