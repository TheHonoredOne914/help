import type { ResearchMode } from "../config/research-mode.js";
import type { ProviderFailureReport, ProviderErrorCode } from "./provider-errors.js";
import type { ProviderName } from "./provider-types.js";

export interface ProviderRunRecord {
  providerName: ProviderName;
  failures: number;
  rateLimitedUntil?: number;
  requestTooLargeCount: number;
  jsonFailureCount: number;
  timeoutCount: number;
  lastErrorCode?: ProviderErrorCode;
  invalidModels?: string[];
  blockedProvider?: boolean;
  billingCreditsBlocked?: boolean;
  invalidKeyBlocked?: boolean;
  modelCooldowns?: Record<string, number>;
  requestTooLargePrompts?: Record<string, string[]>;
}

export interface ProviderRunSafeMetadata {
  providerName: ProviderName;
  failures: number;
  cooledDown: boolean;
  cooldownRemainingMs?: number;
  requestTooLargeCount: number;
  jsonFailureCount: number;
  timeoutCount?: number;
  lastErrorCode?: ProviderErrorCode;
  invalidModels?: string[];
  blockedProvider?: boolean;
  billingCreditsBlocked?: boolean;
  invalidKeyBlocked?: boolean;
}

export interface ProviderRunState {
  get(providerName: ProviderName): ProviderRunRecord | undefined;
  recordProviderFailure(providerName: ProviderName, model: string | undefined, stage: "core_generation" | "source_usage", failure: Pick<ProviderFailureReport, "code" | "retryAfterMs" | "status">, context?: { promptFingerprint?: string }): ProviderRunRecord;
  recordFailure(providerName: ProviderName, failure: Pick<ProviderFailureReport, "code" | "retryAfterMs" | "status">, context?: { model?: string; promptFingerprint?: string }): ProviderRunRecord;
  recordInvalidJson(providerName: ProviderName): ProviderRunRecord;
  isCooledDown(providerName: ProviderName): boolean;
  isModelInvalid(providerName: ProviderName, model: string): boolean;
  shouldSkipModel(providerName: ProviderName, model: string): boolean;
  shouldSkipProvider(providerName: ProviderName, stage: "core_generation" | "source_usage", mode: ResearchMode): boolean;
  isProviderBlocked(providerName: ProviderName): boolean;
  shouldRetrySamePrompt(providerName: ProviderName, model?: string, promptFingerprint?: string): boolean;
  getSafeMetadata(providerName: ProviderName): ProviderRunSafeMetadata | undefined;
}

export function createProviderRunState(nowFn: () => number = () => Date.now()): ProviderRunState {
  const records = new Map<ProviderName, ProviderRunRecord>();
  const ensure = (providerName: ProviderName): ProviderRunRecord => {
    const existing = records.get(providerName);
    if (existing) return existing;
    const record: ProviderRunRecord = { providerName, failures: 0, requestTooLargeCount: 0, jsonFailureCount: 0, timeoutCount: 0 };
    records.set(providerName, record);
    return record;
  };

  return {
    get: (providerName) => records.get(providerName),
    recordProviderFailure(providerName, model, _stage, failure, context) {
      return this.recordFailure(providerName, failure, { model, promptFingerprint: context?.promptFingerprint });
    },
    recordFailure(providerName, failure, context) {
      const record = ensure(providerName);
      record.failures += 1;
      record.lastErrorCode = failure.code;
      if (failure.code === "invalid_key") {
        record.invalidKeyBlocked = true;
        record.blockedProvider = true;
      }
      if (failure.code === "billing_credits") {
        record.billingCreditsBlocked = true;
        record.blockedProvider = true;
      }
      if (failure.code === "rate_limited") {
        record.rateLimitedUntil = nowFn() + (failure.retryAfterMs ?? 30_000);
        record.blockedProvider = true;
      }
      if (failure.code === "request_too_large") {
        record.requestTooLargeCount += 1;
        if (context?.model && context.promptFingerprint) {
          const prompts = record.requestTooLargePrompts ?? {};
          const key = context.model;
          prompts[key] = [...new Set([...(prompts[key] ?? []), context.promptFingerprint])];
          record.requestTooLargePrompts = prompts;
        }
      }
      if (failure.code === "invalid_model" && context?.model) {
        record.invalidModels = [...new Set([...(record.invalidModels ?? []), context.model])];
      }
      if (failure.code === "invalid_model" && !context?.model) {
        record.blockedProvider = true;
      }
      if (failure.code === "timeout" && context?.model) {
        const cooldowns = record.modelCooldowns ?? {};
        cooldowns[context.model] = nowFn() + (failure.retryAfterMs ?? 30_000);
        record.modelCooldowns = cooldowns;
      }
      if (failure.code === "network_error" || failure.code === "timeout") {
        record.timeoutCount += 1;
      }
      return record;
    },
    recordInvalidJson(providerName) {
      const record = ensure(providerName);
      record.failures += 1;
      record.jsonFailureCount += 1;
      record.lastErrorCode = "unknown";
      return record;
    },
    isCooledDown(providerName) {
      const until = records.get(providerName)?.rateLimitedUntil;
      return typeof until === "number" && until > nowFn();
    },
    isModelInvalid(providerName, model) {
      return records.get(providerName)?.invalidModels?.includes(model) ?? false;
    },
    shouldSkipModel(providerName, model) {
      const record = records.get(providerName);
      if (!record) return false;
      if (record.invalidModels?.includes(model)) return true;
      const modelCooldownUntil = record.modelCooldowns?.[model];
      return typeof modelCooldownUntil === "number" && modelCooldownUntil > nowFn();
    },
    shouldSkipProvider(providerName, stage, mode) {
      const record = records.get(providerName);
      if (!record) return false;
      if (record.blockedProvider || record.invalidKeyBlocked || record.billingCreditsBlocked) return true;
      if (this.isCooledDown(providerName)) return true;
      if (record.jsonFailureCount >= 2 && stage === "source_usage") return true;
      // Skip provider after 2 timeouts in same run for core_generation
      if (record.timeoutCount >= 2 && stage === "core_generation") return true;
      // Skip after repeated failures in every research mode; strict modes should not keep burning retries on a broken provider.
      if (record.failures >= 3) return true;
      return false;
    },
    isProviderBlocked(providerName) {
      const record = records.get(providerName);
      return Boolean(record?.blockedProvider || record?.invalidKeyBlocked || record?.billingCreditsBlocked || this.isCooledDown(providerName));
    },
    shouldRetrySamePrompt(providerName, model, promptFingerprint) {
      const record = records.get(providerName);
      if (!record) return true;
      if (model && promptFingerprint) {
        return !(record.requestTooLargePrompts?.[model] ?? []).includes(promptFingerprint);
      }
      return (record.requestTooLargeCount ?? 0) === 0;
    },
    getSafeMetadata(providerName) {
      const record = records.get(providerName);
      if (!record) return undefined;
      const providerCooldownRemainingMs = Math.max(0, (record.rateLimitedUntil ?? 0) - nowFn());
      const modelCooldownRemainingMs = Math.max(0, ...Object.values(record.modelCooldowns ?? {}).map((until) => until - nowFn()));
      const cooldownRemainingMs = Math.max(providerCooldownRemainingMs, modelCooldownRemainingMs);
      return {
        providerName,
        failures: record.failures,
        cooledDown: cooldownRemainingMs > 0,
        ...(cooldownRemainingMs > 0 ? { cooldownRemainingMs } : {}),
        requestTooLargeCount: record.requestTooLargeCount,
        jsonFailureCount: record.jsonFailureCount,
        ...(record.timeoutCount > 0 ? { timeoutCount: record.timeoutCount } : {}),
        lastErrorCode: record.lastErrorCode,
        ...(record.invalidModels?.length ? { invalidModels: record.invalidModels } : {}),
        ...(record.blockedProvider ? { blockedProvider: true } : {}),
        ...(record.billingCreditsBlocked ? { billingCreditsBlocked: true } : {}),
        ...(record.invalidKeyBlocked ? { invalidKeyBlocked: true } : {}),
      };
    },
  };
}
