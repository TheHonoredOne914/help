import { logger } from "../lib/logger.js";
import type { TopicType } from "../lib/rag.js";

export function extractArchiveFacts(answer: string, topicType?: TopicType): string {
  const lines = answer
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const isRelevantLine = (line: string): boolean => {
    const hasCitation = /^[*-]/.test(line) || /^\d+\./.test(line) || /\b(Source\s*\d+|\[\d+\])\b/i.test(line);
    if (!hasCitation) return false;
    const hasNumber = /\d/.test(line);

    if (topicType === "democracy_civil_liberties") {
      return /freedom|democracy|civil|rights|press|ranking|index|decline|erosion|amnesty|hrw|rsf|v.?dem|eiu|uapa|sedition|backslid|authoritar|arrested|detained|shutdown|crackdown|dissent|ngos?|fcra|minority|election|constitution/i.test(line);
    }
    if (topicType === "media_press") {
      return /journalist|press|media|article 19|sedition|censorship|rsf|cpj|freedom house|media freedom|newsroom|reporter|editor|broadcast/i.test(line);
    }
    if (topicType === "economic") {
      return hasNumber && /gdp|budget|fiscal|inflation|trade|rbi|monetary|gst|tax|growth|poverty|imf|world bank|crore|lakh|billion|million|percent|%/i.test(line);
    }
    if (topicType === "environment") {
      return /climate|carbon|emission|pollution|forest|renewable|solar|wind|energy|temperature|ipcc|cop|paris|biodiversity/i.test(line);
    }
    return hasNumber || /court|judg|cag|ncrb|mea|pib|act|article|parliament/i.test(line);
  };

  const factLines = lines.filter(isRelevantLine);
  return factLines.slice(0, 24).join("\n").slice(0, 4000);
}

export function mergeLines(existing: string, incoming: string): string {
  const merged = [...new Set(
    [existing, incoming]
      .flatMap((text) => text.split("\n"))
      .map((line) => line.trim())
      .filter(Boolean)
  )];
  return merged.slice(-32).join("\n").slice(0, 5000);
}

export async function mergeArchiveSummaries(
  existing: string,
  incoming: string,
  _opts: { groqKey?: string | null } = {},
): Promise<string> {
  const incomingLines = incoming.split("\n").map(l => l.trim()).filter(Boolean);
  const flaggedLines = incomingLines.filter(l =>
    /\b\d+(?:\.\d+)?%|\b\d{2,}(?:,\d{3})+\b/.test(l) && !/\[Source \d+\]/i.test(l)
  );

  if (incomingLines.length > 0 && flaggedLines.length > incomingLines.length * 0.3) {
    logger.warn({ flaggedCount: flaggedLines.length }, "Archive summary may contain unverified statistics");
    const safeLines = incomingLines.filter(l => !flaggedLines.includes(l) || /\[Source \d+\]/i.test(l));
    return mergeLines(existing, safeLines.join("\n"));
  }

  return mergeLines(existing, incoming);
}
