import Groq from "groq-sdk";

import { multiKeyFetch } from "./multi-key-fetch.js";

export const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY ?? "",
  fetch: multiKeyFetch as any,
});

export const groqEnabled = !!process.env.GROQ_API_KEY;

export function getGroqClient(overrideKey?: string | null): Groq {
  const key = (overrideKey ?? "").trim();
  if (key) return new Groq({ apiKey: key, fetch: multiKeyFetch as any });
  return groqClient;
}

export function isGroqEnabled(overrideKey?: string | null): boolean {
  return !!(overrideKey?.trim() || process.env.GROQ_API_KEY);
}
