import test from "node:test";
import assert from "node:assert/strict";
import { groundUsageItem } from "../../../src/core/evidence/source-usage/claim-grounding.js";
import type { SourceUsageMapItem } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("claim grounding accepts claims with evidence-span support from top chunks", () => {
  const { registry } = makeRegistry([source(1, {
    fullText: "The Supreme Court applied Article 14 proportionality to internet shutdown accountability in Anuradha Bhasin.",
    keyFacts: ["The Supreme Court applied Article 14 proportionality to internet shutdown accountability."],
    topChunks: [{ text: "The Supreme Court applied Article 14 proportionality to internet shutdown accountability in Anuradha Bhasin.", score: 95, chunkIndex: 3 }],
  })]);
  const item: SourceUsageMapItem = {
    sourceId: 1,
    title: "Source 1",
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    usageType: "fact_extracted",
    extractedClaim: "Supreme Court applied Article 14 proportionality to internet shutdown accountability",
    confidence: "high",
  };

  const result = groundUsageItem(item, registry.getSource(1)!);

  assert.equal(result.grounded, true);
  assert.equal(result.evidenceSpan?.chunkIndex, 3);
  assert.ok(result.sharedTokens.length >= 3);
});

test("claim grounding rejects invented claims and one-token overlap", () => {
  const { registry } = makeRegistry([source(1, {
    fullText: "The article covers parliamentary committee procedure and ministry accountability.",
    keyFacts: ["The article covers parliamentary committee procedure and ministry accountability."],
    topChunks: [{ text: "The article covers parliamentary committee procedure and ministry accountability.", score: 80, chunkIndex: 0 }],
  })]);
  const invented: SourceUsageMapItem = {
    sourceId: 1,
    title: "Source 1",
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    usageType: "fact_extracted",
    extractedClaim: "India changed every federal criminal law after a secret cabinet vote",
    confidence: "high",
  };

  const result = groundUsageItem(invented, registry.getSource(1)!);

  assert.equal(result.grounded, false);
  assert.match(result.reason ?? "", /not grounded|overlap/i);
});
