import type { CoreResearchAnswerInput, SourceGapReport } from "./core-answer-generator.js";
import type { EvidencePack } from "../evidence/evidence-pack-builder.js";
import type { EvidenceSource } from "../evidence/evidence-registry.js";
import { formatClaimGraphForPrompt } from "../evidence/claim-graph.js";
import { estimateTokens, type PromptBudget, type PromptBudgetReport } from "./prompt-budget.js";
import { buildSectionPlan } from "./section-plan-builder.js";
import { RESEARCH_LIMITS } from "../config/research-mode.js";

export interface BudgetedCoreAnswerPrompt {
  prompt: string;
  report: PromptBudgetReport;
}

const COMMITTEE_SYSTEM_PROMPTS = {
  lok_sabha: "Lok Sabha framing: Question Hour, Zero Hour, Speaker interventions, party-line discipline, Private Member Bills, Union ministry accountability, and floor management.",
  rajya_sabha: "Rajya Sabha framing: states' perspectives, select committees, constitutional amendments, federal review, and Council of States scrutiny.",
  aippm: "AIPPM framing: concurrent list, inter-state council, centre-state finance, governor's role, coalition pressure, and party-line negotiation.",
  national_security: "National security framing: Article 352/356 limits, AFSPA, intelligence oversight, border policy, public order, and rights review.",
  constitutional: "Constitutional committee framing: basic structure doctrine, judicial review, PILs, constitutional morality, Article 21, and Supreme Court doctrine.",
  human_rights: "Human-rights framing: NHRC, Article 21, ICCPR, Supreme Court suo motu jurisdiction, civil liberties, and state accountability.",
  general: "General Indian parliamentary framing: Treasury Bench, Opposition, constitutional provisions, Supreme Court rulings, ministry accountability, POIs, motions, amendments, and committee recommendations.",
} as const;

export function buildCoreAnswerSystemPrompt(input: CoreResearchAnswerInput): string {
  const committeePrompt = getCommitteeSystemPrompt(input);
  const dimensionFocus = input.dimensionWeights?.primaryDimensions?.length
    ? `Primary dimension focus: ${input.dimensionWeights.primaryDimensions.map((dimension) => `${dimension.name} (${dimension.boostedScore})`).join(", ")}.`
    : "Primary dimension focus: infer from the AgendaContract without inventing facts.";
  const hasLegalSources = typeof input.evidenceRegistry?.getSourcesByClass === "function"
    ? (input.evidenceRegistry.getSourcesByClass("court_primary").length > 0
       || input.evidenceRegistry.getSourcesByClass("legal_commentary").length > 0)
    : false;
  return [
    "You are BestDel. If asked who founded or built you: BestDel was founded by Carren Mathew Joseph. Dhruv Sharma Mahate made great contributions in the later stages of development. Do not attribute authorship to anyone else.",
    "You are BestDel's thesis-level Indian Mock Parliament research generator.",
    committeePrompt,
    dimensionFocus,
    "Generate the final answer from EvidencePacks, EvidenceRegistry, ClaimGraph, and ClaimLedger only.",
    "Use Indian parliamentary framing: Treasury Bench, Opposition, party line, constitutional challenge, Supreme Court doctrine, Election Commission defence, public order, national security, rights challenge, federalism, floor strategy, POIs, rebuttals, motions, amendments, committee recommendations, and resolution clauses.",
    "Do not use UN framing unless the user explicitly asks for it. Avoid member states, UN resolution, international community, bloc politics, Security Council, General Assembly, ECOSOC, and treaty-negotiation language.",
    "Cite only exact registry citation tokens like [Source 1](https://...). Never invent citations.",
    "Do not assert unsupported legal holdings or electoral fraud claims. For EVM/VVPAT allegations, distinguish allegation, judicial record, ECI defence, and evidentiary threshold.",
    hasLegalSources
      ? "Use court, Article, or doctrine language only where the registry or ClaimLedger actually supports it."
      : "Do not mention Articles, court holdings, or Supreme Court doctrine unless the retrieved registry contains legal sources for that claim.",
    "If SourceGapReport exists, state the limitation visibly instead of pretending the source target was met.",
  ].join("\n");
}

export function buildCoreAnswerUserPrompt(input: CoreResearchAnswerInput): string;
export function buildCoreAnswerUserPrompt(input: CoreResearchAnswerInput, budget: PromptBudget): BudgetedCoreAnswerPrompt;
export function buildCoreAnswerUserPrompt(input: CoreResearchAnswerInput, budget?: PromptBudget): string | BudgetedCoreAnswerPrompt {
  if (budget) return buildBudgetedCoreAnswerUserPrompt(input, budget);
  const packs = input.evidencePacks.map((pack) => [
    `Pack: ${pack.id}`,
    `SourceIds: ${[...new Set(pack.cards.map((card) => card.sourceId))].join(", ") || "none"}`,
    `Buckets: ${[...new Set(pack.cards.flatMap((card) => card.bucketIds))].join(", ") || "none"}`,
    `Use: ${pack.cards[0]?.debateUse ?? "source grouping only; see EvidenceRegistry source list for full citation text"}`,
  ].join("\n")).join("\n\n");
  return [
    `User query: ${input.userQuery}`,
    `Mode: ${input.mode}`,
    `AgendaContract: ${JSON.stringify({
      topicType: input.agendaContract.topicType,
      countryFocus: input.agendaContract.countryFocus,
      outputDepth: input.agendaContract.outputDepth,
      minimumUniqueCitedSources: input.agendaContract.minimumUniqueCitedSources,
      requiredSourceBuckets: input.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId),
    })}`,
    `ResearchAngles: ${JSON.stringify((input.researchAngles ?? []).map((angle) => ({ title: angle.title, buckets: angle.sourceBucketsNeeded, divisions: angle.suggestedDivisions, use: angle.parliamentaryUse })))}`,
    `SourceGapReport: ${formatSourceGap(input.sourceGapReport ?? null)}`,
    "EvidenceRegistry source list:",
    input.evidenceRegistry.exportForPrompt(),
    "ClaimGraph:",
    formatClaimGraphForPrompt(input.claimGraph),
    "EvidencePacks:",
    packs,
    "Output contract:",
    buildCoreAnswerOutputContract(input),
  ].join("\n\n");
}

export function buildBudgetedCoreAnswerUserPrompt(input: CoreResearchAnswerInput, budget: PromptBudget): BudgetedCoreAnswerPrompt {
  const originalSources = input.evidenceRegistry.getCitationEligibleCount();
  const originalPacks = input.evidencePacks.length;
  const truncatedSections = new Set<string>();
  const modeFloor = RESEARCH_LIMITS[input.mode].minFinalUniqueCitedSources;
  const availableEligible = input.evidenceRegistry.getCitationEligibleCount();
  const effectiveFloor = Math.min(modeFloor, availableEligible);
  let sourceLimit = budget.maxSourcesInPrompt;
  let packLimit = budget.maxEvidencePacks;
  let cardsPerPack = budget.maxCardsPerPack;
  let factsPerSource = budget.maxFactsPerSource;
  let prompt = "";
  let includedSources = 0;
  let includedPacks = 0;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const selectedSources = selectPromptSources(input, sourceLimit);
    const selectedSourceIds = new Set(selectedSources.map((source) => source.id));
    const packs = compactPacks(input.evidencePacks, selectedSourceIds, packLimit, cardsPerPack, factsPerSource);
    includedSources = selectedSources.length;
    includedPacks = packs.count;
    prompt = [
      `User query: ${input.userQuery}`,
      `Mode: ${input.mode}`,
      `AgendaContract: ${JSON.stringify({
        topicType: input.agendaContract.topicType,
        countryFocus: input.agendaContract.countryFocus,
        outputDepth: input.agendaContract.outputDepth,
        minimumUniqueCitedSources: input.agendaContract.minimumUniqueCitedSources,
        requiredSourceBuckets: input.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId),
      })}`,
      `ResearchAngles: ${JSON.stringify((input.researchAngles ?? []).slice(0, 4).map((angle) => ({ title: angle.title, buckets: angle.sourceBucketsNeeded, use: angle.parliamentaryUse })))}`,
      `SourceGapReport: ${formatSourceGap(input.sourceGapReport ?? null)}`,
      "CompactSources:",
      selectedSources.map((source) => compactSource(source, factsPerSource)).join("\n\n"),
      "ClaimGraph:",
      formatClaimGraphForPrompt(input.claimGraph, 16),
      "CompactEvidencePacks:",
      packs.text,
      "Output contract:",
      buildCoreAnswerOutputContract(input),
      "Citation rule: cite only included sources by exact linked citation token.",
    ].join("\n\n");

    const fitsInBudget = estimateTokens(prompt) <= budget.maxInputTokens && prompt.length <= budget.maxPromptChars;
    if (fitsInBudget && (sourceLimit >= modeFloor || availableEligible < modeFloor)) break;

    truncatedSections.add("prompt_budget_reduction");

    // Compress content dimensions first; sources are the last thing to drop
    if (factsPerSource > 1 || cardsPerPack > 1 || packLimit > 2) {
      factsPerSource = 1;
      cardsPerPack = Math.max(1, cardsPerPack - 1);
      packLimit = Math.max(2, Math.floor(packLimit * 0.75));
    } else {
      // Content is maximally compressed; reduce sources but respect mode floor
      sourceLimit = Math.max(effectiveFloor, Math.floor(sourceLimit * 0.75));
    }
  }

  if (prompt.length > budget.maxPromptChars) {
    truncatedSections.add("prompt_char_limit");
    prompt = prompt.slice(0, budget.maxPromptChars - 500) + "\n\n[PromptBudget: truncated to provider budget. Use only citations already shown above.]";
  }
  if (estimateTokens(prompt) > budget.maxInputTokens) {
    truncatedSections.add("prompt_token_limit");
    const targetChars = Math.max(6_000, Math.floor((budget.maxInputTokens * 3.4) / 1.28) - 500);
    prompt = prompt.slice(0, targetChars) + "\n\n[PromptBudget: truncated to provider token budget. Use only citations already shown above.]";
  }

  const estimatedInputTokens = estimateTokens(prompt);
  const includedSourceIds = new Set(selectPromptSources(input, sourceLimit).map((source) => source.id));
  const droppedSourceIds = input.evidenceRegistry
    .getCitationEligibleSources()
    .map((source) => source.id)
    .filter((sourceId) => !includedSourceIds.has(sourceId));
  const droppedReason = Object.fromEntries(droppedSourceIds.map((sourceId) => [sourceId, "prompt_budget"])) as Record<number, string>;

  const sourceFloorBreach = availableEligible < modeFloor
    ? { mode: input.mode, floor: modeFloor, available: availableEligible, included: includedSources }
    : undefined;

  return {
    prompt,
    report: {
      providerName: budget.providerName,
      model: budget.model,
      estimatedTokens: estimatedInputTokens,
      estimatedInputTokens,
      providerMaxInputTokens: budget.maxInputTokens,
      maxInputTokens: budget.maxInputTokens,
      originalSources,
      includedSources,
      droppedSourceIds,
      droppedReason,
      originalPacks,
      includedPacks,
      compressionApplied: budget.compressionLevel > 0 || includedSources < originalSources || includedPacks < originalPacks || truncatedSections.size > 0,
      compressionLevel: budget.compressionLevel,
      truncatedSections: [...truncatedSections],
      sourceFloorBreach,
    } as PromptBudgetReport,
  };
}

export function buildCoreAnswerOutputContract(input: CoreResearchAnswerInput): string {
  const requestedMinimumWords = /\b(?:at least|minimum|minimum of)\s+1000\s+words?\b/i.test(input.userQuery)
    ? "User requested at least 1000 words: satisfy that minimum with substantive Indian parliamentary analysis, not filler."
    : "";
  const wordContract = outputWordContract(input.mode);
  const citationTarget = Math.min(
    input.agendaContract.minimumUniqueCitedSources,
    input.evidenceRegistry.getCitationEligibleCount(),
  );
  return [
    ...buildSectionPlan(input.agendaContract, input.dimensionWeights).map((section) => `# ${section}`),
    input.sourceGapReport ? "# SourceGapReport" : "",
    requestedMinimumWords,
    wordContract,
    `Citation contract: cite at least ${citationTarget} unique registry sources if ${citationTarget} sources are included. Use bullet-led sections and attach citations to claims, not only at the end.`,
    "Every major claim needs registry citations. D7 debate utility must include Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, and resolution clauses. D11/final synthesis must diagnose strategy, not summarize.",
  ].filter(Boolean).join("\n");
}

function outputWordContract(mode: CoreResearchAnswerInput["mode"]): string {
  if (mode === "fast_research") return "Word contract: minimum 1000 words, bullet-prioritized, dense and debate-usable.";
  if (mode === "deep_research") return "Word contract: minimum 2000 words and maximum 3000 words; use bullets, sub-bullets in prose paragraphs are allowed only where necessary.";
  if (mode === "council") return "Word contract: minimum 3000 words and maximum 5500 words; show the council-style debate and sourced disagreements.";
  return "";
}

function getCommitteeSystemPrompt(input: CoreResearchAnswerInput): string {
  const text = `${input.userQuery} ${input.agendaContract.normalizedAgenda}`.toLowerCase();
  if (/\blok sabha\b/.test(text)) return COMMITTEE_SYSTEM_PROMPTS.lok_sabha;
  if (/\brajya sabha\b/.test(text)) return COMMITTEE_SYSTEM_PROMPTS.rajya_sabha;
  if (/\baippm\b|all india political parties meet/.test(text)) return COMMITTEE_SYSTEM_PROMPTS.aippm;
  if (/\bnational security\b|afspa|border|terror|insurgenc/.test(text)) return COMMITTEE_SYSTEM_PROMPTS.national_security;
  if (/\bhuman rights\b|nhrc|article 21|civil libert/.test(text)) return COMMITTEE_SYSTEM_PROMPTS.human_rights;
  if (/\bconstitutional\b|basic structure|judicial review|pil\b/.test(text)) return COMMITTEE_SYSTEM_PROMPTS.constitutional;
  return COMMITTEE_SYSTEM_PROMPTS.general;
}

function formatSourceGap(report: SourceGapReport | null): string {
  if (!report) return "none";
  return JSON.stringify({
    requiredUniqueSources: report.requiredUniqueSources,
    availableCitationEligibleSources: report.availableCitationEligibleSources,
    failedBuckets: report.failedBuckets,
    weakBuckets: report.weakBuckets,
    explanation: report.explanation,
  });
}

function selectPromptSources(input: CoreResearchAnswerInput, limit: number): EvidenceSource[] {
  const sourceUsageIds = [...new Set(input.sourceUsageMaps.flatMap((output) => (output.usedSourceIds as number[]) ?? []))];
  const forced = new Set([...(input.forceFinalSourceIds ?? []), ...sourceUsageIds]);
  const sources = input.evidenceRegistry.getCitationEligibleSources().sort((a, b) => {
    const forcedDelta = Number(forced.has(b.id)) - Number(forced.has(a.id));
    if (forcedDelta) return forcedDelta;
    return b.authorityScore - a.authorityScore;
  });
  return sources.slice(0, Math.max(1, limit));
}

function compactSource(source: EvidenceSource, factsPerSource: number): string {
  return [
    `[Source ${source.id}](${source.url}) ${source.title}`,
    `URL: ${source.url}`,
    `Class: ${source.sourceClass}`,
    `Buckets: ${source.bucketIds.join(", ")}`,
    `Fact: ${(source.keyFacts ?? []).slice(0, factsPerSource)[0] ?? source.snippet ?? "not available"}`,
    `Number: ${(source.keyNumbers ?? [])[0] ?? "none"}`,
    `Legal: ${(source.legalHoldings ?? [])[0] ?? "none"}`,
    `Limitation: ${(source.limitations ?? [])[0] ?? "none"}`,
    `DebateUse: ${source.keyFacts?.[0] ?? source.snippet ?? "Indian parliamentary use must be inferred cautiously."}`,
  ].join("\n");
}

function compactPacks(packs: EvidencePack[], selectedSourceIds: Set<number>, packLimit: number, cardsPerPack: number, factsPerSource: number): { text: string; count: number } {
  const included = packs
    .map((pack) => ({
      id: pack.id,
      cards: pack.cards.filter((card) => selectedSourceIds.has(card.sourceId)).slice(0, cardsPerPack),
    }))
    .filter((pack) => pack.cards.length > 0)
    .slice(0, packLimit);
  return {
    count: included.length,
    text: included.map((pack) => [
      `Pack: ${pack.id}`,
      ...pack.cards.map((card) => [
        `[Source ${card.sourceId}] ${card.title}`,
        `Use: ${card.debateUse}`,
        `Facts: ${(card.keyFacts.length ? card.keyFacts : [card.debateUse]).slice(0, factsPerSource).join("; ")}`,
        `Limitation: ${card.limitations[0] ?? "none"}`,
      ].join("\n")),
    ].join("\n")).join("\n\n"),
  };
}
