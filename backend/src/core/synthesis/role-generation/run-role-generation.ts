import type { EvidenceCard } from "../../evidence/evidence-pack-builder.js";
import {
  syncModelRoleOutputWithValidation,
  validateSourceUsageMap,
  type ModelRoleOutput,
  type SafeProviderError,
  type SourceUsageFailureReport,
  type SourceUsageMapItem,
} from "../../evidence/source-usage-map.js";
import type { ProviderName, ProviderRequest } from "../../providers/provider-types.js";
import { getHealthyProvidersForResearch } from "../../providers/provider-health.js";
import { safeProviderErrorReport } from "../../providers/provider-errors.js";
import { createProviderRunState } from "../../providers/provider-run-state.js";
import { buildClaimGraphRoleContext } from "./claim-graph-role-context.js";
import { filterOutOfBatchUsageItems } from "./cross-batch-guard.js";
import { buildDeterministicRoleUsageItems } from "./deterministic-role-runner.js";
import { buildRolePrompt } from "./role-prompt-builder.js";
import { parseRoleOutputItems } from "./role-output-parser.js";
import { buildRoleRetryPrompt, failedSourceIdsForRetry, researchModeForRetry } from "./role-retry-planner.js";
import { buildSourceGapRoleContext } from "./source-gap-role-context.js";
import { getLimitProfile } from "../../providers/limits/provider-limit-registry.js";
import { estimateTokens } from "../../generation/prompt-budget.js";
import {
  ROLE_GENERATION_SCHEMA_VERSION,
  type ModelRoleRunnerInput,
  type ModelRoleSourceUsageInput,
  type RoleGenerationPayload,
} from "./types.js";

const DEFAULT_FALLBACK_MODELS: Array<{ providerName: ProviderName; model: string }> = [
  { providerName: "groq", model: "llama-3.3-70b-versatile" },
  { providerName: "openrouter", model: "qwen/qwen3-32b" },
  { providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" },
  { providerName: "gemini", model: "gemini-2.5-flash" },
  { providerName: "github", model: "openai/gpt-4.1" },
];

export function runDeterministicModelRole(input: ModelRoleRunnerInput): ModelRoleOutput {
  const minimum = input.minimumSourceRequirement ?? 30;
  const allCards = dedupeEvidenceCards(input.evidenceCards);
  const sourceUsageMap = buildDeterministicRoleUsageItems(allCards, minimum, input.roleName);
  const usedSourceIds = sourceUsageMap.filter((item) => item.usageType !== "relevant_but_weak").map((item) => item.sourceId);
  return {
    roleName: input.roleName,
    minimumSourceRequirement: minimum,
    requiredSourceCount: minimum,
    receivedSourceIds: allCards.map((card) => card.sourceId),
    usedSourceIds,
    unusedSourceIds: allCards.map((card) => card.sourceId).filter((sourceId) => !usedSourceIds.includes(sourceId)),
    sourceUsageMap,
    sourceCountUsed: usedSourceIds.length,
    sourceRequirementSatisfied: usedSourceIds.length >= minimum,
    sourceGapReason: usedSourceIds.length >= minimum ? undefined : `Only ${usedSourceIds.length} evidence cards available.`,
    sourceUsageCount: usedSourceIds.length,
    sourceUsageRequirementSatisfied: usedSourceIds.length >= minimum,
    failureReason: usedSourceIds.length >= minimum ? undefined : `Only ${usedSourceIds.length} evidence cards available.`,
    output: input.output ?? buildRolePayload(input.roleName, sourceUsageMap, "unknown", 0),
  };
}

export async function runModelRoleForSourceUsage(input: ModelRoleSourceUsageInput): Promise<ModelRoleOutput> {
  if (input.mode === "deterministic") return buildDeterministicEvidenceOutput(input, [], 0);
  if (!input.providerRouter || !input.providerName || !input.model) {
    if (input.allowDeterministicExtractionFallback) {
      return buildDeterministicEvidenceOutput(input, [{ message: "model SourceUsageMap requires providerRouter, providerName, and model", code: "PROVIDER_CONFIG_REQUIRED" }], 0);
    }
    return buildFailureOutput(input, [], ["model SourceUsageMap requires providerRouter, providerName, and model"], [], "configure_provider", 0);
  }

  const minimum = input.minimumSourceRequirement ?? 30;
  const assignedCards = dedupeEvidenceCards(input.evidenceCards);
  const providerErrors: SafeProviderError[] = [];
  const bestItems: SourceUsageMapItem[] = [];
  let retries = 0;
  let providerUsed: ProviderName | undefined;
  let modelUsed: string | undefined;

  if (minimum > 0 && assignedCards.length === 0) {
    return buildFailureOutput(input, [], [`No citation-eligible evidence cards were available for ${input.roleName}.`], [], "allow_source_gap_report", retries);
  }
  const candidates = getHealthyGenerationProviders(input);
  if (candidates.length === 0) {
    return buildFailureOutput(input, [], ["No healthy generation provider configured for source usage role"], [], "configure_provider", retries);
  }

  const brokenProviders = new Set<ProviderName>();
  const runState = input.providerRunState ?? createProviderRunState();
  const retriesPerProvider = new Map<string, number>();
  for (const candidate of candidates) {
    if (brokenProviders.has(candidate.providerName)) continue;
    if (runState.shouldSkipProvider(candidate.providerName, "source_usage", input.researchMode ?? "deep_research")) continue;
    for (const batchSize of uniqueBatchSizes(input.batchSize ?? 8)) {
      const attemptItems: SourceUsageMapItem[] = [];
      const batches = chunk(assignedCards.slice(0, Math.max(minimum, batchSize)), batchSize);
      let providerFailed = false;
      for (const batch of batches) {
        input.emitSourceUsageEvent?.("source_usage_batch_started", {
          roleName: input.roleName,
          providerName: candidate.providerName,
          model: candidate.model,
          batchSize: batch.length,
          requestedBatchSize: batchSize,
        });
        const first = await runSourceUsageBatch(input, batch, candidate.providerName, candidate.model, false).catch((error) => ({ error }));
        let batchItems = "error" in first ? [] : first;
        if ("error" in first) {
          providerErrors.push(toSafeProviderError(candidate.providerName, first.error));
          runState.recordFailure(candidate.providerName, safeProviderErrorReport(candidate.providerName, first.error, { stage: "source_usage" }), { model: candidate.model });
          brokenProviders.add(candidate.providerName);
          providerFailed = true;
          break;
        }
        let validation = validateBatchItems(batchItems, batch, input);
        if (!validation.passed) {
          const providerKey = `${candidate.providerName}/${candidate.model}`;
          const currentRetries = retriesPerProvider.get(providerKey) ?? 0;
          if (currentRetries < 1) {
            retries += 1;
            retriesPerProvider.set(providerKey, currentRetries + 1);
            input.emitSourceUsageEvent?.("source_usage_batch_retry", {
              roleName: input.roleName,
              providerName: candidate.providerName,
              model: candidate.model,
              failedSourceIds: failedSourceIdsForRetry(validation, batch),
              failures: validation.failures,
            });
            const retry = await runSourceUsageBatch(input, batch, candidate.providerName, candidate.model, true, validation).catch((error) => ({ error }));
            batchItems = "error" in retry ? [] : retry;
            if ("error" in retry) {
              providerErrors.push(toSafeProviderError(candidate.providerName, retry.error));
              runState.recordFailure(candidate.providerName, safeProviderErrorReport(candidate.providerName, retry.error, { stage: "source_usage" }), { model: candidate.model });
              brokenProviders.add(candidate.providerName);
              providerFailed = true;
              break;
            }
            validation = validateBatchItems(batchItems, batch, input);
          } else {
            brokenProviders.add(candidate.providerName);
            providerFailed = true;
            break;
          }
        }
        if (!validation.passed) {
          brokenProviders.add(candidate.providerName);
          providerFailed = true;
          break;
        }
        attemptItems.push(...validation.approvedUsageItems);
        if (new Set(attemptItems.map((item) => item.sourceId)).size >= minimum) break;
      }
      const output = buildOutput(input, attemptItems, candidate.providerName, candidate.model, retries);
      const finalValidation = validateSourceUsageMap(output, input.evidenceRegistry, input.agendaContract, Math.min(minimum, input.evidenceRegistry.getCitationEligibleCount()));
      if (attemptItems.length > bestItems.length) bestItems.splice(0, bestItems.length, ...attemptItems);
      providerUsed = candidate.providerName;
      modelUsed = candidate.model;
      if (!providerFailed && finalValidation.passed) {
        return { ...output, sourceRequirementSatisfied: true, sourceUsageRequirementSatisfied: true, failureReason: undefined, sourceGapReason: undefined };
      }
      if (brokenProviders.has(candidate.providerName)) break;
    }
  }

  if (input.allowDeterministicExtractionFallback) {
    const deterministic = buildDeterministicRoleUsageItems(dedupeEvidenceCards(input.evidenceCards), input.minimumSourceRequirement ?? 30, input.roleName);
    const output = buildOutput(input, deterministic, providerUsed, modelUsed, retries, true, providerErrors);
    const validation = validateSourceUsageMap(output, input.evidenceRegistry, input.agendaContract, Math.min(minimum, input.evidenceRegistry.getCitationEligibleCount()));
    if (validation.passed) {
      const assignedIds = dedupeEvidenceCards(input.evidenceCards).map((card) => card.sourceId);
      return {
        ...output,
        sourceUsageFailureReport: {
          roleName: input.roleName,
          reason: "Model SourceUsageMap output was invalid; deterministic extraction recovered using actual EvidenceCard text.",
          assignedSourceCount: assignedIds.length,
          validUsageCount: validation.uniqueUsedSourceCount,
          invalidUsageCount: bestItems.length,
          failedSourceIds: assignedIds.filter((sourceId) => !validation.usedSourceIds.includes(sourceId)),
          providerErrors,
          recommendedAction: "allow_source_gap_report",
        },
      };
    }
    bestItems.splice(0, bestItems.length, ...deterministic);
  }

  return buildFailureOutput(input, bestItems, ["Source usage validation failed after role-specific retry, smaller batches, and healthy provider fallback"], providerErrors, "fail_pipeline", retries, providerUsed, modelUsed);
}

export function getHealthyGenerationProviders(input: ModelRoleSourceUsageInput): Array<{ providerName: ProviderName; model: string }> {
  const router = input.providerRouter as ({ hasProvider?: (name: ProviderName) => boolean }) | undefined;
  if (!router) return [];
  const candidates = [
    ...(input.providerName && input.model ? [{ providerName: input.providerName, model: input.model }] : []),
    ...(input.autoFallback === true ? (input.fallbackModels ?? DEFAULT_FALLBACK_MODELS) : []),
  ];
  const seen = new Set<string>();
  const routerAvailable = candidates.filter((candidate) => {
    const key = `${candidate.providerName}/${candidate.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (input.providerRunState?.shouldSkipModel(candidate.providerName, candidate.model)) return false;
    return typeof router.hasProvider === "function" ? router.hasProvider(candidate.providerName) : candidate.providerName === input.providerName;
  });
  const summary = getHealthyProvidersForResearch({
    selectedProvider: input.providerName,
    selectedModel: input.model,
    fallbackModels: routerAvailable.filter((candidate) => candidate.providerName !== input.providerName || candidate.model !== input.model),
    providerStatuses: input.providerStatuses,
    autoFallback: input.autoFallback === true,
  });
  if (input.providerStatuses?.length) {
    const allowed = new Set(summary.healthyProviders.map((candidate) => `${candidate.providerName}/${candidate.model}`));
    return routerAvailable.filter((candidate) => allowed.has(`${candidate.providerName}/${candidate.model}`));
  }
  return routerAvailable;
}

function buildDeterministicEvidenceOutput(input: ModelRoleSourceUsageInput, providerErrors: SafeProviderError[], retries: number, providerUsed?: string, modelUsed?: string): ModelRoleOutput {
  const deterministic = buildDeterministicRoleUsageItems(dedupeEvidenceCards(input.evidenceCards), input.minimumSourceRequirement ?? 30, input.roleName);
  const output = buildOutput(input, deterministic, providerUsed, modelUsed, retries, providerErrors.length > 0, providerErrors);
  const validation = validateSourceUsageMap(output, input.evidenceRegistry, input.agendaContract, Math.min(output.requiredSourceCount, input.evidenceRegistry.getCitationEligibleCount()));
  if (validation.passed) return output;
  return buildFailureOutput(input, deterministic, validation.failures, providerErrors, providerErrors.length ? "configure_provider" : "allow_source_gap_report", retries, providerUsed, modelUsed);
}

async function runSourceUsageBatch(input: ModelRoleSourceUsageInput, batch: EvidenceCard[], providerName: ProviderName, model: string, stricter: boolean, previousValidation?: ReturnType<typeof validateBatchItems>): Promise<SourceUsageMapItem[]> {
  const assignedSourceIds = batch.map((card) => card.sourceId);
  const researchMode = researchModeForRetry(input.researchMode);
  const retryInstruction = stricter && previousValidation
    ? buildRoleRetryPrompt({
        roleName: input.roleName,
        researchMode,
        failedSourceIds: failedSourceIdsForRetry(previousValidation, batch),
        failures: [...previousValidation.failures, ...previousValidation.warnings],
        previousPromptFingerprint: `${input.roleName}:${assignedSourceIds.join(",")}`,
      })
    : undefined;

  // Budget gate: trim batch to fit provider's safe token budget
  const limitProfile = getLimitProfile(providerName, model);
  const safeTokenBudget = limitProfile.safeInputBudget;
  const BASE_OVERHEAD_TOKENS = 800; // system prompt + claimGraph + sourceGap overhead
  const PER_CARD_RESERVE = Math.max(1, Math.floor((safeTokenBudget - BASE_OVERHEAD_TOKENS) / Math.max(1, batch.length)));

  // Build full prompt once to check size
  const fullPrompt = buildRolePrompt({
    roleName: input.roleName,
    researchMode,
    cards: batch,
    stricter,
    retryInstruction,
    claimGraphContext: buildClaimGraphRoleContext(input.claimGraph, { roleName: input.roleName, assignedSourceIds }),
    sourceGapContext: buildSourceGapRoleContext(input.roleName, input.sourceGapReport),
  });
  const fullPromptTokens = estimateTokens(fullPrompt.system + "\n\n" + fullPrompt.user);

  let effectiveBatch = batch;
  if (fullPromptTokens > safeTokenBudget) {
    // Trim cards until estimated tokens fit — preserve citation-strongest cards first
    const charsPerToken = (fullPrompt.system.length + fullPrompt.user.length) / Math.max(1, fullPromptTokens);
    const targetChars = Math.floor(safeTokenBudget * charsPerToken * 0.92); // 8% margin
    const systemChars = fullPrompt.system.length;
    const availableUserChars = Math.max(0, targetChars - systemChars - 200); // 200 for overhead
    // Estimate chars per card from the full prompt user section
    const userCharsPerCard = fullPrompt.user.length / Math.max(1, batch.length);
    const maxCards = Math.max(1, Math.floor(availableUserChars / Math.max(1, userCharsPerCard)));
    effectiveBatch = batch.slice(0, maxCards);
  }

  const prompt = effectiveBatch === batch
    ? fullPrompt
    : buildRolePrompt({
        roleName: input.roleName,
        researchMode,
        cards: effectiveBatch,
        stricter,
        retryInstruction,
        claimGraphContext: buildClaimGraphRoleContext(input.claimGraph, { roleName: input.roleName, assignedSourceIds }),
        sourceGapContext: buildSourceGapRoleContext(input.roleName, input.sourceGapReport),
      });

  const request: ProviderRequest = {
    model,
    roleName: input.roleName,
    retries: 0,
    timeoutMs: input.sourceUsageTimeoutMs ?? 8_000,
    temperature: stricter ? 0 : 0.1,
    metadata: { runId: input.requestId, roleName: input.roleName },
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  };
  const response = typeof (input.providerRouter as any).completeJson === "function"
    ? await (input.providerRouter as any).completeJson(providerName, request)
    : await input.providerRouter!.complete(providerName, request);
  const items = parseRoleOutputItems("json" in response ? response.json : response.content, effectiveBatch);
  const guarded = filterOutOfBatchUsageItems(input.roleName, items, assignedSourceIds);
  if (guarded.warning) {
    input.emitSourceUsageEvent?.("source_usage_cross_batch_rejected", {
      roleName: input.roleName,
      rejectedSourceIds: guarded.rejectedSourceIds,
      warning: guarded.warning,
    });
  }
  return guarded.accepted;
}

function buildOutput(input: ModelRoleSourceUsageInput, usageItems: SourceUsageMapItem[], providerUsed?: string, modelUsed?: string, retries = 0, recoveredDeterministically = false, providerErrors: SafeProviderError[] = []): ModelRoleOutput {
  const minimum = input.minimumSourceRequirement ?? 30;
  const receivedSourceIds = dedupeEvidenceCards(input.evidenceCards).map((card) => card.sourceId);
  const rawUsedSourceIds = [...new Set(usageItems.map((item) => item.sourceId))];
  const effectiveRequired = Math.min(minimum, input.evidenceRegistry.getCitationEligibleCount());
  const draft: ModelRoleOutput = {
    roleName: input.roleName,
    minimumSourceRequirement: minimum,
    requiredSourceCount: minimum,
    receivedSourceIds,
    usedSourceIds: rawUsedSourceIds,
    unusedSourceIds: receivedSourceIds.filter((sourceId) => !rawUsedSourceIds.includes(sourceId)),
    sourceUsageMap: usageItems,
    sourceCountUsed: rawUsedSourceIds.length,
    sourceRequirementSatisfied: false,
    sourceUsageCount: rawUsedSourceIds.length,
    sourceUsageRequirementSatisfied: false,
    providerUsed,
    modelUsed,
    retries,
    output: buildRolePayload(input.roleName, usageItems, input.researchMode ?? "unknown", retries, providerUsed, modelUsed, recoveredDeterministically, providerErrors),
  };
  const validation = validateSourceUsageMap(draft, input.evidenceRegistry, input.agendaContract, effectiveRequired);
  const synced = syncModelRoleOutputWithValidation({ ...draft, output: { ...(draft.output as RoleGenerationPayload), validation } }, validation);
  const usedSourceIds = synced.usedSourceIds;
  const satisfied = validation.passed && usedSourceIds.length >= effectiveRequired;
  return {
    ...synced,
    unusedSourceIds: receivedSourceIds.filter((sourceId) => !usedSourceIds.includes(sourceId)),
    sourceCountUsed: usedSourceIds.length,
    sourceRequirementSatisfied: satisfied,
    sourceGapReason: satisfied ? undefined : `Only ${usedSourceIds.length} sources used by ${input.roleName}.`,
    sourceUsageCount: usedSourceIds.length,
    sourceUsageRequirementSatisfied: satisfied,
    failureReason: satisfied ? undefined : `Only ${usedSourceIds.length} sources used by ${input.roleName}.`,
  };
}

function buildFailureOutput(input: ModelRoleSourceUsageInput, usageItems: SourceUsageMapItem[], failures: string[], providerErrors: SafeProviderError[], recommendedAction: SourceUsageFailureReport["recommendedAction"], retries: number, providerUsed?: string, modelUsed?: string): ModelRoleOutput {
  const output = buildOutput(input, usageItems, providerUsed, modelUsed, retries, false, providerErrors);
  const validation = ((output.output as any)?.validation ?? validateSourceUsageMap(output, input.evidenceRegistry, input.agendaContract, Math.min(output.requiredSourceCount, input.evidenceRegistry.getCitationEligibleCount())));
  const validIds = new Set(validation.usedSourceIds);
  const assignedIds = dedupeEvidenceCards(input.evidenceCards).map((card) => card.sourceId);
  const sourceUsageFailureReport: SourceUsageFailureReport = {
    roleName: input.roleName,
    reason: [...failures, ...validation.failures].join("; ") || "Source usage contract could not be satisfied.",
    assignedSourceCount: assignedIds.length,
    validUsageCount: validation.uniqueUsedSourceCount,
    invalidUsageCount: Math.max(0, usageItems.length - validation.uniqueUsedSourceCount),
    failedSourceIds: assignedIds.filter((sourceId) => !validIds.has(sourceId)),
    providerErrors,
    recommendedAction,
    structuredFailures: validation.structuredFailures,
  };
  return {
    ...output,
    sourceRequirementSatisfied: false,
    sourceUsageRequirementSatisfied: false,
    failureReason: sourceUsageFailureReport.reason,
    sourceGapReason: sourceUsageFailureReport.reason,
    sourceUsageFailureReport,
    output: { ...(output.output as RoleGenerationPayload), validation, sourceUsageFailureReport },
  };
}

function validateBatchItems(items: SourceUsageMapItem[], batch: EvidenceCard[], input: ModelRoleSourceUsageInput) {
  const batchIds = new Set(batch.map((card) => card.sourceId));
  const guarded = filterOutOfBatchUsageItems(input.roleName, items, batchIds);
  const requiredCoverage = Math.min(batch.length, input.minimumSourceRequirement ?? batch.length);
  const output = buildOutput(input, guarded.accepted);
  return validateSourceUsageMap(output, input.evidenceRegistry, requiredCoverage, undefined, { allowedSourceIds: batchIds });
}

function buildRolePayload(roleName: string, items: SourceUsageMapItem[], researchMode: RoleGenerationPayload["researchMode"], retries: number, providerUsed?: string, modelUsed?: string, recoveredDeterministically = false, providerErrors: SafeProviderError[] = []): RoleGenerationPayload {
  return {
    schemaVersion: ROLE_GENERATION_SCHEMA_VERSION,
    roleName,
    researchMode,
    roleSummary: `${roleName} generated ${items.length} role-specific source usage item(s).`,
    roleFindings: items.map((item) => ({
      sourceId: item.sourceId,
      usageType: item.usageType,
      finding: item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.limitation ?? item.supportedSection ?? "Contextual source finding.",
      confidence: item.confidence,
      supportedSection: item.supportedSection,
    })),
    sourceQualityFindings: {
      strong: items.filter((item) => item.citationStrength === "strong").length,
      medium: items.filter((item) => item.citationStrength === "medium").length,
      weak: items.filter((item) => item.citationStrength === "weak").length,
      limited: items.filter((item) => item.limitedSource).length,
      snippet: items.filter((item) => item.groundingStatus === "weak_context").length,
      failed: 0,
    },
    divisionHints: divisionHintsForRole(roleName),
    retryMetadata: { retries, providerUsed, modelUsed, recoveredDeterministically, providerErrors },
  };
}

function divisionHintsForRole(roleName: string): string[] {
  if (/parliamentary|strategist/i.test(roleName)) return ["D7_debate_utility", "resolution_support"];
  if (/legal/i.test(roleName)) return ["legal_analysis", "D7_debate_utility"];
  if (/data|stat/i.test(roleName)) return ["data_statistics", "D7_debate_utility"];
  if (/thesis/i.test(roleName)) return ["D11_strategic_insights", "core_brief"];
  if (/retrieval/i.test(roleName)) return ["source_gap_report", "D11_strategic_insights"];
  if (/citation/i.test(roleName)) return ["evidence_verification", "D11_strategic_insights"];
  return ["evidence_verification"];
}

function uniqueBatchSizes(initial: number): number[] {
  return [...new Set([Math.min(Math.max(initial, 5), 10), 5, 3])];
}

function toSafeProviderError(provider: ProviderName, error: unknown): SafeProviderError {
  const report = safeProviderErrorReport(provider, error, { stage: "source_usage" });
  return { provider, message: report.safeMessage, code: report.code };
}

function dedupeEvidenceCards(cards: EvidenceCard[]): EvidenceCard[] {
  const seen = new Set<number>();
  return cards.filter((card) => {
    if (seen.has(card.sourceId)) return false;
    seen.add(card.sourceId);
    return true;
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
