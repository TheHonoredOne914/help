import OpenAI from "openai";

export function normalizeOllamaBase(url: string | undefined): string {
  const raw = (url ?? "").trim() || "http://localhost:11434";
  const stripped = raw.replace(/\/+$/, "");
  if (/\/v1$/.test(stripped)) return stripped;
  if (/\/api$/.test(stripped)) return stripped.replace(/\/api$/, "/v1");
  return stripped + "/v1";
}

export const ollamaClient = new OpenAI({
  baseURL: normalizeOllamaBase(process.env.OLLAMA_BASE_URL),
  apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
});

export const ollamaEnabled = !!process.env.OLLAMA_API_KEY;

export function getOllamaClient(overrideKey?: string | null, overrideBaseUrl?: string | null): OpenAI {
  const key = (overrideKey ?? "").trim();
  const base = (overrideBaseUrl ?? "").trim();
  if (key || base) {
    return new OpenAI({
      baseURL: normalizeOllamaBase(base || process.env.OLLAMA_BASE_URL),
      apiKey: key || process.env.OLLAMA_API_KEY || "ollama",
    });
  }
  return ollamaClient;
}

export function isOllamaEnabled(overrideKey?: string | null): boolean {
  return !!(overrideKey?.trim() || process.env.OLLAMA_API_KEY);
}
