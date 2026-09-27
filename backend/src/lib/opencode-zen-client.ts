import OpenAI from "openai";
import { multiKeyFetch } from "./multi-key-fetch.js";
import { OPENCODE_ZEN_BASE_URL } from "../core/providers/opencode-zen-provider.js";
import { primaryApiKey } from "./normalize-keys.js";

export { OPENCODE_ZEN_BASE_URL };

export function resolveOpenCodeApiKey(overrideKey?: string | null): string | undefined {
  return primaryApiKey(
    overrideKey
      ?? process.env.OPENCODE_API_KEY
      ?? process.env.OPENCODE_ZEN_API_KEY
      ?? undefined,
  );
}

export function isOpenCodeZenEnabled(overrideKey?: string | null): boolean {
  return Boolean(resolveOpenCodeApiKey(overrideKey));
}

export function getOpenCodeZenClient(overrideKey?: string | null): OpenAI {
  const apiKey = resolveOpenCodeApiKey(overrideKey);
  if (!apiKey) {
    throw new Error(
      "OPENCODE_API_KEY is not configured. Set OPENCODE_API_KEY (or OPENCODE_ZEN_API_KEY) in your environment.",
    );
  }
  return new OpenAI({
    baseURL: OPENCODE_ZEN_BASE_URL,
    apiKey,
    fetch: multiKeyFetch as any,
  });
}
