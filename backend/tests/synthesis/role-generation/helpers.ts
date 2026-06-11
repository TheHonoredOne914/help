import type { AgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import type { ClaimGraph } from "../../../src/core/evidence/claim-graph.js";
import type { EvidenceCard, EvidencePack } from "../../../src/core/evidence/evidence-pack-builder.js";
import type { EvidenceSource } from "../../../src/core/evidence/evidence-registry.js";
import { buildEvidenceRegistryFromSources } from "../../../src/core/evidence/evidence-registry.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "../../../src/core/evidence/source-usage-map.js";

export function testAgenda(): AgendaContract {
  return buildAgendaContract({
    requestId: "brick-17-test",
    originalUserQuery: "Lok Sabha debate on civil liberties, public order, court doctrine, and statistics",
  });
}

export function makeCard(id: number, overrides: Partial<EvidenceCard> = {}): EvidenceCard {
  return {
    sourceId: id,
    citation: `[Source ${id}](https://example.org/source-${id})`,
    title: `Source ${id} title`,
    url: `https://example.org/source-${id}`,
    sourceClass: "policy_research",
    bucketIds: ["policy_research"],
    date: "2026-01-01",
    relevanceScore: 82,
    queryRelevanceScore: 70,
    rankScore: 80,
    roleRelevanceScore: 75,
    keyFacts: [`Source ${id} says the committee record contains claim ${id}.`],
    keyNumbers: [],
    legalHoldings: [],
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: `Use Source ${id} for a source-grounded parliamentary argument.`,
    limitations: [],
    usableSections: ["evidence_verification"],
    contentPreview: `Source ${id} says the committee record contains claim ${id}.`,
    citationStrength: "strong",
    topChunks: [
      { text: `First chunk for source ${id} about ordinary context.`, score: 4 },
      { text: `Second chunk for source ${id} contains the decisive extractor fact.`, score: 9 },
      { text: `Third chunk for source ${id} adds cross-source nuance.`, score: 7 },
    ],
    limitedSource: false,
    extractionQuality: "full",
    enrichmentCard: undefined,
    evidenceItems: [],
    namedEntities: ["Lok Sabha", "Supreme Court", `Entity ${id}`],
    ...overrides,
  };
}

export function makePacks(cards: EvidenceCard[]): Record<string, EvidencePack> {
  return {
    primary: {
      id: "primary",
      cards,
      limitations: [],
    },
  };
}

export function makeSources(cards: EvidenceCard[]): EvidenceSource[] {
  return cards.map((card) => ({
    id: card.sourceId,
    title: card.title,
    url: card.url,
    canonicalUrl: card.url,
    domain: new URL(card.url).hostname,
    bucketIds: card.bucketIds,
    sourceClass: card.sourceClass,
    authorityScore: card.relevanceScore,
    date: card.date,
    fullText: [
      card.contentPreview,
      ...card.keyFacts,
      ...card.keyNumbers,
      ...card.legalHoldings,
      ...card.topChunks.map((chunk) => chunk.text),
      card.debateUse,
    ].filter(Boolean).join(" "),
    snippet: card.contentPreview ?? card.keyFacts[0] ?? card.debateUse,
    extractionQuality: card.extractionQuality,
    keyFacts: card.keyFacts,
    keyNumbers: card.keyNumbers,
    legalHoldings: card.legalHoldings,
    namedEntities: card.namedEntities,
    limitations: card.limitations,
    confidence: card.citationStrength === "strong" ? "high" : card.citationStrength === "medium" ? "medium" : "low",
    citationEligible: card.citationStrength !== "ineligible",
    citationStrength: card.citationStrength,
    limitedSource: card.limitedSource,
    topChunks: card.topChunks,
  }));
}

export function makeRegistry(cards: EvidenceCard[]) {
  return buildEvidenceRegistryFromSources(makeSources(cards), testAgenda());
}

export function makeClaimGraph(): ClaimGraph {
  return {
    claims: [
      {
        id: "claim-legal",
        text: "The Supreme Court proportionality doctrine qualifies public order restrictions.",
        type: "legal_holding",
        requiredSourceClasses: ["court_primary", "legal_commentary"],
        supportingSourceIds: [1],
        confidence: "high",
        mustUseCarefulLanguage: false,
        forbiddenIfUnsupported: false,
      },
      {
        id: "claim-weak",
        text: "A broad allegation should not be treated as proven without primary records.",
        type: "allegation",
        requiredSourceClasses: ["official_government"],
        supportingSourceIds: [2],
        confidence: "low",
        mustUseCarefulLanguage: true,
        forbiddenIfUnsupported: true,
      },
    ],
    counterclaims: [
      {
        id: "counter-1",
        text: "The Union can defend restrictions as public order if safeguards are evidenced.",
        challengedClaimId: "claim-legal",
        sourceIds: [1, 3],
        sourceClasses: ["official_government"],
        supportScore: 70,
        requiresCarefulLanguage: false,
      },
    ],
    contradictions: [
      {
        id: "contradiction-1",
        claimIds: ["claim-legal", "claim-weak"],
        type: "official_watchdog_conflict",
        description: "Official defence and rights critique point in opposite directions.",
        severity: "high",
        sourceIds: [1, 2],
      },
    ],
    unsupportedClaims: [
      { type: "unsupported_high_risk_claim", claim: "Unsupported claim must be forbidden unless sourced.", action: "qualify" },
    ],
  };
}

export function roleOutput(roleName: string, item: SourceUsageMapItem): ModelRoleOutput {
  return {
    roleName,
    requiredSourceCount: 1,
    receivedSourceIds: [item.sourceId],
    usedSourceIds: [item.sourceId],
    unusedSourceIds: [],
    sourceUsageMap: [item],
    sourceUsageCount: 1,
    sourceUsageRequirementSatisfied: true,
    output: {
      roleSummary: `${roleName} summary`,
      divisionHints: [`${roleName} hint`],
    },
  };
}
