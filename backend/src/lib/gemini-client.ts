// src/lib/gemini-client.ts
// ─────────────────────────────────────────────────────────────
// Gemini provider via Google's OpenAI-compatible endpoint.
// ─────────────────────────────────────────────────────────────
import OpenAI from "openai";
import { multiKeyFetch } from "./multi-key-fetch.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export function isGeminiEnabled(apiKey?: string | null): boolean {
  const key = apiKey?.trim() ?? process.env.GEMINI_API_KEY?.trim();
  return !!key;
}

export function getGeminiClient(apiKey?: string | null): OpenAI {
  const key = apiKey?.trim() ?? process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "[gemini-client] API key is required. " +
      "Set GEMINI_API_KEY in .env or pass X-Gemini-Api-Key header."
    );
  }
  return new OpenAI({ apiKey: key, baseURL: GEMINI_BASE_URL, fetch: multiKeyFetch as any });
}

/**
 * Hardcoded model catalog.
 * Google does not expose a reliable /models list on the free OpenAI-compat endpoint.
 */
export const GEMINI_MODELS = [
  { id: "gemini-2.5-pro",              name: "Gemini 2.5 Pro",         badge: "flagship", contextWindow: 2097152 },
  { id: "gemini-2.5-flash",            name: "Gemini 2.5 Flash",        badge: "fast",     contextWindow: 1048576 },
  { id: "gemini-2.5-flash-lite",       name: "Gemini 2.5 Flash-Lite",   badge: "fast",     contextWindow: 1048576 },
  { id: "gemini-2.0-flash",            name: "Gemini 2.0 Flash",        badge: "stable",   contextWindow: 1048576 },
  { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", badge: "reason", contextWindow: 1048576 },
] as const;

export type GeminiModelId = typeof GEMINI_MODELS[number]["id"];

/** The cheapest Gemini model — used for verification to save quota. */
export const GEMINI_VERIFY_MODEL = "gemini-2.5-flash";
