import type { ResearchMode } from "../config/research-mode.js";
import type { ProviderHealthCandidate, ProviderResearchStatus } from "./provider-health.js";
import { parseProviderModelId } from "./provider-model-id.js";
import type { ProviderName } from "./provider-types.js";

const STRONG_MODELS: ProviderHealthCandidate[] = [
  { providerName: "groq", model: "llama-3.3-70b-versatile" },
  { providerName: "openrouter", model: "qwen/qwen3-32b" },
  { providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" },
  { providerName: "gemini", model: "gemini-2.5-pro" },
  { providerName: "openai", model: "gpt-4.1" },
  { providerName: "cerebras", model: "llama3.3-70b" },
  { providerName: "github", model: "openai/gpt-4.1" },
];

const FAST_MODELS: ProviderHealthCandidate[] = [
  { providerName: "groq", model: "llama-3.3-70b-versatile" },
  { providerName: "openrouter", model: "qwen/qwen3-32b" },
  { providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" },
  { providerName: "gemini", model: "gemini-2.5-flash" },
  { providerName: "cerebras", model: "llama3.1-8b" },
  { providerName: "github", model: "openai/gpt-4.1-mini" },
  { providerName: "openai", model: "gpt-4.1-mini" },
];

const UNSTABLE_GENERATION_MODELS = /^(nvidia\/moonshotai\/kimi-k2\.6|nvidia\/nvidia\/nemotron-3-ultra-550b-a55b|openrouter\/nvidia\/nemotron-3-ultra-550b-a55b(?::free)?)$/i;

export interface ProviderRunTelemetry {
  failures: Partial<Record<ProviderName, number>>;
  jsonFailures: Partial<Record<ProviderName, number>>;
  latencyMs: Partial<Record<ProviderName, number[]>>;
  retries: Partial<Record<ProviderName, number>>;
}

export type ResearchRole =
  | "retrieval_critic"
  | "evidence_extractor"
  | "thesis_synthesizer"
  | "citation_auditor"
  | "indian_parliamentary_strategist"
  | "final_quality_auditor"
  | "legal_analyst"
  | "data_analyst"
  | "final_prose_renderer"
  | "division_generator";

export interface ResearchModelAssignment {
  role: ResearchRole;
  providerName: ProviderName;
  model: string;
  selectionSource: "user_explicit" | "mode_default" | "validated_fallback";
  fallbackPolicy: "locked" | "same_provider_only" | "healthy_dynamic";
  maxRetries: number;
  generationEligible: boolean;
  originalModelId?: string;
  fallbackFrom?: { providerName: ProviderName; model: string; reason: string };
  blockedReason?: string;
}

export interface ResearchModelPlan {
  runId: string;
  mode: ResearchMode;
  assignments: ResearchModelAssignment[];
  userSelectedModels: string[];
  validatedAt: string;
  generationEligibleAssignments: ResearchModelAssignment[];
  warnings: string[];
}

export interface BuildResearchModelPlanInput {
  runId: string;
  mode: ResearchMode;
  userSelectedModels?: string[];
  selected?: ProviderHealthCandidate;
  providerStatuses?: ProviderResearchStatus[];
  autoFallback?: boolean;
  fallbackModels?: ProviderHealthCandidate[];
  validatedAt?: string;
}

export const RESEARCH_MODEL_ROLES: ResearchRole[] = [
  "retrieval_critic",
  "evidence_extractor",
  "thesis_synthesizer",
  "citation_auditor",
  "indian_parliamentary_strategist",
  "final_quality_auditor",
  "legal_analyst",
  "data_analyst",
  "final_prose_renderer",
  "division_generator",
];

export const SOURCE_USAGE_RESEARCH_ROLES: ResearchRole[] = [
  "retrieval_critic",
  "evidence_extractor",
  "thesis_synthesizer",
  "citation_auditor",
  "indian_parliamentary_strategist",
  "final_quality_auditor",
  "legal_analyst",
  "data_analyst",
];

export function fallbackModelsForMode(mode: ResearchMode): ProviderHealthCandidate[] {
  return mode === "fast_research" ? FAST_MODELS : STRONG_MODELS;
}

export function buildResearchModelPlan(input: BuildResearchModelPlanInput): ResearchModelPlan {
  const warnings: string[] = [];
  const explicitCandidates = (input.userSelectedModels ?? [])
    .map((modelId) => parseExplicitModel(modelId, warnings))
    .filter((candidate): candidate is ProviderHealthCandidate & { originalModelId: string } => Boolean(candidate));
  const selectedCandidate = input.selected
    ? { ...input.selected, originalModelId: `${input.selected.providerName}/${input.selected.model}` }
    : undefined;
  const explicitPool = explicitCandidates.length > 0
    ? explicitCandidates
    : selectedCandidate
      ? [selectedCandidate]
      : [];
  const modeFallbacks = uniqueProviderCandidates(input.fallbackModels ?? fallbackModelsForMode(input.mode));
  const assignments = RESEARCH_MODEL_ROLES.map((role, index) => {
    const explicit = explicitPool.length
      ? explicitPool[Math.min(index, explicitPool.length - 1)]
      : undefined;
    if (explicit) {
      return buildAssignmentForCandidate({
        role,
        candidate: explicit,
        selectionSource: "user_explicit",
        fallbackPolicy: "locked",
        maxRetries: 0,
        providerStatuses: input.providerStatuses,
        autoFallback: input.autoFallback === true,
        modeFallbacks,
        warnings,
      });
    }

    const candidate = modeFallbacks[index % Math.max(modeFallbacks.length, 1)];
    if (!candidate) {
      throw new Error(`No mode default provider models available for ${input.mode}`);
    }
    return buildAssignmentForCandidate({
      role,
      candidate,
      selectionSource: "mode_default",
      fallbackPolicy: input.autoFallback === true ? "healthy_dynamic" : "same_provider_only",
      maxRetries: input.autoFallback === true ? 1 : 0,
      providerStatuses: input.providerStatuses,
      autoFallback: input.autoFallback === true,
      modeFallbacks,
      warnings,
    });
  });

  return {
    runId: input.runId,
    mode: input.mode,
    assignments,
    userSelectedModels: [...(input.userSelectedModels ?? [])],
    validatedAt: input.validatedAt ?? new Date().toISOString(),
    generationEligibleAssignments: assignments.filter((assignment) => assignment.generationEligible),
    warnings: [...new Set(warnings)],
  };
}

export function getResearchModelAssignment(plan: ResearchModelPlan | undefined, role: ResearchRole): ResearchModelAssignment | undefined {
  return plan?.assignments.find((assignment) => assignment.role === role);
}

function buildAssignmentForCandidate(args: {
  role: ResearchRole;
  candidate: ProviderHealthCandidate & { originalModelId?: string };
  selectionSource: ResearchModelAssignment["selectionSource"];
  fallbackPolicy: ResearchModelAssignment["fallbackPolicy"];
  maxRetries: number;
  providerStatuses?: ProviderResearchStatus[];
  autoFallback: boolean;
  modeFallbacks: ProviderHealthCandidate[];
  warnings: string[];
}): ResearchModelAssignment {
  const blockedReason = generationBlockedReason(args.candidate, args.providerStatuses);
  if (!blockedReason) {
    return {
      role: args.role,
      providerName: args.candidate.providerName,
      model: args.candidate.model,
      selectionSource: args.selectionSource,
      fallbackPolicy: args.fallbackPolicy,
      maxRetries: args.maxRetries,
      generationEligible: true,
      originalModelId: args.candidate.originalModelId,
    };
  }

  if (args.autoFallback) {
    const fallback = args.modeFallbacks.find((candidate) => !generationBlockedReason(candidate, args.providerStatuses));
    if (fallback) {
      args.warnings.push(`${args.role}: ${args.candidate.providerName}/${args.candidate.model} blocked (${blockedReason}); using ${fallback.providerName}/${fallback.model}`);
      return {
        role: args.role,
        providerName: fallback.providerName,
        model: fallback.model,
        selectionSource: "validated_fallback",
        fallbackPolicy: "healthy_dynamic",
        maxRetries: 1,
        generationEligible: true,
        fallbackFrom: {
          providerName: args.candidate.providerName,
          model: args.candidate.model,
          reason: blockedReason,
        },
        originalModelId: args.candidate.originalModelId,
      };
    }
  }

  args.warnings.push(`${args.role}: ${args.candidate.providerName}/${args.candidate.model} blocked (${blockedReason})`);
  return {
    role: args.role,
    providerName: args.candidate.providerName,
    model: args.candidate.model,
    selectionSource: args.selectionSource,
    fallbackPolicy: args.fallbackPolicy,
    maxRetries: 0,
    generationEligible: false,
    originalModelId: args.candidate.originalModelId,
    blockedReason,
  };
}

function parseExplicitModel(modelId: string, warnings: string[]): (ProviderHealthCandidate & { originalModelId: string }) | null {
  try {
    const parsed = parseProviderModelId(modelId);
    const providerName = toProviderName(parsed.prefix);
    if (!providerName) {
      warnings.push(`Unsupported generation provider prefix: ${parsed.prefix}`);
      return null;
    }
    return { providerName, model: parsed.modelId, originalModelId: modelId };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function toProviderName(prefix: string): ProviderName | null {
  return prefix === "groq" || prefix === "openrouter" || prefix === "gemini" || prefix === "nvidia" || prefix === "github" || prefix === "cerebras" || prefix === "openai"
    ? prefix as ProviderName
    : null;
}

function generationBlockedReason(candidate: ProviderHealthCandidate, providerStatuses?: ProviderResearchStatus[]): string | null {
  if (UNSTABLE_GENERATION_MODELS.test(`${candidate.providerName}/${candidate.model}`)) return "unstable_model";
  const statusesWereSupplied = providerStatuses !== undefined;
  const status = providerStatuses?.find((item) => item.providerName === candidate.providerName);
  if (!status) return statusesWereSupplied ? "status_unknown" : null;
  if (!status.configured) return "not_configured";
  if (status.catalogFallbackOnly || status.status === "catalog_fallback") return "catalog_fallback_only";
  if (status.status === "missing_key") return "missing_key";
  if (status.status === "invalid_key") return "invalid_key";
  if (status.status === "billing_credits") return "billing_credits";
  if (status.status === "invalid_model" || status.invalidModel) return "invalid_model";
  if (status.status === "rate_limited" || status.rateLimited) return "rate_limited";
  if (status.status === "network_error") return "network_error";
  if (status.status === "unavailable") return "unavailable";
  if (status.models && status.models.length > 0 && !status.models.includes(candidate.model)) return "model_not_available";
  if (status.chatVerified !== true) return "chat_not_verified";
  if (status.healthy === false) return "marked_unhealthy";
  if (status.supportsJsonTasks === false) return "json_tasks_unsupported";
  return null;
}

function uniqueProviderCandidates(candidates: ProviderHealthCandidate[]): ProviderHealthCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.providerName}/${candidate.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectHealthyModelForMode(args: {
  mode: ResearchMode;
  selected?: ProviderHealthCandidate;
  autoFallback?: boolean;
  providerStatuses?: ProviderResearchStatus[];
  telemetry?: ProviderRunTelemetry;
}): ProviderHealthCandidate | null {
  const candidates = [
    ...(args.selected ? [args.selected] : []),
    ...(args.autoFallback === true ? fallbackModelsForMode(args.mode) : []),
  ];
  const statuses = new Map((args.providerStatuses ?? []).map((status) => [status.providerName, status]));
  const statusesSupplied = args.providerStatuses !== undefined;
  for (const candidate of candidates) {
    const status = statuses.get(candidate.providerName);
    const isSelected = args.selected?.providerName === candidate.providerName && args.selected?.model === candidate.model;
    if (!status && statusesSupplied) continue;
    if (status) {
      if (!status.configured) continue;
      if (["missing_key", "invalid_key", "invalid_model", "rate_limited", "network_error", "timeout", "unavailable"].includes(status.status ?? "")) continue;
      if (!isSelected && status.chatVerified !== true) continue;
    }
    if ((args.telemetry?.jsonFailures[candidate.providerName] ?? 0) >= 2) continue;
    if ((args.telemetry?.failures[candidate.providerName] ?? 0) >= 3) continue;
    return candidate;
  }
  return null;
}
