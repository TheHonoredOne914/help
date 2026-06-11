// src/lib/openrouter-client.ts
// ─────────────────────────────────────────────────────────────
// OpenRouter provider — proxies 100+ models via OpenAI-compat API.
// ─────────────────────────────────────────────────────────────
import OpenAI from "openai";
import { multiKeyFetch } from "./multi-key-fetch.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Only show models from these org prefixes in the selector.
// This prevents flooding the UI with hundreds of obscure models.
export const OPENROUTER_ALLOWED_ORGS = [
  "openai",
  "anthropic",
  "google",
  "meta-llama",
  "mistralai",
  "deepseek",
  "qwen",
  "nvidia",
  "cohere",
  "microsoft",
];

export function isOpenRouterEnabled(apiKey?: string | null): boolean {
  const key = apiKey?.trim() ?? process.env.OPENROUTER_API_KEY?.trim();
  return !!key;
}

export function getOpenRouterClient(apiKey?: string | null): OpenAI {
  const key = apiKey?.trim() ?? process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "[openrouter-client] API key is required. " +
      "Set OPENROUTER_API_KEY in .env or pass X-OpenRouter-Api-Key header."
    );
  }
  return new OpenAI({
    apiKey: key,
    baseURL: OPENROUTER_BASE_URL,
    fetch: multiKeyFetch as any,
    defaultHeaders: {
      "HTTP-Referer": process.env.APP_URL ?? "https://bestdel.replit.app",
      "X-Title": "BestDel MUN Research Engine",
    },
  });
}
