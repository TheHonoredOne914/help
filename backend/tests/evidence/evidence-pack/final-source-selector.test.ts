import test from "node:test";
import assert from "node:assert/strict";
import { selectFinalSources } from "../../../src/core/evidence/evidence-pack/final-source-selector.js";
import { evidenceSource } from "./helpers.js";

test("B14-19/B14-21 final source selection preserves rare critical buckets and limits domain monoculture", () => {
  const courtSources = Array.from({ length: 14 }, (_, index) => evidenceSource({
    id: index + 1,
    title: `Court source ${index + 1}`,
    url: `https://sci.gov.in/judgment-${index + 1}`,
    canonicalUrl: `https://sci.gov.in/judgment-${index + 1}`,
    domain: "sci.gov.in",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 98 - index,
    citationStrength: "strong",
  }));
  const rare = [
    evidenceSource({ id: 50, title: "Parliamentary record", url: "https://sansad.in/q", canonicalUrl: "https://sansad.in/q", domain: "sansad.in", bucketIds: ["parliamentary_records"], sourceClass: "parliamentary_records", citationStrength: "strong" }),
    evidenceSource({ id: 51, title: "Election Commission note", url: "https://eci.gov.in/note", canonicalUrl: "https://eci.gov.in/note", domain: "eci.gov.in", bucketIds: ["electoral_integrity"], sourceClass: "electoral_body", citationStrength: "strong" }),
    evidenceSource({ id: 52, title: "Policy research", url: "https://prsindia.org/report", canonicalUrl: "https://prsindia.org/report", domain: "prsindia.org", bucketIds: ["policy_research"], sourceClass: "policy_research", citationStrength: "medium" }),
  ];

  const selected = selectFinalSources([...courtSources, ...rare], {
    query: "legal parliamentary Election Commission policy",
    limit: 12,
    mode: "deep_research",
    requiredBuckets: ["court_legal", "parliamentary_records", "electoral_integrity", "policy_research"],
  });

  assert.ok(selected.some((source) => source.bucketIds.includes("parliamentary_records")));
  assert.ok(selected.some((source) => source.bucketIds.includes("electoral_integrity")));
  assert.ok(selected.some((source) => source.bucketIds.includes("policy_research")));
  assert.ok(selected.filter((source) => source.domain === "sci.gov.in").length <= 5);
});
