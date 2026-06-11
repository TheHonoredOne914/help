import type { ResearchMode } from "../config/research-mode.js";

export interface ResearchLatencyBudget {
  mode: ResearchMode;
  totalBudgetMs: number;
  retrievalBudgetMs: number;
  enrichmentBudgetMs: number;
  sourceUsageBudgetMs: number;
  generationBudgetMs: number;
  repairBudgetMs: number;
  providerCallTimeoutMs: number;
  extractionTimeoutMs: number;
  maxProviderRetries: number;
  maxConcurrentSearches: number;
  maxConcurrentEnrichments: number;
  earlyStopEnabled: boolean;
}

export interface LatencyStageRecord {
  name: string;
  startedAt: number;
  completedAt?: number;
  elapsedMs?: number;
  budgetMs?: number;
}

export interface LatencyBudgetManager extends ResearchLatencyBudget {
  startedAt: number;
  startStage(name: keyof StageBudgets | string): LatencyStageRecord;
  endStage(name: keyof StageBudgets | string): LatencyStageRecord | null;
  remainingBudget(): number;
  shouldEarlyStop(): boolean;
  getStageBudget(name: keyof StageBudgets | string): number;
  getCompressionLevel(stage: keyof StageBudgets | string): number;
  shouldSkipOptionalStage(stage: keyof StageBudgets | string): boolean;
  remainingStageBudget(stage: keyof StageBudgets | string): number;
  events: Array<{ type: "latency_stage_started" | "latency_stage_completed" | "latency_budget_warning" | "latency_early_stop"; data: Record<string, unknown> }>;
}

type StageBudgets = {
  retrieval: number;
  enrichment: number;
  source_usage: number;
  generation: number;
  repair: number;
};

const BUDGETS: Record<ResearchMode, ResearchLatencyBudget> = {
  fast_research: {
    mode: "fast_research",
    totalBudgetMs: 90_000,
    retrievalBudgetMs: 60_000,
    enrichmentBudgetMs: 48_000,
    sourceUsageBudgetMs: 10_000,
    generationBudgetMs: 15_000,
    repairBudgetMs: 3_000,
    providerCallTimeoutMs: 12_000,
    extractionTimeoutMs: 6_000,
    maxProviderRetries: 1,
    maxConcurrentSearches: 3,
    maxConcurrentEnrichments: 8,
    earlyStopEnabled: true,
  },
  deep_research: {
    mode: "deep_research",
    totalBudgetMs: 240_000,
    retrievalBudgetMs: 100_000,
    enrichmentBudgetMs: 100_000,
    sourceUsageBudgetMs: 35_000,
    generationBudgetMs: 45_000,
    repairBudgetMs: 10_000,
    providerCallTimeoutMs: 25_000,
    extractionTimeoutMs: 8_000,
    maxProviderRetries: 1,
    maxConcurrentSearches: 4,
    maxConcurrentEnrichments: 10,
    earlyStopEnabled: true,
  },
  council: {
    mode: "council",
    totalBudgetMs: 30 * 60 * 1000,
    retrievalBudgetMs: 240_000,
    enrichmentBudgetMs: 480_000,
    sourceUsageBudgetMs: 0,
    generationBudgetMs: 360_000,
    repairBudgetMs: 0,
    providerCallTimeoutMs: 180_000,
    extractionTimeoutMs: 10_000,
    maxProviderRetries: 1,
    maxConcurrentSearches: 6,
    maxConcurrentEnrichments: 16,
    earlyStopEnabled: true,
  },
};

export function createLatencyBudget(mode: ResearchMode, nowFn: () => number = () => Date.now()): LatencyBudgetManager {
  const config = BUDGETS[mode] ?? BUDGETS.deep_research;
  const overrides = readLatencyBudgetOverrides();
  const startedAt = nowFn();
  const stages = new Map<string, LatencyStageRecord>();
  const events: LatencyBudgetManager["events"] = [];
  const manager: LatencyBudgetManager = {
    ...config,
    ...overrides,
    startedAt,
    events,
    startStage(name) {
      const stageName = String(name);
      const record = { name: stageName, startedAt: nowFn(), budgetMs: manager.getStageBudget(stageName) };
      stages.set(stageName, record);
      events.push({ type: "latency_stage_started", data: { stage: stageName, budgetMs: record.budgetMs, elapsedMs: nowFn() - startedAt } });
      if (manager.remainingBudget() < Math.max(3_000, manager.totalBudgetMs * 0.1)) {
        events.push({ type: "latency_budget_warning", data: { stage: stageName, remainingBudgetMs: manager.remainingBudget() } });
      }
      return record;
    },
    endStage(name) {
      const stageName = String(name);
      const record = stages.get(stageName);
      if (!record) return null;
      record.completedAt = nowFn();
      record.elapsedMs = record.completedAt - record.startedAt;
      events.push({ type: "latency_stage_completed", data: { stage: stageName, elapsedMs: record.elapsedMs, budgetMs: record.budgetMs, remainingBudgetMs: manager.remainingBudget() } });
      if (record.budgetMs && record.elapsedMs > record.budgetMs) {
        events.push({ type: "latency_budget_warning", data: { stage: stageName, elapsedMs: record.elapsedMs, budgetMs: record.budgetMs } });
      }
      if (manager.shouldEarlyStop()) {
        events.push({ type: "latency_early_stop", data: { stage: stageName, remainingBudgetMs: manager.remainingBudget() } });
      }
      return record;
    },
    remainingBudget() {
      return Math.max(0, manager.totalBudgetMs - (nowFn() - startedAt));
    },
    shouldEarlyStop() {
      return manager.earlyStopEnabled && manager.remainingBudget() <= 0;
    },
    getStageBudget(name) {
      const stageName = String(name);
      if (stageName === "retrieval") return manager.retrievalBudgetMs;
      if (stageName === "enrichment") return manager.enrichmentBudgetMs;
      if (stageName === "source_usage") return manager.sourceUsageBudgetMs;
      if (stageName === "generation") return manager.generationBudgetMs;
      if (stageName === "repair") return manager.repairBudgetMs;
      return manager.providerCallTimeoutMs;
    },
    getCompressionLevel(stage) {
      if (process.env.LATENCY_COMPRESSION_DISABLED === "true") return 0;
      const stageName = String(stage);
      const exceededCount = [...stages.values()].filter((record) => record.budgetMs && typeof record.elapsedMs === "number" && record.elapsedMs > record.budgetMs).length;
      const retrievalElapsed = stages.get("retrieval")?.elapsedMs ?? 0;
      const remaining = manager.remainingBudget();
      let level = exceededCount;
      if (remaining < manager.totalBudgetMs * 0.35) level += 1;
      if (remaining < manager.totalBudgetMs * 0.15) level += 1;
      if (manager.mode === "fast_research" && stageName === "generation" && exceededCount > 0) level += 1;
      if (manager.mode === "fast_research" && stageName === "generation" && retrievalElapsed > manager.totalBudgetMs * 0.3) level += 1;
      return Math.min(3, Math.max(0, level));
    },
    shouldSkipOptionalStage(stage) {
      const stageName = String(stage);
      if (stageName === "repair" && manager.mode === "fast_research" && manager.getCompressionLevel("generation") > 0) return true;
      return manager.shouldEarlyStop();
    },
    remainingStageBudget(stage) {
      return Math.min(manager.getStageBudget(stage), manager.remainingBudget());
    },
  };
  return manager;
}

function readLatencyBudgetOverrides(): Partial<ResearchLatencyBudget> {
  const numberOverride = (name: string): number | undefined => {
    const raw = process.env[name];
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const overrides: Partial<ResearchLatencyBudget> = {};
  const set = (field: keyof ResearchLatencyBudget, envName: string) => {
    const value = numberOverride(envName);
    if (value !== undefined) (overrides as Record<string, unknown>)[field] = value;
  };
  set("totalBudgetMs", "RESEARCH_TOTAL_BUDGET_MS");
  set("retrievalBudgetMs", "RESEARCH_RETRIEVAL_BUDGET_MS");
  set("enrichmentBudgetMs", "RESEARCH_ENRICHMENT_BUDGET_MS");
  set("sourceUsageBudgetMs", "RESEARCH_SOURCE_USAGE_BUDGET_MS");
  set("generationBudgetMs", "RESEARCH_GENERATION_BUDGET_MS");
  set("providerCallTimeoutMs", "PROVIDER_CALL_TIMEOUT_MS");
  set("extractionTimeoutMs", "EXTRACTION_TIMEOUT_MS");
  return overrides;
}
