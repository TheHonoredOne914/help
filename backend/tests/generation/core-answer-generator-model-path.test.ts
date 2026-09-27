import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildClaimGraph } from "../../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { buildCoreAnswerUserPrompt, buildCoreAnswerSystemPrompt } from "../../src/core/generation/core-answer-prompt.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";
import { RESEARCH_LIMITS } from "../../src/core/config/research-mode.js";
import { buildModeSourceUsageMap } from "../helpers/source-usage-fixtures.js";

function setup() {
  const agendaContract = buildAgendaContract({ requestId: "model-gen", originalUserQuery: "India democratic space 2022-2025 Freedom House V-Dem ECI Supreme Court RSF" });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  return { agendaContract, evidenceRegistry, evidencePacks, claimGraph };
}

test("model path calls provider router and validates registry citations", async () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  let called = false;
  const ids = evidenceRegistry.getCitationEligibleSources().slice(0, RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources).map((source) => source.id);
  const citations = ids.map((id) => evidenceRegistry.getCitationMarkdown(id)).join(" ");
  const providerRouter = {
    complete: async (_provider: string, request: any) => {
      called = true;
      assert.equal(request.roleName, "core_answer_generator");
      return {
        provider: "gemini",
        model: "test",
        content: `# Executive Thesis\nIndian Mock Parliament thesis with Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, central contradiction and strategic synthesis. ${citations}\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench arguments and Opposition arguments.\n\n## Methodology and Source Base\nSources are cited properly.\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench arguments and Opposition arguments.\nAmendment: Clause: 1.\n\n## Final Strategic Synthesis\nDo not summarize; diagnose strategy.\nDiagnosis: test. Prescription: test. Warning: test.`,
      };
    },
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "model-path",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildModeSourceUsageMap("deep_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test-model",
  });

  assert.equal(called, true);
  assert.ok(result.uniqueCitedSourceCount >= RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources);
});

test("fake citations and UN-style model answer are repaired with a citation ledger", async () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const providerRouter = {
    complete: async () => ({
      provider: "gemini",
      model: "test",
      content: "# Executive Thesis\nMember states in the international community should pass a UN resolution [Source 999](https://fake.example).",
    }),
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "bad-model-path",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildModeSourceUsageMap("deep_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test-model",
  });

  assert.ok(result.uniqueCitedSourceCount >= RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources);
  assert.match(result.finalAnswer, /## (Citation Ledger|Additional Source-Backed Bullets)/i);
  assert.doesNotMatch(result.finalAnswer, /\[Source 999\]|https:\/\/fake\.example/i);
});

test("fast_research model path rebuilds from preferred sources on fake_citations/source_quality fatals", async () => {
  const agendaContract = buildAgendaContract({
    requestId: "fast-model-rebuild",
    originalUserQuery: "AIPPM debate: Election Commission regulate online political advertising deepfakes platform transparency",
  });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  const providerRouter = {
    complete: async () => ({
      provider: "groq",
      model: "test",
      content: [
        "# Executive Thesis",
        "Regulate deepfakes now [Source 1](https://wrong.example/not-in-registry).",
        "[Source 2] without a url and [Source 999](https://fake.example).",
        "## Methodology and Source Base",
        "Mostly one bucket of weak snippets for government_official only.",
        "## Final Strategic Synthesis",
        "Diagnosis: test. Prescription: test. Warning: test.",
      ].join("\n"),
    }),
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "fast-model-rebuild",
    userQuery: agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    // Live fast_research often has a weak/failed media bucket AND concentration fatals;
    // preferred-source rebuild must still run (do not gate on !sourceGapReport).
    sourceGapReport: {
      explanation: "indian_major_media stayed below floor after enrichment.",
      requiredUniqueSources: 40,
      availableCitationEligibleSources: evidenceRegistry.getCitationEligibleSources().length,
      failedBuckets: ["indian_major_media"],
      weakBuckets: [],
      attemptedQueries: [],
      providerErrors: [],
      enrichmentFailures: [],
      repairAttempted: true,
    },
    sourceUsageMaps: [buildModeSourceUsageMap("fast_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter,
    providerName: "groq",
    model: "test-model",
  });

  assert.ok(
    result.repairPasses.some((pass) => pass.type === "citation_repair" && pass.accepted && /preferred full\/medium/i.test(pass.reasons.join(" "))),
    "model path should accept preferred-source rebuild instead of throwing",
  );
  assert.ok(result.uniqueCitedSourceCount > 0);
  assert.doesNotMatch(result.finalAnswer, /https:\/\/wrong\.example|https:\/\/fake\.example|\[Source 999\]/i);
});

function withoutLedgerAndLandscape(text: string): string {
  return text.replace(/(?:^|\n)##[^\n]*\b(?:Evidence Landscape|Citation Ledger)\b[\s\S]*?(?=\n##\s+|$)/gi, "\n");
}

test("under-cited model prose gets registry anchors and fabricated source-gap notice stripped", async () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const source1 = evidenceRegistry.getCitationMarkdown(1);
  assert.ok(source1, "fixture must expose Source 1");
  const filler = Array.from({ length: 40 }, (_, i) =>
    `Point ${i + 1}: Treasury Bench and Opposition trade procedural motions, committee referrals, and floor strategy without inventing court holdings.`,
  ).join(" ");
  const providerRouter = {
    complete: async () => ({
      provider: "groq",
      model: "test",
      content: [
        "# Executive Thesis",
        `Indian Mock Parliament thesis on democratic space. ${filler}`,
        `Only one docket is usable ${source1}.`,
        "> **Source-Gap Notice** – The agenda requires 40 sources but only one docket exists.",
        "## Methodology and Source Base",
        "| parliamentary_records | **None** in the current scrape | **Source‑Gap Notice:** No transcripts. |",
        "| indian_major_media | *None* in the current scrape | missing |",
        "| court_legal | None | No verified institutional judgments or statutory citations are present in the supplied dataset. |",
        "| **Target of 40 unique sources** | 4 (all government-official) | **Source‑gap** – the brief cannot meet the minimum-source requirement. |",
        "The brief falls short of the **minimum 40** unique cited sources stipulated in the agenda.",
        "The research brief draws exclusively from the four available sources.",
        "Because the current evidence pool contains only four government‑official documents, the brief cannot satisfy the “minimum 40 unique cited sources” criterion.",
        "**Source‑gap:** No court‑law or media citations available in the current dataset.",
        filler,
        "## Indian Mock Parliament Debate Utility Arsenal",
        "Treasury Bench arguments and Opposition arguments. Amendment: Clause: 1. POIs and rebuttals.",
        filler,
        "## Final Strategic Synthesis",
        "Diagnosis: thin evidence narrative. Prescription: use the registry. Warning: do not invent gaps.",
        filler,
      ].join("\n"),
    }),
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "under-cited-body",
    userQuery: agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildModeSourceUsageMap("fast_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter,
    providerName: "groq",
    model: "test-model",
  });

  assert.doesNotMatch(result.finalAnswer, /Source[-‑\u2011]?\s*Gap Notice/i);
  assert.doesNotMatch(result.finalAnswer, /None in the current scrape/i);
  assert.doesNotMatch(result.finalAnswer, /falls short of the\s+\*{0,2}minimum 40/i);
  assert.doesNotMatch(result.finalAnswer, /draws exclusively from the four available sources/i);
  assert.doesNotMatch(result.finalAnswer, /evidence pool contains only four/i);
  assert.doesNotMatch(result.finalAnswer, /cannot (?:meet|satisfy) the/i);
  assert.doesNotMatch(result.finalAnswer, /\*{0,2}Source[-‑\u2011]?\s*gap\*{0,2}\s*:/i);
  assert.match(result.finalAnswer, /## Additional Source-Backed Bullets/i);
  assert.doesNotMatch(result.finalAnswer, /## Registry Evidence Landscape/i);
  assert.ok(
    result.repairPasses.some((pass) => /scrubbed fabricated source-gap|wove registry claim anchors/i.test(pass.reasons.join(" "))),
    "should record claim-anchor repair",
  );
  const citedBody = withoutLedgerAndLandscape(result.finalAnswer);
  const citedIds = new Set([...citedBody.matchAll(/\[Source\s+(\d+)\]/gi)].map((m) => Number(m[1])));
  assert.ok(citedIds.size >= 10, `expected ≥10 body cites excluding landscape/ledger, got ${citedIds.size}`);
  assert.equal(result.uniqueCitedSourceCount, citedIds.size);
});

test("core answer prompt forbids false source-gap when report is none", () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const system = buildCoreAnswerSystemPrompt({
    requestId: "anti-gap",
    userQuery: agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [],
  });
  assert.match(system, /SourceGapReport is none/i);
  assert.match(system, /never invent empty buckets/i);
});

test("core answer prompt includes EvidenceRegistry source contract and SourceGapReport", () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const prompt = buildCoreAnswerUserPrompt({
    requestId: "prompt",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildModeSourceUsageMap("deep_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    sourceGapReport: {
      requiredUniqueSources: 30,
      availableCitationEligibleSources: 12,
      failedBuckets: ["court_legal"],
      weakBuckets: [],
      attemptedQueries: ["India court"],
      providerErrors: [],
      enrichmentFailures: [],
      explanation: "limited sources",
      repairAttempted: false,
    },
  });

  assert.match(prompt, /EvidenceRegistry/i);
  assert.match(prompt, /SourceGapReport/i);
  assert.match(prompt, /\[Source 1\]/);
});

test("deterministic generation uses agenda framing instead of hardcoded democracy-space thesis", async () => {
  const agendaContract = buildAgendaContract({
    requestId: "gst-agenda",
    originalUserQuery: "AIPPM debate on GST compensation, fiscal federalism, and Union-state accountability",
  });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);

  const result = await generateCoreResearchAnswer({
    requestId: "gst-deterministic",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildModeSourceUsageMap("deep_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    allowSyntheticSourceUsage: true,
    generationMode: "deterministic",
  });

  assert.match(result.finalAnswer, /GST compensation|fiscal federalism|Union-state accountability/i);
});
