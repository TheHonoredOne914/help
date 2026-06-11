import type { EnrichedResult } from "../../lib/types.js";

export function enrichedResultToCoreSource(source: EnrichedResult) {
  return {
    title: source.title,
    url: source.url,
    domain: (() => {
      try { return new URL(source.url).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
    })(),
    date: source.publishedDate ?? null,
    excerpt: source.content || source.snippet,
    snippet: source.snippet,
    keyFacts: [source.snippet || source.title].filter(Boolean),
    keyNumbers: [...new Set(`${source.title} ${source.snippet} ${source.content ?? ""}`.match(/\b20\d{2}\b|\b\d+(?:\.\d+)?%/g) ?? [])].slice(0, 5),
    legalHoldings: source.judgement?.held ? [source.judgement.held] : [],
    limitations: source.content ? [] : ["Snippet-only source; do not use for precise numbers."],
    citationEligible: Boolean(source.url),
  };
}
