import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { runTargetedRepair } from "../../src/core/verification/repair-orchestrator.js";

test("legal_accuracy_repair does not leave doubled rights phrasing", async () => {
  const contract = buildAgendaContract({ originalUserQuery: "obesity constitutional Article 21" });
  const repaired = await runTargetedRepair(
    "Argue that rising rates violate constitutional rights duty rights to health under Article 21.",
    contract,
    [],
    "legal_accuracy_repair",
  );
  assert.doesNotMatch(repaired, /constitutional rights duty rights/i);
  assert.doesNotMatch(repaired, /\bArticle\s+21\b/i);
  assert.match(repaired, /constitutional (?:protections|rights protections)/i);
});

test("length_repair rejects external-link and img-essay chrome", async () => {
  const contract = buildAgendaContract({ originalUserQuery: "NFHS obesity" });
  const packs = [{
    packId: "p",
    bucketId: "policy_research",
    cards: [{
      sourceId: 1,
      citation: "[Source 1](https://example.org/1)",
      title: "DD",
      url: "https://example.org/1",
      sourceClass: "policy_research" as const,
      bucketIds: ["policy_research"],
      date: "2024-01-01",
      relevanceScore: 80,
      keyFacts: [],
      keyNumbers: [],
      legalHoldings: [],
      governmentPosition: null,
      civilLibertiesPosition: null,
      electoralIntegrityPosition: null,
      debateUse: "",
      limitations: [],
      usableSections: ["policy_research"],
      contentPreview: "A2A ## External link confirmation NFHS-6 gains [Share]( ** img Essay Series Long-form",
      extractionQuality: "full" as const,
      citationStrength: "strong" as const,
    }, {
      sourceId: 2,
      citation: "[Source 2](https://example.org/2)",
      title: "PIB",
      url: "https://example.org/2",
      sourceClass: "policy_research" as const,
      bucketIds: ["policy_research"],
      date: "2024-01-01",
      relevanceScore: 90,
      keyFacts: ["NFHS-6 reports 30.7% of women aged 15-49 as overweight or obese."],
      keyNumbers: ["30.7%"],
      legalHoldings: [],
      governmentPosition: null,
      civilLibertiesPosition: null,
      electoralIntegrityPosition: null,
      debateUse: "Treasury cites Fit India using this prevalence spike.",
      limitations: [],
      usableSections: ["policy_research"],
      contentPreview: "good",
      extractionQuality: "full" as const,
      citationStrength: "strong" as const,
    }],
  }];
  const repaired = await runTargetedRepair("Short obesity draft.", contract, packs as any, "length_repair", { minWords: 40 });
  assert.doesNotMatch(repaired, /External link confirmation/i);
  assert.doesNotMatch(repaired, /img Essay Series/i);
  assert.match(repaired, /30\.7%/);
});
