import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceUsageBatchPrompt } from "../../../src/core/synthesis/source-usage-role-prompt.js";
import type { EvidenceCard } from "../../../src/core/evidence/evidence-pack-builder.js";

test("B14-07 role prompts serialize multiple budget-bounded top chunks", () => {
  const card: EvidenceCard = {
    sourceId: 7,
    citation: "[Source 7](https://example.org/source-7)",
    title: "Multi-chunk report",
    url: "https://example.org/source-7",
    sourceClass: "policy_research",
    bucketIds: ["policy_research"],
    date: "2025-01-01",
    relevanceScore: 88,
    keyFacts: ["Primary claim."],
    keyNumbers: ["42%"],
    legalHoldings: ["Secondary legal holding."],
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: "Use for policy rebuttal.",
    limitations: [],
    usableSections: ["policy_research"],
    citationStrength: "medium",
    limitedSource: false,
    extractionQuality: "full",
    topChunks: [
      { text: "Primary fact chunk.", score: 10, chunkIndex: 0 },
      { text: "Secondary statistic chunk.", score: 9, chunkIndex: 1 },
      { text: "Counterevidence implementation detail chunk.", score: 8, chunkIndex: 2 },
    ],
    namedEntities: ["Election Commission of India"],
  };

  const prompt = buildSourceUsageBatchPrompt([card]);

  assert.match(prompt, /Primary fact chunk/);
  assert.match(prompt, /Secondary statistic chunk/);
  assert.match(prompt, /Counterevidence implementation detail chunk/);
  assert.match(prompt, /Election Commission of India/);
});
