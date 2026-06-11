export interface ModelCapabilityProfile {
  modelId: string;
  provider: string;
  maxContextTokens: number;
  maxOutputTokens: number;
  evidenceTokenBudget: number;
  priorContextTokenBudget: number;
  instructionOverheadEstimate: number;
  isSmallModel: boolean;
}

export const MODEL_CAPABILITY_PROFILES: Record<string, ModelCapabilityProfile> = {
  "llama-3.1-8b-instant": {
    modelId: "llama-3.1-8b-instant",
    provider: "groq",
    maxContextTokens: 8192,
    maxOutputTokens: 3500,
    evidenceTokenBudget: 1800,
    priorContextTokenBudget: 600,
    instructionOverheadEstimate: 1200,
    isSmallModel: true,
  },
  "llama-3.3-70b-versatile": {
    modelId: "llama-3.3-70b-versatile",
    provider: "groq",
    maxContextTokens: 32768,
    maxOutputTokens: 6000,
    evidenceTokenBudget: 8000,
    priorContextTokenBudget: 3000,
    instructionOverheadEstimate: 1500,
    isSmallModel: false,
  },
  "gemini-2.5-flash": {
    modelId: "gemini-2.5-flash",
    provider: "gemini",
    maxContextTokens: 131072,
    maxOutputTokens: 8000,
    evidenceTokenBudget: 16000,
    priorContextTokenBudget: 6000,
    instructionOverheadEstimate: 2000,
    isSmallModel: false,
  },
  "gemini-2.0-flash": {
    modelId: "gemini-2.0-flash",
    provider: "gemini",
    maxContextTokens: 65536,
    maxOutputTokens: 7000,
    evidenceTokenBudget: 12000,
    priorContextTokenBudget: 4000,
    instructionOverheadEstimate: 1800,
    isSmallModel: false,
  },
  "deepseek-chat": {
    modelId: "deepseek-chat",
    provider: "openrouter",
    maxContextTokens: 65536,
    maxOutputTokens: 7000,
    evidenceTokenBudget: 12000,
    priorContextTokenBudget: 4000,
    instructionOverheadEstimate: 1800,
    isSmallModel: false,
  },
};

export function resolveModelProfile(modelId: string): ModelCapabilityProfile {
  const stripped = modelId.includes("/") ? modelId.split("/").slice(1).join("/") : modelId;
  const direct = MODEL_CAPABILITY_PROFILES[modelId] ?? MODEL_CAPABILITY_PROFILES[stripped];
  if (direct) return direct;
  const lower = modelId.toLowerCase();
  const isSmallModel = /\b(?:3b|7b|8b)\b/.test(lower)
    || /(^|[-_])8b([-_]|$)/i.test(lower)
    || /^8b-instant\b/i.test(lower)
    || lower.includes("nano");
  return {
    modelId,
    provider: "unknown",
    maxContextTokens: isSmallModel ? 8192 : 16000,
    maxOutputTokens: isSmallModel ? 3000 : 4000,
    evidenceTokenBudget: isSmallModel ? 1800 : 5000,
    priorContextTokenBudget: isSmallModel ? 600 : 2000,
    instructionOverheadEstimate: 1500,
    isSmallModel,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}

export function truncateToTokenBudget(text: string, tokenBudget: number): string {
  const charBudget = Math.floor(tokenBudget * 3.8);
  if (text.length <= charBudget) return text;
  return text.slice(0, charBudget) + "\n[TRUNCATED TO TOKEN BUDGET]";
}
