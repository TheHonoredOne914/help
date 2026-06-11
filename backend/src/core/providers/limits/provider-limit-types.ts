import type { ProviderName } from "../provider-types.js";

export type ProviderStage =
  | "search"
  | "extraction"
  | "role_generation"
  | "synthesis"
  | "repair"
  | "final_generation"
  | "core_generation";

export type StageName = ProviderStage;

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  maxBackoffMs: number;
  jitter: boolean;
  retryableCodes: string[];
}

export interface ProviderLimitProfile {
  providerName: ProviderName;
  model?: string;
  rpm?: number;
  rpd?: number;
  tpm?: number;
  tpd?: number;
  itpm?: number;
  otpm?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  contextWindow?: number;
  safeInputBudget: number;
  providerMaxInputTokens: number;
  defaultTimeoutMs: number;
  preferredTimeoutMs: number;
  maxConcurrency?: number;
  maxRetries?: number;
  backoffMs?: number;
  fallbackEligible?: boolean;
  dynamic?: boolean;
}

export interface RateLimitHeaders {
  remainingRequests?: number;
  limitRequests?: number;
  resetRequests?: number;
  remainingTokens?: number;
  limitTokens?: number;
  resetTokens?: number;
  retryAfterMs?: number;
  retryAfterSeconds?: number;
}

export type ProviderBudgetCheck = {
  providerName: ProviderName;
  model: string;
  estimatedInputTokens: number;
  safeInputBudget: number;
  providerMaxInputTokens: number;
  wouldExceed: boolean;
  recommendation: "proceed" | "compress" | "skip";
};

