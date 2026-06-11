import OpenAI from "openai";
import { multiKeyFetch } from "./multi-key-fetch.js";

export const GITHUB_MODELS_BASE_URL = process.env.GITHUB_MODELS_BASE_URL ?? "https://models.github.ai/inference";

export function isGithubModelsEnabled(overrideToken?: string | null): boolean {
  return Boolean(overrideToken?.trim() || process.env.GITHUB_MODELS_API_KEY || process.env.GITHUB_TOKEN);
}

export function getGithubModelsClient(overrideToken?: string | null): OpenAI {
  const token = overrideToken?.trim() || process.env.GITHUB_MODELS_API_KEY || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GitHub Models token is not configured. Set GITHUB_MODELS_API_KEY or GITHUB_TOKEN, or pass X-GitHub-Models-Api-Key.");
  }
  return new OpenAI({
    baseURL: GITHUB_MODELS_BASE_URL,
    apiKey: token,
    fetch: multiKeyFetch as any,
    defaultHeaders: {
      "X-GitHub-Models-Api-Key": token,
      "X-GitHub-Token": token,
    },
  });
}
