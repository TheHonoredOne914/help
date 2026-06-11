import { buildAgendaContract } from "../src/core/agenda/agenda-contract.js";
import { buildClaimGraph } from "../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../src/core/evidence/evidence-registry.js";
import { buildCoreAnswerUserPrompt } from "../src/core/generation/core-answer-prompt.js";
import { estimateTokens, getPromptBudget } from "../src/core/generation/prompt-budget.js";

const agendaContract = buildAgendaContract({ requestId: "smoke-budget", originalUserQuery: "AIPPM debate on Election Commission accountability, Supreme Court doctrine, and civil liberties" });
agendaContract.minimumUniqueCitedSources = 10;
agendaContract.minimumEvidenceCardsPerModel = 10;
const buckets = agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId);
const sources: EvidenceSource[] = Array.from({ length: 25 }, (_, index) => ({
  id: index + 1,
  title: `Budget source ${index + 1}`,
  url: `https://example.org/budget-${index + 1}`,
  canonicalUrl: `https://example.org/budget-${index + 1}`,
  domain: "example.org",
  bucketIds: [buckets[index % buckets.length] ?? "policy_research"],
  sourceClass: "policy_research",
  authorityScore: 80,
  date: "2026-05-22",
  fullText: `Evidence on Treasury Bench, Opposition, constitutional challenge, public order, and rights-based challenge ${index + 1}.`,
  snippet: `Evidence ${index + 1}`,
  extractionQuality: "full",
  keyFacts: [`Specific fact ${index + 1}`],
  keyNumbers: [`${index + 1}`],
  legalHoldings: [],
  namedEntities: [],
  limitations: [`Limitation ${index + 1}`],
  confidence: "high",
  citationEligible: true,
}));

const evidenceRegistry = buildEvidenceRegistryFromSources(sources, agendaContract);
const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
const budget = getPromptBudget({ providerName: "groq", model: "llama-3.3-70b-versatile", mode: "fast_research" });
const { prompt, report } = buildCoreAnswerUserPrompt({
  requestId: "smoke-budget",
  userQuery: agendaContract.originalUserQuery,
  mode: "fast_research",
  agendaContract,
  evidenceRegistry,
  evidencePacks,
  claimGraph,
  sourceUsageMaps: [],
}, budget);

console.log(`prompt estimatedTokens=${estimateTokens(prompt)}`);
console.log(`prompt budget=${budget.maxInputTokens}`);
console.log(`compressionApplied=${report.compressionApplied} includedSources=${report.includedSources} includedPacks=${report.includedPacks}`);
if (estimateTokens(prompt) > budget.maxInputTokens) throw new Error("prompt budget exceeded");
console.log("smoke:core-generation-budget passed");
