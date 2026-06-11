import type { SearchResult } from "./types.js";
import type { TopicType } from "./rag.js";
import { classifySourceType, scoreSource } from "./web-search.js";

export interface SourceScore {
  raw: number;
  normalized: number;
  tier: "tier1" | "tier2" | "tier3" | "tier4" | "tier5";
  sourceType: SearchResult["sourceType"];
}

export function scoreTierFromRaw(raw: number): SourceScore["tier"] {
  if (raw >= 10) return "tier1";
  if (raw >= 9) return "tier2";
  if (raw >= 8) return "tier3";
  if (raw >= 5) return "tier4";
  return "tier5";
}

export function scoreSourceUnified(url: string, topic?: TopicType): SourceScore {
  const raw = scoreSource(url, topic);
  const normalized = raw / 10;
  const tier = scoreTierFromRaw(raw);
  const sourceType = classifySourceType(url);
  return { raw, normalized, tier, sourceType };
}
