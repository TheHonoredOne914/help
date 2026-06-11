import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildClaimGraph } from "../../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import type { ResearchMode } from "../../src/core/config/research-mode.js";

export function createFakeResearchRun(sourceCount = 25, mode: ResearchMode = "fast_research") {
  const agendaContract = buildAgendaContract({ requestId: `fake-${sourceCount}`, originalUserQuery: "AIPPM debate on Indian electoral integrity, civil liberties, Supreme Court doctrine, Election Commission defence, and Union ministry accountability" });
  agendaContract.minimumUniqueCitedSources = mode === "fast_research" ? 10 : 30;
  agendaContract.minimumEvidenceCardsPerModel = agendaContract.minimumUniqueCitedSources;
  const buckets = agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId);
  const sources: EvidenceSource[] = Array.from({ length: sourceCount }, (_, index) => {
    const id = index + 1;
    const bucket = buckets[index % Math.max(1, buckets.length)] ?? "policy_research";
    return {
      id,
      title: `Indian parliamentary source ${id}`,
      url: `https://example.org/source-${id}`,
      canonicalUrl: `https://example.org/source-${id}`,
      domain: "example.org",
      bucketIds: [bucket],
      sourceClass: bucket === "court_legal" ? "court_primary" : "policy_research",
      authorityScore: 90 - (index % 10),
      date: "2026-05-01",
      fullText: `Detailed evidence ${id} on Treasury Bench, Opposition, constitutional challenge, Election Commission defence, Supreme Court doctrine, Union ministry accountability, public order, rights-based challenge, POIs, rebuttals, motions, amendments, and resolution clauses.`,
      snippet: `Evidence ${id} supports Indian Mock Parliament analysis.`,
      extractionQuality: "full",
      keyFacts: [
        `Source ${id} provides a specific evidence-backed claim for Indian parliamentary debate.`,
        `Source ${id} distinguishes government defence from rights-based challenge.`,
        `Source ${id} connects the issue to floor strategy and committee recommendations.`,
      ],
      keyNumbers: [`${id}% indicator ${id}`],
      legalHoldings: bucket === "court_legal" ? [`Holding ${id} on proportionality and judicial review.`] : [],
      namedEntities: ["Election Commission of India", "Supreme Court of India"],
      limitations: [`Limitation ${id}: methodology and time window must be stated.`],
      confidence: "high",
      citationEligible: true,
    };
  });
  const evidenceRegistry = buildEvidenceRegistryFromSources(sources, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  return { agendaContract, evidenceRegistry, evidencePacks, claimGraph, mode };
}
