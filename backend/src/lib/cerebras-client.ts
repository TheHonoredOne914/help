import OpenAI from "openai";
import { CEREBRAS_CATALOG } from "../core/providers/catalog/index.js";
import { multiKeyFetch } from "./multi-key-fetch.js";

export const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

export { CEREBRAS_CATALOG };

export function isCerebrasEnabled(overrideKey?: string | null): boolean {
  return Boolean(overrideKey?.trim() || process.env.CEREBRAS_API_KEY);
}

export function getCerebrasClient(overrideKey?: string | null): OpenAI {
  const key = overrideKey?.trim() ?? process.env.CEREBRAS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "[cerebras-client] API key is required. Set CEREBRAS_API_KEY in .env or pass X-Cerebras-Api-Key header."
    );
  }
  return new OpenAI({
    apiKey: key,
    baseURL: CEREBRAS_BASE_URL,
    timeout: 30_000,
    maxRetries: 2,
    fetch: multiKeyFetch as any,
  });
}

export const cerebrasClient: OpenAI | null = process.env.CEREBRAS_API_KEY
  ? new OpenAI({
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: CEREBRAS_BASE_URL,
      timeout: 30_000,
      maxRetries: 2,
      fetch: multiKeyFetch as any,
    })
  : null;
