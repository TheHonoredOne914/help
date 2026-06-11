import { describe, it } from "node:test";
import assert from "node:assert";
import { mergeDuplicateSourceFix, preferBetterQuality, mergeTopChunks } from "../../../src/core/citations/injection/source-merge-citation-fix.js";
import type { EvidenceSource, EvidenceSourceInput } from "../../../src/core/evidence/evidence-registry-types.js";

describe("source-merge-citation-fix", () => {
  const baseSource: EvidenceSource = {
    id: 1,
    title: "Original Title",
    url: "https://example.com/original",
    canonicalUrl: "",
    domain: "example.com",
    bucketIds: ["legal_holdings" as any],
    sourceClass: "court_primary",
    authorityScore: 80,
    date: "2024-01-01",
    fullText: "Short text",
    snippet: "snippet text",
    extractionQuality: "partial",
    keyFacts: ["Fact 1"],
    keyNumbers: ["42"],
    legalHoldings: ["Holding A"],
    namedEntities: ["Entity X"],
    limitations: ["Limitation 1"],
    confidence: "medium",
    citationEligible: true,
    topChunks: [{ text: "chunk1", score: 0.9, chunkIndex: 0 }],
    citationStrength: "medium",
    limitedSource: false,
  };

  const incomingSource: EvidenceSourceInput = {
    title: "Updated Title",
    url: "https://example.com/redirect",
    canonicalUrl: "https://example.com/canonical",
    domain: "example.com",
    bucketIds: ["electoral_integrity" as any],
    sourceClass: "court_primary",
    authorityScore: 90,
    date: "2024-06-01",
    fullText: "This is a much longer text with more details",
    snippet: "better snippet",
    extractionQuality: "full",
    keyFacts: ["Fact 2"],
    keyNumbers: ["100"],
    legalHoldings: ["Holding B"],
    namedEntities: ["Entity Y"],
    limitations: [],
    confidence: "high",
    citationEligible: true,
  };

  it("recomputes citationStrength after merge (BUG-19-04)", () => {
    const merged = mergeDuplicateSourceFix(baseSource, incomingSource);
    // computeCitationStrength is called
    assert.strictEqual(merged.citationStrength, "strong");
  });

  it("prefers canonical URL (BUG-19-18)", () => {
    const merged = mergeDuplicateSourceFix(baseSource, incomingSource);
    assert.strictEqual(merged.canonicalUrl, "https://example.com/canonical");
  });

  it("merges bucketIds without duplicates", () => {
    const merged = mergeDuplicateSourceFix(baseSource, incomingSource);
    assert.ok(merged.bucketIds?.includes("legal_holdings" as any));
    assert.ok(merged.bucketIds?.includes("electoral_integrity" as any));
  });

  it("takes higher authorityScore", () => {
    const merged = mergeDuplicateSourceFix(baseSource, incomingSource);
    assert.strictEqual(merged.authorityScore, 90);
  });

  it("prefers longer fullText", () => {
    const merged = mergeDuplicateSourceFix(baseSource, incomingSource);
    assert.strictEqual(merged.fullText, "This is a much longer text with more details");
  });

  it("prefers better extractionQuality", () => {
    assert.strictEqual(preferBetterQuality("partial", "full"), "full");
    assert.strictEqual(preferBetterQuality("full", "snippet"), "full");
    assert.strictEqual(preferBetterQuality("failed", "snippet"), "snippet");
  });

  it("merges and dedupes topChunks by score", () => {
    const existing = [{ text: "chunk1", score: 0.9, chunkIndex: 0 }];
    const incoming = [
      { text: "chunk2", score: 0.95, chunkIndex: 1 },
      { text: "chunk1", score: 0.9, chunkIndex: 0 }, // duplicate
    ];
    const merged = mergeTopChunks(existing, incoming);
    assert.strictEqual(merged.length, 2);
    assert.strictEqual(merged[0].text, "chunk2"); // Higher score first
  });
});
