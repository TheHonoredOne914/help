import { buildCompressedEvidenceBlock, buildEvidenceBlockForDivision } from "../lib/evidence-registry.js";
import { DIVISION_REGISTRY, PARLIAMENTARY_REGISTER_RULES, type Division } from "../lib/division-framework.js";
import { buildHallucinationGuard, validateDivisionOutput } from "../lib/hallucination-guard.js";
import { logger } from "../lib/logger.js";
import { telemetry } from "../lib/telemetry.js";
import { estimateTokens, resolveModelProfile, truncateToTokenBudget, type ModelCapabilityProfile } from "../lib/token-budget.js";
import type { DimensionEngineOutput, DimensionName, EvidenceRegistry } from "../lib/types.js";

export interface DivisionGenerationContext {
  engine: DimensionEngineOutput;
  registry: EvidenceRegistry;
  priorDivisionOutputs: Map<string, string>;
  discussionText?: string;
}

export interface ModelPoolEntry {
  client: any;
  modelId: string;
}

const HIGH_VALUE_DIVISIONS = new Set(["analytical_dimensions", "debate_utility", "strategic_insights"]);

// Dependency graph for parallel execution
const DIVISION_DEPENDENCIES: Record<string, string[]> = {
  core_brief:             [],              // D1: independent
  analytical_dimensions:  [],              // D2: independent (uses engine, not D1)
  stakeholder_mapping:    [],              // D3: independent
  conflict_mapping:       ["core_brief"],  // D4: needs D1 for agenda framing
  narrative_analysis:     ["core_brief"],  // D5: needs D1
  evidence_verification:  [],              // D6: independent (registry-based)
  debate_utility:         ["core_brief", "analytical_dimensions", "stakeholder_mapping",
                           "conflict_mapping", "narrative_analysis", "evidence_verification"],
  policy_pathways:        ["analytical_dimensions"],
  predictive_analysis:    ["conflict_mapping", "stakeholder_mapping"],
  resolution_support:     ["policy_pathways"],
  strategic_insights:     ["core_brief", "analytical_dimensions", "stakeholder_mapping",
                           "conflict_mapping", "narrative_analysis", "evidence_verification",
                           "debate_utility", "policy_pathways", "predictive_analysis",
                           "resolution_support"],
};

// Division-specific token budgets for adequate generation depth
export const DIVISION_MAX_TOKENS: Record<string, number> = {
  core_brief:             2800,
  analytical_dimensions:  6400,
  stakeholder_mapping:    3000,
  conflict_mapping:       3000,
  narrative_analysis:     3000,
  evidence_verification:  3000,
  debate_utility:         8000,
  policy_pathways:        2800,
  predictive_analysis:    2400,
  resolution_support:     3000,
  strategic_insights:     5600,
};

export async function generateSequentialDivisions(
  engine: DimensionEngineOutput,
  registry: EvidenceRegistry,
  modelPool: ModelPoolEntry[],
  opts: {
    streamDivision?: (divisionId: string, content: string) => void;
    onDivisionChunk?: (divisionId: string, chunk: string) => void;
    onProgress?: (divisionNumber: number, total: number) => void;
    discussionText?: string;
    requestId?: string;
  } = {}
): Promise<Map<string, string>> {
  if (modelPool.length === 0) throw new Error("No model pool entries for division generation");

  const priorDivisionOutputs = new Map<string, string>();
  const activeDivisions = DIVISION_REGISTRY.filter((division) =>
    division.alwaysPresent || division.activationCondition?.(engine)
  ).sort((a, b) => a.number - b.number);

  const ctx: DivisionGenerationContext = {
    engine,
    registry,
    priorDivisionOutputs,
    discussionText: opts.discussionText,
  };
  const completed = new Set<string>();
  let wave = 0;

  while (completed.size < activeDivisions.length) {
    const readyNow = activeDivisions.filter(div => {
      if (completed.has(div.id)) return false;
      const deps = DIVISION_DEPENDENCIES[div.id] ?? [];
      return deps.every(depId => completed.has(depId));
    });

    if (readyNow.length === 0) {
      throw new Error(`[division-engine] Deadlock at wave ${wave}. Completed: ${[...completed].join(", ")}`);
    }

    const wavePromises = readyNow.map((division) => {
      const divisionIndex = activeDivisions.indexOf(division);
      const modelIdx = HIGH_VALUE_DIVISIONS.has(division.id)
        ? 0
        : (modelPool.length > 1 ? ((division.number - 1) % modelPool.length) : 0);
      const model = modelPool[modelIdx] ?? modelPool[0];
      return generateDivision(
        division,
        ctx,
        model.client,
        model.modelId,
        { ...opts, divisionIndex, totalDivisions: activeDivisions.length }
      ).then(output => ({ id: division.id, output }));
    });

    const waveResults = await Promise.all(wavePromises);
    for (const { id, output } of waveResults) {
      priorDivisionOutputs.set(id, output);
      completed.add(id);
    }

    wave++;
  }

  return priorDivisionOutputs;
}

export async function runDivisionPipeline(
  engine: DimensionEngineOutput,
  registry: EvidenceRegistry,
  modelPool: ModelPoolEntry[],
  opts: {
    streamDivision?: (divisionId: string, content: string) => void;
    onDivisionChunk?: (divisionId: string, chunk: string) => void;
    onProgress?: (divisionNumber: number, total: number) => void;
    discussionText?: string;
    requestId?: string;
  } = {}
): Promise<{ divisions: Map<string, string>; assembledBriefing: string }> {
  const divisions = await generateSequentialDivisions(engine, registry, modelPool, opts);
  const assembledBriefing = assembleDivisions(divisions, engine);
  
  // Quality gate with repair pass
  const { runQualityGate } = await import("../lib/quality-gate.js");
  const firstPassReport = runQualityGate(assembledBriefing, engine, registry);
  
  if (firstPassReport.criticalFailures.length > 0) {
    logger.info({ failures: firstPassReport.criticalFailures }, "[pipeline] Running quality repair pass");
    const repairedDivisions = await regenerateCriticalDivisions(
      divisions,
      firstPassReport,
      engine,
      registry,
      modelPool,
      opts.requestId
    );
    const repairedBriefing = assembleDivisions(repairedDivisions, engine);
    return { divisions: repairedDivisions, assembledBriefing: repairedBriefing };
  }
  
  return { divisions, assembledBriefing };
}

function assembleDivisions(
  divisions: Map<string, string>,
  engine: DimensionEngineOutput
): string {
  const preamble = buildBriefingPreamble(engine);
  return preamble + DIVISION_REGISTRY.map((division) => {
    const raw = divisions.get(division.id) ?? `[${division.name} - generation incomplete]`;
    const cleaned = stripDivisionHeader(raw, division.number);
    return `\n\n---\n## ${division.name}\n\n${cleaned}`;
  }).join("") + "\n";
}

function stripDivisionHeader(output: string, divisionNumber: number): string {
  return output.replace(
    new RegExp(`^\\s*(?:#{1,3}\\s*)?DIVISION\\s+${divisionNumber}\\b[^\\n]*\\n`, "i"),
    ""
  ).trim();
}

function buildBriefingPreamble(engine: DimensionEngineOutput): string {
  return [
    "# PARLIAMENTARY INTELLIGENCE BRIEFING",
    `**Agenda:** ${engine.agendaText}`,
    `**Committee:** ${engine.committeeType.replace(/_/g, " ").toUpperCase()}`,
    `**Agenda Class:** ${engine.agendaClass.replace(/_/g, " ").toUpperCase()}`,
    `**Primary Dimensions:** ${engine.primaryDimensions.map((dimension) => dimension.name).join(", ")}`,
    `**Debate Register:** ${engine.structuralDNA.debateRegister.toUpperCase()}`,
    "",
  ].join("\n");
}

async function generateDivision(
  division: Division,
  ctx: DivisionGenerationContext,
  client: any,
  modelId: string,
  opts: {
    streamDivision?: (divisionId: string, content: string) => void;
    onDivisionChunk?: (divisionId: string, chunk: string) => void;
    onProgress?: (divisionNumber: number, total: number) => void;
    divisionIndex: number;
    totalDivisions: number;
    requestId?: string;
  }
): Promise<string> {
  // Use division-specific token budgets for adequate depth
  const modelProfile = resolveModelProfile(modelId);
  const maxTokens = Math.min(
    DIVISION_MAX_TOKENS[division.id] ?? Math.ceil(division.minWordsForPrimary * 2.0),
    modelProfile.maxOutputTokens,
  );
  
  const basePrompt = division.id === "strategic_insights"
    ? buildDivision11SpecializedPrompt(ctx.engine, ctx.priorDivisionOutputs, ctx.registry, ctx.discussionText)
    : buildDivisionPrompt(division, ctx, modelProfile);
  const prompt = adaptDivisionPromptForModel(basePrompt, modelId, division, modelProfile);
  const generationMaxTokens = getDivisionMaxTokensForModel(modelId, maxTokens);

  // Temperature calibration for debate register
  const temperature = division.id === "strategic_insights" ? 0.45
    : division.id === "debate_utility" && ctx.engine.structuralDNA.debateRegister === "combative" ? 0.42
    : division.id === "debate_utility" && ctx.engine.structuralDNA.debateRegister === "technical" ? 0.15
    : 0.25;
  
  const start = Date.now();
  const onChunk = opts.onDivisionChunk
    ? (chunk: string) => opts.onDivisionChunk!(division.id, chunk)
    : undefined;
  let output = await callModel(client, modelId, prompt, generationMaxTokens, temperature, division.id, onChunk);
  
  // Retry logic with escalating thesis mandate.
  for (let attempt = 0; attempt < 3; attempt++) {
    const wordCount = output.trim().split(/\s+/).filter(Boolean).length;
    const threshold = division.minWordsForPrimary * (attempt === 0 ? 0.95 : attempt === 1 ? 0.85 : 0.70);
    
    if (wordCount >= threshold) break;
    
    const retryAddendum = attempt === 0
      ? `\n\nYour output is ${wordCount} words. MANDATORY MINIMUM: ${division.minWordsForPrimary} words. Continue from where you stopped and complete all analytical layers.`
      : attempt === 1
        ? `\n\nSTILL INCOMPLETE (${wordCount} words). You are writing a section of a formal parliamentary thesis. Each analytical claim requires a full explanatory paragraph. Do not stop until you have covered every dimension and cited every source tier.`
        : `\n\nFINAL ATTEMPT. Output is critically undersized at ${wordCount} words. Generate at least ${Math.max(0, division.minWordsForPrimary - wordCount)} more words of analytical content now.`;
    
    output = await callModel(
      client,
      modelId,
      prompt + retryAddendum,
      getDivisionMaxTokensForModel(modelId, DIVISION_MAX_TOKENS[division.id] ?? maxTokens),
      temperature,
      division.id,
    );
  }

  if (division.id === "debate_utility") {
    const d7Check = validateDivision7(output);
    if (!d7Check.isComplete) {
      logger.warn({ d7Check }, "[division] D7 structural validation failed - running targeted repair");
      const repairs: string[] = [];
      if (!d7Check.hasPOIs || d7Check.poiCount < 15) {
        repairs.push(`Generate ${Math.max(0, 20 - d7Check.poiCount)} additional Point of Information questions in format:\n"Layer 7.4 - [Topic]: [Question ending in ?]"`);
      }
      if (!d7Check.hasRebuttals || d7Check.rebuttalCount < 5) {
        repairs.push(`Generate 6 rebuttal entries in exact format:\n"When [opposing delegate] argues [position], respond: [counter-argument with citation]"`);
      }
      if (!d7Check.hasCoalitionMap) {
        repairs.push("Add Layer 7.6 - Alliance & Coalition Map with each stakeholder group's committee position, likely alliance partners, and negotiation red lines.");
      }
      if (!d7Check.hasRedLines) {
        repairs.push("Add Layer 7.8 - Red Lines Register naming positions that cannot be accepted in negotiation.");
      }
      if (repairs.length > 0) {
        const repaired = await callModel(client, modelId, `${output}\n\n---\nCOMPLETION REQUIRED:\n${repairs.join("\n\n")}`, getDivisionMaxTokensForModel(modelId, 3000), 0.4, division.id);
        output = `${output}\n\n${repaired}`;
      }
    }
  }

  if (division.id === "strategic_insights" && !validateDivision11(output, ctx.priorDivisionOutputs)) {
    const repairPrompt = `${output}\n\n---\nFINAL STRATEGIC SYNTHESIS REPAIR:\nThe draft repeats earlier divisions. Add only new leverage points, hidden risks, coalition bargaining moves, and non-obvious strategic insights. Do not summarize Divisions 1-10.`;
    const repaired = await callModel(client, modelId, repairPrompt, getDivisionMaxTokensForModel(modelId, 2400), 0.35, division.id);
    output = `${output}\n\n${repaired}`;
  }

  const hallucinationCheck = validateDivisionOutput(output, ctx.registry);
  if (!hallucinationCheck.passed) {
    logger.warn({ division: division.id, hallucinationCheck }, "[division] hallucination guard repair");
    const repairPrompt = `${prompt}

## HALLUCINATION GUARD REPAIR
The previous draft failed deterministic grounding checks.
Suspicious Articles: ${hallucinationCheck.suspiciousArticles.join("; ") || "none"}
Suspicious Cases: ${hallucinationCheck.suspiciousCases.join("; ") || "none"}
Fabricated/Snippet-only Stats: ${hallucinationCheck.fabricatedStats.join("; ") || "none"}

Rewrite this division using ONLY verified source URLs from the numbered source list. Replace unsupported claims with "SOURCE GAP: [claim] - not verified in retrieved sources."

Previous draft:
${output}`;
    output = await callModel(client, modelId, repairPrompt, generationMaxTokens, 0.15, division.id);
  }
  
  const elapsed = Date.now() - start;
  logger.info({
    division: division.id,
    model: modelId,
    wordCount: output.split(/\s+/).filter(Boolean).length,
    elapsed,
    requestId: opts.requestId,
  }, "[division] generated");
  telemetry.histogram("division.generation_ms", elapsed, { division: division.id });
  opts.streamDivision?.(division.id, output.slice(0, 200));
  opts.onProgress?.(opts.divisionIndex + 1, opts.totalDivisions);

  return output;
}

function buildDivisionPrompt(
  division: Division,
  ctx: DivisionGenerationContext,
  modelProfile: ModelCapabilityProfile,
): string {
  const activeDimensions = getActiveDimensionNames(ctx.engine);
  const instructions = division.generateInstructions(ctx.engine);
  const priorContext = buildPriorDivisionContextTargeted(division, ctx.priorDivisionOutputs, modelProfile);
  const evidenceBlock = buildEvidenceBlockForDivision(division, ctx.registry, modelProfile, activeDimensions);
  const hallucinationGuard = buildHallucinationGuard(division, ctx.registry);

  const gapWarning = ctx.registry.evidenceGaps.length > 0
    ? `\n\nEVIDENCE GAPS — DO NOT FILL WITH UNVERIFIED CLAIMS:\n${ctx.registry.evidenceGaps.map(g => `- ${g}`).join("\n")}\nFor these gaps, write: "Evidence not retrieved for [gap topic] — delegates should verify independently."`
    : "";

  const thesisMandate = buildThesisMandate(division);
  telemetry.gauge("token.evidence_block", estimateTokens(evidenceBlock), { divisionId: division.id });
  telemetry.gauge("token.prior_context", estimateTokens(priorContext), { divisionId: division.id });
  telemetry.gauge("token.instruction", estimateTokens(instructions), { divisionId: division.id });

  const totalEstimate = estimateTokens(thesisMandate + instructions + priorContext + evidenceBlock + hallucinationGuard + gapWarning);
  telemetry.gauge("token.total_prompt", totalEstimate, { divisionId: division.id, modelId: modelProfile.modelId });
  const finalEvidenceBlock = totalEstimate > modelProfile.maxContextTokens * 0.85
    ? buildCompressedEvidenceBlock(ctx.registry, [], activeDimensions)
    : evidenceBlock;
  if (finalEvidenceBlock !== evidenceBlock) {
    logger.warn({ divisionId: division.id, totalEstimate }, "[prompt] Emergency compression triggered");
    telemetry.increment("prompt.emergency_compression");
  }

  return `${PARLIAMENTARY_REGISTER_RULES}

${thesisMandate}

${instructions}

## PRIOR DIVISION CONTEXT (for analytical continuity)
${priorContext || "(No prior division context available.)"}

## EVIDENCE FOR THIS DIVISION (${division.evidenceTiers.join(", ")} tier sources - ranked passages within model budget)
${finalEvidenceBlock}

## ALL SOURCES NUMBERED LIST
${buildNumberedSourceListFromRegistry(ctx.registry)}

CITATION REQUIREMENT:
- Every specific factual claim: [Source N](url)
- Every court case: **Case Name (Year, Court)** - held summary [Source N](url)
- NEVER group citations. NEVER invent URLs.
- Use ONLY source URLs from the numbered list above.

${gapWarning}

${hallucinationGuard}

Generate this Division now. Do not repeat analysis from prior divisions. Add new analytical depth.`;
}

function buildThesisMandate(division: Division): string {
  return `## OUTPUT MANDATE: THESIS-GRADE PARLIAMENTARY BRIEFING
You are writing one section of a formal parliamentary intelligence document.
This is NOT a chat response. This is NOT a summary. This is NOT a listicle.

This document will be used by a trained MUN delegate to argue, rebut, and negotiate in committee.
Every paragraph must add new analytical depth. Every claim must be source-anchored.
Minimum output: ${division.minWordsForPrimary} words of dense, citation-rich analytical prose.
Maximum acceptable bullet usage: structural headers and evidence tier labels only.
Parliamentary voice: Senior Research Officer, Parliament of India.

DO NOT:
- Summarize prior sections
- Use generic MUN phrases
- Write bullet-heavy content where prose is possible
- Truncate mid-analysis
- Use placeholder text like "(see above)"

DO:
- Open every paragraph with its strongest analytical claim
- Anchor every statistic to its source: [Source N](url)
- Name every institution, provision, actor by exact name
- Build arguments that a delegate can directly speak in committee`;
}

function isSmallDivisionModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return /\b(?:3b|7b|8b)\b/.test(id)
    || id.includes("8b-instant")
    || id.includes("nano")
    || id.includes("mini")
    || id.includes("small");
}

function getDivisionMaxTokensForModel(modelId: string, requestedTokens: number): number {
  const profile = resolveModelProfile(modelId);
  requestedTokens = Math.min(requestedTokens, profile.maxOutputTokens);
  if (isSmallDivisionModel(modelId)) return Math.min(requestedTokens, 1800);
  const id = modelId.toLowerCase();
  if (id.includes("20b") || id.includes("30b") || id.includes("mistral")) {
    return Math.min(requestedTokens, 3200);
  }
  return requestedTokens;
}

function adaptDivisionPromptForModel(
  prompt: string,
  modelId: string,
  division: Division,
  modelProfile: ModelCapabilityProfile = resolveModelProfile(modelId),
): string {
  if (!modelProfile.isSmallModel && estimateTokens(prompt) <= modelProfile.maxContextTokens * 0.85) return prompt;
  const promptBudget = Math.floor(modelProfile.maxContextTokens * 0.72);
  const fittedPrompt = truncateToTokenBudget(prompt, promptBudget);
  if (!modelProfile.isSmallModel) return fittedPrompt;
  return `${fittedPrompt}

## SMALL-MODEL EXECUTION CONTRACT
You are a lightweight worker assigned Division ${division.number}. Do not attempt a thesis-length section.
- Produce a compact evidence memo of 500-900 words.
- Use short headed paragraphs and cited bullets.
- Prioritize exact statistics, cases, institutions, and contradictions.
- Do not pad. Do not invent. If evidence is absent, write "Evidence gap" with the missing angle.
- Every factual bullet must cite [Source N](url).`;
}

export function validateDivision7(output: string): {
  hasPOIs: boolean;
  poiCount: number;
  hasRebuttals: boolean;
  rebuttalCount: number;
  hasCoalitionMap: boolean;
  hasRedLines: boolean;
  isComplete: boolean;
} {
  const poiMatches = output.match(/\?\s*$/gm) ?? [];
  const rebuttalPattern = /when\s+.{5,120}\s+argues?\s+.{5,160},?\s+respond/gi;
  const rebuttalMatches = output.match(rebuttalPattern) ?? [];
  const hasCoalitionMap = /coalition|alliance|bloc|party\s+position/i.test(output);
  const hasRedLines = /red\s*line|non.negoti|must\s+not|cannot\s+accept/i.test(output);

  return {
    hasPOIs: poiMatches.length >= 15,
    poiCount: poiMatches.length,
    hasRebuttals: rebuttalMatches.length >= 5,
    rebuttalCount: rebuttalMatches.length,
    hasCoalitionMap,
    hasRedLines,
    isComplete: poiMatches.length >= 15 && rebuttalMatches.length >= 5 && hasCoalitionMap && hasRedLines,
  };
}

export function validateDivision11(output: string, priorOutputs: Map<string, string>): boolean {
  const priorText = [...priorOutputs.values()]
    .join(" ")
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ");
  const d11Sentences = output.split(/[.!?]/).filter((sentence) => sentence.trim().length > 30);
  let repetitionCount = 0;

  for (const sentence of d11Sentences) {
    const normalizedSentence = sentence.toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (normalizedSentence.length > 25 && priorText.includes(normalizedSentence)) {
      repetitionCount += 1;
      continue;
    }
    const words = sentence.toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2);
    if (words.length < 5) continue;
    const phraseMatches = words
      .slice(0, Math.max(5, Math.min(words.length, 10)))
      .some((_, index) => {
        const phrase = words.slice(index, index + 5).join(" ");
        return phrase.split(" ").length === 5 && priorText.includes(phrase);
      });
    if (phraseMatches) repetitionCount += 1;
  }

  const repetitionRatio = d11Sentences.length > 0 ? repetitionCount / d11Sentences.length : 0;
  if (repetitionRatio > 0.4) {
    logger.warn({ repetitionRatio, d11Sentences: d11Sentences.length }, "[division] D11 is summarizing, not synthesizing");
    return false;
  }
  return true;
}

const PRIOR_CONTEXT_PLAN: Record<string, Array<{ divId: string; section: string; maxChars: number }>> = {
  conflict_mapping: [
    { divId: "core_brief", section: "Central Tension", maxChars: 500 },
  ],
  narrative_analysis: [
    { divId: "core_brief", section: "Current Status", maxChars: 400 },
    { divId: "conflict_mapping", section: "Primary Conflicts", maxChars: 600 },
  ],
  debate_utility: [
    { divId: "core_brief", section: "Central Tension", maxChars: 400 },
    { divId: "analytical_dimensions", section: "Fault Lines", maxChars: 800 },
    { divId: "stakeholder_mapping", section: "Stakeholder Alliance", maxChars: 600 },
    { divId: "conflict_mapping", section: "Escalation", maxChars: 700 },
    { divId: "narrative_analysis", section: "Narrative Interaction", maxChars: 500 },
  ],
  policy_pathways: [
    { divId: "analytical_dimensions", section: "Fault Lines", maxChars: 600 },
  ],
  predictive_analysis: [
    { divId: "conflict_mapping", section: "Escalation", maxChars: 800 },
    { divId: "stakeholder_mapping", section: "Stakeholder Alliance", maxChars: 500 },
  ],
  resolution_support: [
    { divId: "policy_pathways", section: "Policy Option", maxChars: 800 },
  ],
};

function buildPriorDivisionContextTargeted(
  division: Division,
  outputs: Map<string, string>,
  modelProfile: ModelCapabilityProfile,
): string {
  const plan = PRIOR_CONTEXT_PLAN[division.id] ?? [];
  if (plan.length === 0) return "";
  const parts = plan
    .filter(({ divId }) => outputs.has(divId))
    .map(({ divId, section, maxChars }) => {
      const source = outputs.get(divId) ?? "";
      const extracted = extractSectionLike(source, section, maxChars);
      return extracted ? `[From Division ${divId} - ${section}]\n${extracted}` : "";
    })
    .filter(Boolean);
  return truncateToTokenBudget(parts.join("\n\n---\n\n"), modelProfile.priorContextTokenBudget);
}

function extractSectionLike(content: string, sectionHint: string, maxChars: number): string {
  const lines = content.split("\n");
  const normalizedHint = sectionHint.toLowerCase();
  const start = lines.findIndex((line) => line.toLowerCase().includes(normalizedHint));
  if (start >= 0) {
    const collected: string[] = [];
    for (let i = start; i < lines.length; i++) {
      if (i > start && /^#{1,4}\s+|\*\*[^*]+\*\*:/.test(lines[i])) break;
      collected.push(lines[i]);
      if (collected.join("\n").length >= maxChars) break;
    }
    return collected.join("\n").slice(0, maxChars);
  }
  return content.slice(0, maxChars);
}

function getActiveDimensionNames(engine: DimensionEngineOutput): DimensionName[] {
  return [...engine.primaryDimensions, ...engine.secondaryDimensions].map((dimension) => dimension.name);
}

function buildPriorDivisionContext(outputs: Map<string, string>, upToDivision: number): string {
  const divIds = [
    "core_brief",
    "analytical_dimensions",
    "stakeholder_mapping",
    "conflict_mapping",
    "narrative_analysis",
    "evidence_verification",
    "debate_utility",
    "policy_pathways",
    "predictive_analysis",
    "resolution_support",
  ];
  return divIds.slice(0, upToDivision - 1)
    .filter(id => outputs.has(id))
    .map(id => `## ${id.toUpperCase()}:\n${outputs.get(id)!.slice(0, 1200)}...`)
    .join("\n\n");
}

function buildNumberedSourceListFromRegistry(registry: EvidenceRegistry): string {
  return registry.sources
    .map((source) => {
      const url = source.url.toLowerCase();
      const badge = url.includes("cag.gov.in") ? "[CAG]"
        : url.includes("ncrb.gov.in") ? "[NCRB]"
          : url.includes("indiankanoon.org") || url.includes("sci.gov.in") ? "[COURT]"
            : url.includes(".gov.in") ? "[GOV.IN]"
              : "[WEB]";
      return `[${source.index}] ${badge} ${source.title} - ${source.url}`;
    })
    .join("\n");
}

/**
 * Extract a named section from division content using regex pattern matching.
 */
function extractSection(content: string, sectionKeyword: string, maxChars: number): string {
  const pattern = new RegExp(
    `(?:^|\\n)(?:#{1,4}\\s*|\\*{1,2})?[^\\n]*${sectionKeyword}[^\\n]*\\n([\\s\\S]*?)(?=\\n(?:#{1,4}\\s*|\\*{1,2})?[A-Z]|$)`,
    "im"
  );
  const match = content.match(pattern);
  return match ? match[1].trim().slice(0, maxChars) : "";
}

/**
 * Extract all sections matching a keyword from division content.
 */
function extractAllSections(content: string, keyword: string, maxCharsEach: number): string[] {
  const results: string[] = [];
  const pattern = new RegExp(
    `(?:^|\\n)(?:#{1,4}\\s*|\\*{1,2})?[^\\n]*${keyword}[^\\n]*\\n([\\s\\S]*?)(?=\\n(?:#{1,4}\\s*|\\*{1,2})?[A-Z]|$)`,
    "gim"
  );
  for (const match of content.matchAll(pattern)) {
    results.push(match[1].trim().slice(0, maxCharsEach));
  }
  return results;
}

/**
 * Build structured D11 context from prior divisions using precision extraction.
 * Replaces the old character-budget truncation with targeted section extraction.
 */
function buildDiv11Context(divisions: Map<string, string>): string {
  const extractions: string[] = [];

  // D1: Core tension paragraph only (500 chars)
  const d1 = divisions.get("core_brief") ?? "";
  const centralTension = extractSection(d1, "Central Tension", 600);
  if (centralTension) extractions.push(`## CORE TENSION:\n${centralTension}`);

  // D2: Primary dimension fault lines only (800 chars per primary dim)
  const d2 = divisions.get("analytical_dimensions") ?? "";
  const faultLines = extractAllSections(d2, "Fault Lines", 400);
  if (faultLines.length) extractions.push(`## KEY FAULT LINES:\n${faultLines.join("\n")}`);

  // D3: Stakeholder Alliance Map only (600 chars)
  const d3 = divisions.get("stakeholder_mapping") ?? "";
  const allianceMap = extractSection(d3, "Stakeholder Alliance", 700);
  if (allianceMap) extractions.push(`## ALLIANCE MAP:\n${allianceMap}`);

  // D4: Conflict Escalation Pathways (800 chars — most strategic)
  const d4 = divisions.get("conflict_mapping") ?? "";
  const escalation = extractSection(d4, "Escalation", 900);
  if (escalation) extractions.push(`## ESCALATION PATHWAYS:\n${escalation}`);

  // D5: Narrative Interaction Analysis (500 chars)
  const d5 = divisions.get("narrative_analysis") ?? "";
  const narrativeInteraction = extractSection(d5, "Narrative Interaction", 600);
  if (narrativeInteraction) extractions.push(`## NARRATIVE DYNAMICS:\n${narrativeInteraction}`);

  // D6: Evidence Gaps + Contested Evidence (full, critical for D11)
  const d6 = divisions.get("evidence_verification") ?? "";
  const evidenceGaps = extractSection(d6, "Evidence Gaps", 800);
  const contestedEvidence = extractSection(d6, "Contested", 600);
  if (evidenceGaps) extractions.push(`## EVIDENCE GAPS:\n${evidenceGaps}`);
  if (contestedEvidence) extractions.push(`## CONTESTED EVIDENCE:\n${contestedEvidence}`);

  // D7: Red Lines + Coalition Map (1000 chars — operationally critical for D11)
  const d7 = divisions.get("debate_utility") ?? "";
  const redLines = extractSection(d7, "Red Lines", 500);
  const coalitionMap = extractSection(d7, "Alliance", 600);
  if (redLines) extractions.push(`## RED LINES:\n${redLines}`);
  if (coalitionMap) extractions.push(`## COALITION MAP:\n${coalitionMap}`);

  // D8: Policy option winner/loser mapping (600 chars)
  const d8 = divisions.get("policy_pathways") ?? "";
  const policyMatrix = extractSection(d8, "Policy Option", 700);
  if (policyMatrix) extractions.push(`## POLICY OPTIONS:\n${policyMatrix}`);

  // D9: Crisis scenarios + electoral implications (700 chars)
  const d9 = divisions.get("predictive_analysis") ?? "";
  const scenarios = extractSection(d9, "Scenario", 800);
  if (scenarios) extractions.push(`## PREDICTIVE SCENARIOS:\n${scenarios}`);

  // D10: Legally Dangerous Clauses (400 chars — trap register fuel)
  const d10 = divisions.get("resolution_support") ?? "";
  const dangerousClauses = extractSection(d10, "Dangerous", 500);
  if (dangerousClauses) extractions.push(`## LEGALLY DANGEROUS CLAUSES:\n${dangerousClauses}`);

  return extractions.join("\n\n");
}

export function buildDivision11SpecializedPrompt(
  engine: DimensionEngineOutput,
  priorDivisions: Map<string, string>,
  registry: EvidenceRegistry,
  discussionText?: string,
): string {
  const structuredContext = buildDiv11Context(priorDivisions);
  const discussionBlock = discussionText?.trim()
    ? `\n\n## CROSS-MODEL RESEARCH SYNTHESIS (integrate this - do not quote verbatim):\n${discussionText.slice(0, 3000)}`
    : "";
  
  const strategicDivision = DIVISION_REGISTRY.find((division) => division.id === "strategic_insights");

  return `${PARLIAMENTARY_REGISTER_RULES}

${strategicDivision ? buildThesisMandate(strategicDivision) : ""}

Generate DIVISION 11 - STRATEGIC INSIGHTS LAYER.

You have already generated Divisions 1-10. Introduce ONLY perspectives, leverage points, risks, coalition angles, or research interpretations NOT already covered.

AGENDA CLASS: ${engine.agendaClass}
PRIMARY DIMENSIONS: ${engine.primaryDimensions.map(d => d.name).join(", ")}

PRIOR DIVISIONS 1-10 (STRUCTURED EXTRACTION):
${structuredContext}

EVIDENCE REGISTRY SUMMARY:
- Total sources: ${registry.sources.length}
- Court judgements: ${registry.courtJudgements.length}
- Evidence gaps (DO NOT FILL THESE WITH UNSOURCED CLAIMS - acknowledge gaps explicitly): ${registry.evidenceGaps.join("; ") || "none recorded"}
${discussionBlock}

Do not summarize prior divisions. Add genuinely additive strategic insight.`;
}

const DIVISION_CALL_TIMEOUT_MS: Record<string, number> = {
  debate_utility: 90_000,
  strategic_insights: 90_000,
  analytical_dimensions: 75_000,
  default: 60_000,
};

async function callModel(
  client: any,
  modelId: string,
  prompt: string,
  maxTokens: number,
  temperature = 0.25,
  divisionId?: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const timeout = DIVISION_CALL_TIMEOUT_MS[divisionId ?? ""] ?? DIVISION_CALL_TIMEOUT_MS.default;

  return new Promise<string>((resolve, reject) => {
    const ac = new AbortController();
    const timer = setTimeout(() => {
      ac.abort();
      reject(new Error(`[callModel] Timeout after ${timeout}ms for division ${divisionId}`));
    }, timeout);
    const request: Record<string, unknown> = {
      model: modelId,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
      signal: ac.signal,
    };
    if (onChunk) request.stream = true;
    client.chat.completions.create(request).then(async (response: any) => {
      if (onChunk) {
        let accumulated = "";
        for await (const chunk of response as AsyncIterable<any>) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            onChunk(delta);
          }
        }
        clearTimeout(timer);
        resolve(accumulated);
        return;
      }
      clearTimeout(timer);
      resolve(response.choices?.[0]?.message?.content ?? "");
    }).catch((err: unknown) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Regenerate divisions that failed critical quality checks.
 * Uses targeted repair prompts with explicit checklists.
 */
export async function regenerateCriticalDivisions(
  divisions: Map<string, string>,
  qualityReport: { divisionReports: Array<{ divisionId: string; issues: string[] }> },
  engine: DimensionEngineOutput,
  registry: EvidenceRegistry,
  modelPool: ModelPoolEntry[],
  requestId?: string,
): Promise<Map<string, string>> {
  const criticalDivisionIds = qualityReport.divisionReports
    .filter(r => r.issues.some(i => 
      i.includes("Critically short") || 
      i.includes("POIs") || 
      i.includes("Rebuttal")
    ))
    .map(r => r.divisionId);

  if (criticalDivisionIds.length === 0) return divisions;

  const updated = new Map(divisions);
  
  for (const divId of criticalDivisionIds) {
    const division = DIVISION_REGISTRY.find(d => d.id === divId);
    if (!division) continue;

    logger.info({ divId, requestId }, "[quality-enforcer] Regenerating critically failed division");

    // Build targeted repair prompt with explicit checklist
    const divReport = qualityReport.divisionReports.find(r => r.divisionId === divId);
    const issues = divReport?.issues ?? [];
    const model = modelPool[0]; // Use best model for repair
    const modelProfile = resolveModelProfile(model.modelId);
    const repairPrompt = buildRepairPrompt(division, engine, registry, updated, issues, modelProfile);
    const repaired = await callModel(
      model.client,
      model.modelId,
      repairPrompt,
      DIVISION_MAX_TOKENS[divId] ?? 4000,
      divId === "debate_utility" ? 0.4 : 0.25,
      divId
    );

    updated.set(divId, repaired);
  }

  return updated;
}

/**
 * Build a repair prompt for a failed division with explicit quality requirements.
 */
function buildRepairPrompt(
  division: Division,
  engine: DimensionEngineOutput,
  registry: EvidenceRegistry,
  currentDivisions: Map<string, string>,
  issues: string[],
  modelProfile: ModelCapabilityProfile,
): string {
  const priorContext = buildPriorDivisionContextTargeted(division, currentDivisions, modelProfile);
  const activeDimensions = getActiveDimensionNames(engine);
  const evidenceBlock = buildEvidenceBlockForDivision(division, registry, modelProfile, activeDimensions);
  const hallucinationGuard = buildHallucinationGuard(division, registry);

  return `${PARLIAMENTARY_REGISTER_RULES}

QUALITY REPAIR MODE for DIVISION ${division.number} - ${division.name}

The following quality issues were detected in the previous generation:
${issues.map(i => `- ${i}`).join("\n")}

${division.generateInstructions(engine)}

EVIDENCE AVAILABLE:
${evidenceBlock}

ALL SOURCES NUMBERED LIST:
${buildNumberedSourceListFromRegistry(registry)}

${priorContext ? `PRIOR DIVISIONS CONTEXT:
${priorContext}` : ""}

${division.id === "strategic_insights" ? "STRATEGIC INSIGHTS repair must use Division 7 debate utility context without summarizing it." : ""}

CRITICAL: Your output MUST resolve ALL listed issues above.
Use ONLY source URLs from the evidence block and numbered source list. Unsupported claims must be written as SOURCE GAP.

${division.id === "debate_utility" ? `
MANDATORY CHECKLIST (your output will be rejected without ALL of these):
☐ Layer 7.4: Exactly 15-20 POIs, each starting with "Would the honourable delegate..." or equivalent
☐ Layer 7.3: Exactly 5+ rebuttal entries in format: "When [Party X] argues [Y], respond with [Z] citing [Evidence]"
☐ Layer 7.6: Alliance & Coalition Map naming specific parties/states
☐ Layer 7.8: Red Lines Register — issues where no compromise is possible
` : ""}

${hallucinationGuard}

Generate the complete repaired division now.`;
}
