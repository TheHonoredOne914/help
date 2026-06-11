import OpenAI from "openai";
import { multiKeyFetch } from "./multi-key-fetch.js";

export const OPENAI_CATALOG = [
  { id: "gpt-4.1", name: "GPT-4.1", badge: "flagship", contextWindow: 1047576 },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", badge: "fast", contextWindow: 1047576 },
  { id: "gpt-4o", name: "GPT-4o", badge: "stable", contextWindow: 128000 },
];

export function isOpenAIEnabled(overrideKey?: string | null): boolean {
  return Boolean(overrideKey?.trim() || process.env.OPENAI_API_KEY);
}

export function getOpenAIClient(overrideKey?: string | null): OpenAI {
  const key = overrideKey?.trim() ?? process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("[openai-client] API key is required. Set OPENAI_API_KEY in .env or pass X-OpenAI-Api-Key header.");
  }
  return new OpenAI({
    apiKey: key,
    timeout: 60_000,
    maxRetries: 2,
    fetch: multiKeyFetch as any,
  });
}

export const openaiClient: OpenAI | null = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 2,
      fetch: multiKeyFetch as any,
    })
  : null;
