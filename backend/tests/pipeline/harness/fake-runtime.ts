import type { EvidenceSource } from "../../../src/core/evidence/evidence-registry.js";

export function fakePreloadedSources(count = 8): Array<Partial<EvidenceSource> & { excerpt?: string }> {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const text = `Source ${id} records Indian parliamentary accountability, Article 21 privacy, and proportionality evidence for data protection.`;
    return {
      title: `Official privacy source ${id}`,
      url: `https://www.sci.gov.in/privacy-${id}`,
      canonicalUrl: `https://www.sci.gov.in/privacy-${id}`,
      domain: "sci.gov.in",
      bucketIds: ["court_legal"],
      sourceClass: "court_primary",
      authorityScore: 98,
      fullText: text.repeat(8),
      snippet: text,
      excerpt: text,
      extractionQuality: "full",
      keyFacts: [text],
      legalHoldings: [text],
      keyNumbers: [],
      namedEntities: ["Supreme Court of India"],
      limitations: [],
      confidence: "high",
      citationEligible: true,
      topChunks: [{ text, score: 1, chunkIndex: 0 }],
    };
  });
}
