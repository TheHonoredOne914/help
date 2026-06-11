import type { ProviderName } from "../provider-types.js";
import type { ProviderLimitProfile } from "./provider-limit-types.js";

// Groq static limits (free/developer tier defaults)
const GROQ_MODEL_LIMITS: ProviderLimitProfile[] = [
  {
    providerName: "groq",
    model: "llama-3.1-8b-instant",
    rpm: 30, rpd: 14_400, tpm: 6_000, tpd: 500_000,
    safeInputBudget: 27_200, providerMaxInputTokens: 32_000,
    defaultTimeoutMs: 30_000, preferredTimeoutMs: 45_000,
    fallbackEligible: true,
  },
  {
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    rpm: 30, rpd: 1_000, tpm: 12_000, tpd: 100_000,
    safeInputBudget: 9_000, providerMaxInputTokens: 12_000,
    defaultTimeoutMs: 30_000, preferredTimeoutMs: 45_000,
    fallbackEligible: true,
  },
  {
    providerName: "groq",
    model: "openai/gpt-oss-120b",
    rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000,
    safeInputBudget: 5_000, providerMaxInputTokens: 8_000,
    defaultTimeoutMs: 30_000, preferredTimeoutMs: 45_000,
    fallbackEligible: true,
  },
  {
    providerName: "groq",
    model: "openai/gpt-oss-20b",
    rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000,
    safeInputBudget: 5_000, providerMaxInputTokens: 8_000,
    defaultTimeoutMs: 30_000, preferredTimeoutMs: 45_000,
    fallbackEligible: true,
  },
  {
    providerName: "groq",
    model: "qwen/qwen3-32b",
    rpm: 60, rpd: 1_000, tpm: 6_000, tpd: 500_000,
    safeInputBudget: 27_200, providerMaxInputTokens: 32_000,
    defaultTimeoutMs: 30_000, preferredTimeoutMs: 45_000,
    fallbackEligible: true,
  },
];

// Provider-level default profiles
const PROVIDER_DEFAULTS: Record<string, ProviderLimitProfile> = {
  nvidia: {
    providerName: "nvidia",
    // Kimi K2.6 has 9200 max input tokens
    safeInputBudget: 7_820,  // floor(9200 * 0.85)
    providerMaxInputTokens: 9_200,
    defaultTimeoutMs: 45_000,
    preferredTimeoutMs: 60_000,
    maxRetries: 2,
    backoffMs: 3_000,
    fallbackEligible: true,
    dynamic: false,
  },
  gemini: {
    providerName: "gemini",
    safeInputBudget: 170_000,
    providerMaxInputTokens: 200_000,
    defaultTimeoutMs: 60_000,
    preferredTimeoutMs: 90_000,
    fallbackEligible: true,
    dynamic: true,
  },
  openai: {
    providerName: "openai",
    safeInputBudget: 170_000,
    providerMaxInputTokens: 200_000,
    defaultTimeoutMs: 60_000,
    preferredTimeoutMs: 90_000,
    maxRetries: 2,
    backoffMs: 3_000,
    fallbackEligible: true,
    dynamic: true,
  },
  openrouter: {
    providerName: "openrouter",
    safeInputBudget: 27_200,
    providerMaxInputTokens: 32_000,
    defaultTimeoutMs: 45_000,
    preferredTimeoutMs: 60_000,
    maxRetries: 2,
    backoffMs: 3_000,
    fallbackEligible: true,
    dynamic: true,
  },
  github: {
    providerName: "github",
    safeInputBudget: 13_600,
    providerMaxInputTokens: 16_000,
    defaultTimeoutMs: 30_000,
    preferredTimeoutMs: 45_000,
    fallbackEligible: true,
    dynamic: false,
  },
  cerebras: {
    providerName: "cerebras",
    safeInputBudget: 6_800,  // 8000 * 0.85
    providerMaxInputTokens: 8_000,
    defaultTimeoutMs: 30_000,
    preferredTimeoutMs: 45_000,
    maxConcurrency: 3,
    maxRetries: 2,
    backoffMs: 2_000,
    fallbackEligible: true,
    dynamic: false,
  },
  groq: {
    providerName: "groq",
    safeInputBudget: 27_200,
    providerMaxInputTokens: 32_000,
    defaultTimeoutMs: 30_000,
    preferredTimeoutMs: 45_000,
    fallbackEligible: true,
    dynamic: false,
  },
};

const SAFE_INPUT_RATIO = 0.85;

export function getLimitProfile(providerName: ProviderName, model?: string): ProviderLimitProfile {
  // Check Groq model-specific limits first
  if (providerName === "groq" && model) {
    const groqMatch = GROQ_MODEL_LIMITS.find(p => p.model === model);
    if (groqMatch) return groqMatch;
  }

  // Fall back to provider-level defaults
  return PROVIDER_DEFAULTS[providerName] ?? {
    providerName,
    safeInputBudget: 27_200,
    providerMaxInputTokens: 32_000,
    defaultTimeoutMs: 30_000,
    preferredTimeoutMs: 45_000,
    fallbackEligible: true,
    dynamic: true,
  };
}

export function computeSafeInputBudget(providerMaxInputTokens: number, ratio: number = SAFE_INPUT_RATIO): number {
  return Math.floor(providerMaxInputTokens * ratio);
}

export function getAllLimitProfiles(): ProviderLimitProfile[] {
  return [
    ...GROQ_MODEL_LIMITS,
    ...Object.values(PROVIDER_DEFAULTS),
  ];
}
