import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { buildClaimGraph, type ClaimGraph } from "../../src/core/evidence/claim-graph.js";
import { buildClaimLedger, type ClaimLedger } from "../../src/core/evidence/claim-ledger.js";
import { buildEvidencePacks, buildModelEvidencePack } from "../../src/core/evidence/evidence-pack-builder.js";
import { runThesisQualityGate } from "../../src/core/verification/thesis-quality-gate.js";

test("deep_research mode gives every model role at least 30 EvidenceCards", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem EIU UAPA FCRA Supreme Court ECI RSF HRW Amnesty CIVICUS EPW" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);
  const packs = buildEvidencePacks(registry, contract);
  const modelPack = buildModelEvidencePack("thesis_synthesizer", packs, contract);

  assert.ok(registry.getCitationEligibleCount() >= 40);
  assert.ok(modelPack.cards.length >= 30);
});

test("fast and deep model role packs preserve minimum source-volume targets", () => {
  for (const [mode, target] of [["fast_research", 40], ["deep_research", 80]] as const) {
    const contract = buildAgendaContract({ originalUserQuery: `${mode} AIPPM online political advertising Election Commission India` });
    contract.minimumEvidenceCardsPerModel = target;
    contract.minimumUniqueCitedSources = target;
    const registry = buildEvidenceRegistryFromSources(volumeSources(90), contract);
    const packs = buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode });
    const modelPack = buildModelEvidencePack("evidence_extractor", packs, contract, { query: contract.normalizedAgenda, mode });

    assert.ok(modelPack.cards.length >= target, `${mode} only selected ${modelPack.cards.length}/${target} cards`);
  }
});

test("quality gate fails 30 citations from only two buckets", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem EIU UAPA FCRA Supreme Court ECI RSF HRW Amnesty CIVICUS EPW" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);
  const citations = Array.from({ length: 30 }, (_, index) => `[Source ${index + 1}](https://freedomhouse.org/mock-${index + 1})`).join(" ");
  const report = runThesisQualityGate(`India democratic space declined. ${citations}\n\n## Indian Mock Parliament Debate Utility Arsenal\nPOIs and rebuttals.`, contract, registry, {
    uniqueCitedSourceIds: Array.from({ length: 30 }, (_, index) => index + 1),
    citedBucketIds: ["democracy_index", "human_rights_watchdog"],
    modelRoleOutputs: [],
  });

  assert.equal(report.passed, false);
  assert.ok(report.automaticFailures.some((failure) => failure.includes("citations concentrated in only 1-2 buckets")));
});

test("quality gate passes strong 30-source citation distribution across 9 buckets", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem EIU UAPA FCRA Supreme Court ECI RSF HRW Amnesty CIVICUS EPW" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);
  const sourceIds = Array.from({ length: 30 }, (_, index) => index + 1);
  const citedBucketIds = [...new Set(sourceIds.flatMap((id) => registry.getSource(id)?.bucketIds ?? []))];
  const grounding = buildGroundingContext(registry, contract, sourceIds);
  const divisionOutputs = buildDivisionOutputs(registry, sourceIds);
  const finalText = Array.from(divisionOutputs.values()).join("\n\n");
  const report = runThesisQualityGate(finalText, contract, registry, {
    uniqueCitedSourceIds: sourceIds,
    citedBucketIds,
    modelRoleOutputs: [grounding.modelRoleOutput],
    claimLedger: grounding.claimLedger,
    claimGraph: grounding.claimGraph,
    divisionOutputs,
  });

  assert.equal(report.passed, true);
  assert.ok(report.score >= 85);
});

function volumeSources(count: number) {
  const buckets = ["government_official", "parliamentary_records", "court_legal", "policy_research", "indian_major_media"] as const;
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const bucketId = buckets[index % buckets.length];
    return {
      id,
      title: `Volume source ${id}`,
      url: `https://example${id % 17}.org/source-${id}`,
      canonicalUrl: `https://example${id % 17}.org/source-${id}`,
      domain: `example${id % 17}.org`,
      bucketIds: [bucketId],
      sourceClass: bucketId === "court_legal" ? "court_primary" : bucketId,
      authorityScore: 80,
      date: "2026-05-01",
      fullText: `Specific grounded evidence text for source ${id} about Election Commission transparency and Indian parliamentary accountability.`,
      snippet: `Specific grounded evidence text for source ${id}.`,
      extractionQuality: "full",
      keyFacts: [`Specific grounded evidence text for source ${id} about Election Commission transparency.`],
      keyNumbers: [],
      legalHoldings: bucketId === "court_legal" ? [`Legal holding from source ${id} about proportionality.`] : [],
      namedEntities: ["Election Commission of India"],
      limitations: [],
      confidence: "high",
      citationEligible: true,
      citationStrength: "strong",
    };
  }) as any;
}

function buildGroundingContext(registry: ReturnType<typeof buildEvidenceRegistryFromSources>, contract: ReturnType<typeof buildAgendaContract>, sourceIds: number[]) {
  const sourceUsageMap = sourceIds.map((sourceId) => {
    const source = registry.getSource(sourceId);
    assert.ok(source);
    return {
      sourceId,
      bucketIds: source.bucketIds,
      sourceClass: source.sourceClass,
      usageType: "fact_extracted",
      extractedClaim: source.keyFacts[0] ?? source.fullText ?? source.snippet ?? source.title,
      confidence: "high",
    };
  });
  const modelRoleOutput = {
    roleName: "thesis_synthesizer",
    minimumSourceRequirement: 30,
    requiredSourceCount: 30,
    receivedSourceIds: sourceIds,
    usedSourceIds: sourceIds,
    unusedSourceIds: [],
    sourceUsageMap,
    sourceCountUsed: 30,
    sourceRequirementSatisfied: true,
    sourceUsageCount: 30,
    sourceUsageRequirementSatisfied: true,
    output: "",
  } as any;
  const claimLedger = buildClaimLedger([modelRoleOutput], registry, sourceIds);
  const builtGraph = buildClaimGraph(registry, contract, {
    modelRoleOutputs: [modelRoleOutput],
    sourceUsageAggregate: { validUsedSourceIds: sourceIds } as any,
  });
  const claimGraph: ClaimGraph = {
    ...builtGraph,
    claims: claimLedger.items.map((item) => {
      const source = registry.getSource(item.sourceId);
      assert.ok(source);
      return {
        id: item.claimId,
        text: item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.evidenceSpan?.text ?? source.title,
        type: "fact",
        requiredSourceClasses: [source.sourceClass],
        supportingSourceIds: [item.sourceId],
        confidence: item.confidence,
        mustUseCarefulLanguage: false,
        forbiddenIfUnsupported: false,
        supportScore: 90,
        validationStatus: "approved",
        sourceClasses: [source.sourceClass],
        extractionQuality: item.evidenceSpan?.extractionQuality ?? source.extractionQuality,
        bucketIds: source.bucketIds,
      };
    }),
    counterclaims: builtGraph.counterclaims?.length ? builtGraph.counterclaims : [{
      id: "counter-methodology-1",
      text: "Opposition can counterclaim that democratic-space index methodology must be weighed against official parliamentary and legal records.",
      sourceIds: [sourceIds[0]],
      sourceClasses: [registry.getSource(sourceIds[0])!.sourceClass],
      supportScore: 80,
      requiresCarefulLanguage: true,
      limitation: "Index evidence should not be treated as a court finding.",
    }],
    contradictions: builtGraph.contradictions ?? [],
  };
  return { modelRoleOutput, claimLedger: claimLedger as ClaimLedger, claimGraph };
}

function buildDivisionOutputs(registry: ReturnType<typeof buildEvidenceRegistryFromSources>, sourceIds: number[]): Map<string, string> {
  const cite = (index: number) => registry.getCitationMarkdown(sourceIds[index]);
  const common = "India agenda thesis relies on source-backed evidence, Article 14 caution, and careful parliamentary framing for Treasury Bench and Opposition.";
  return new Map([
    ["D1", `D1 agenda india thesis: ${common} The thesis is that democratic-space claims should be argued as a calibrated institutional trend, not as an unsupported collapse narrative. Members can cite diversified registry evidence ${cite(0)} ${cite(1)} while preserving constitutional caution, committee accountability, and source-grounded language for floor debate.`],
    ["D2", `D2 dimension legal political: The legal dimension uses Article 14 and proportionality language, while the political dimension separates index evidence, government accountability, and public-order arguments. This dimension prevents overclaiming by tying every legal and political claim to cited source classes ${cite(2)} ${cite(3)} and by naming limits where evidence is inferential.`],
    ["D3", `D3 stakeholder treasury opposition: Treasury Bench stakeholders can defend legality, Election Commission process, and Union ministry accountability. Opposition stakeholders can challenge rights restrictions, federalism pressure, and institutional transparency. The stakeholder map keeps both benches source-linked ${cite(4)} ${cite(5)} and gives members debate roles without pretending all sources prove every claim.`],
    ["D4", `D4 conflict contradiction mapping: The central conflict is between constitutional legitimacy and public-order governance. The contradiction mapping separates official records, watchdog assessments, media reporting, and legal commentary so that a member can admit evidentiary limits ${cite(6)} ${cite(7)} while still pressing a coherent floor strategy.`],
    ["D5", `D5 narrative framing public: The public narrative should not say democracy has simply failed; it should frame a contested institutional record with civil-liberties evidence, legal safeguards, and parliamentary scrutiny. This framing lets Treasury Bench defend stability and lets Opposition seek accountability using cited evidence ${cite(8)} ${cite(9)}.`],
    ["D6", `D6 evidence source verification: Evidence verification requires source class, bucket spread, citation eligibility, and ClaimLedger support before a claim is used. Source verification also flags weak snippets and source gaps instead of upgrading them into strong citations ${cite(10)} ${cite(11)}. That keeps the final answer honest under PhD-level research strictness.`],
    ["D7", buildD7(registry, sourceIds)],
    ["D8", `D8 policy pathway feasibility: A feasible policy pathway combines committee review, transparent ministry replies, calibrated rights safeguards, and independent data checks. The pathway is feasible because it works through parliamentary questions, amendments, and oversight rather than unverified accusations ${cite(24)} ${cite(25)}.`],
    ["D9", `D9 if predict conditional: If Treasury Bench emphasizes stability without addressing source gaps, Opposition can predict that the debate shifts to credibility. If Opposition overclaims beyond citations, Treasury Bench can predict a successful rebuttal. Conditional strategy should stay tied to ClaimLedger-backed evidence ${cite(26)} ${cite(27)}.`],
    ["D10", `D10 risk tradeoff overclaim: The core risk is overclaiming index or legal evidence beyond what it proves. The tradeoff is between aggressive rights-based pressure and responsible parliamentary credibility. The answer should explicitly avoid overclaim and identify source gaps where the registry does not prove a claim ${cite(28)} ${cite(29)}.`],
    ["D11", `D11 strategic insights. Diagnosis: D1 and D4 show that the strategic centre is a central contradiction between constitutional legitimacy and public-order governance, while D6 proves that only ClaimLedger-backed citations should carry the final thesis ${cite(0)} ${cite(10)}. Prescription: D7 and D8 should convert that contradiction into Treasury Bench accountability language, Opposition rights scrutiny, committee motions, and feasible amendments without recycling the same evidence for both sides. The strongest counterclaim is that index evidence must be balanced against official and legal records, so members should cite source-backed distinctions rather than broad slogans. Warning: D9 and D10 show that unsupported fraud, rank, or legal claims should be qualified, removed, or recorded as a source gap, because PhD-level research fails if citations are decorative rather than grounded.`],
  ]);
}

function buildD7(registry: ReturnType<typeof buildEvidenceRegistryFromSources>, sourceIds: number[]): string {
  const cite = (index: number) => registry.getCitationMarkdown(sourceIds[index]);
  const pois = Array.from({ length: 12 }, (_, index) => {
    const stems = [
      "Would the honourable member identify the exact source proving the democratic-space trend",
      "Can the honourable member distinguish index evidence from court evidence",
      "Is the Treasury Bench claiming official records override watchdog concerns",
      "Does the Opposition accept that Article 14 caution requires precise remedies",
      "Can the Treasury Bench explain which ministry is accountable on the floor",
      "Can the Opposition show which cited source supports the rights-based challenge",
      "Which source proves the policy pathway is feasible",
      "What amendment would narrow discretion without weakening public order",
      "Would the delegate accept a committee review motion",
      "Can the honourable member avoid unsupported allegations while pressing accountability",
      "Is the Treasury Bench relying on source gaps or registry-backed facts",
      "Does the Opposition accept the counterclaim about methodology limits",
    ];
    return `POI ${index + 1}: ${stems[index]}? ${cite(12 + index)}`;
  }).join("\n");
  return `D7 debate utility. Treasury Bench: defend legality, Union ministry accountability, Election Commission process, public-order necessity, and committee review using distinct cited sources ${cite(12)} ${cite(13)}. Opposition: press rights-based challenge, federalism objection, proportionality review, transparency demands, and floor strategy using separate cited sources ${cite(18)} ${cite(19)}. Rebuttal: Treasury Bench answers methodology attacks with official and legal records, while Opposition answers public-order claims with proportionality and evidence-verification limits. Floor motion: move a committee accountability motion with an operative clause requiring source-backed ministry reporting and a preambular clause recognizing constitutional safeguards.\n${pois}`;
}
