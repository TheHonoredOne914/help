import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

export const GITHUB_MODELS_BASE_URL = process.env.GITHUB_MODELS_BASE_URL ?? "https://models.github.ai/inference";

export class GithubProvider extends OpenAiCompatibleProvider {
  constructor(options: { apiKey?: string | null; baseUrl?: string; fetchFn?: typeof fetch } = {}) {
    const token = options.apiKey?.trim() ?? "";
    super({
      apiKey: token,
      baseUrl: options.baseUrl ?? GITHUB_MODELS_BASE_URL,
      providerName: "github",
      missingKeyMessage: "GitHub Models provider unavailable: missing token",
      fetchFn: options.fetchFn,
      extraHeaders: token ? {
        "X-GitHub-Models-Api-Key": token,
        "X-GitHub-Token": token,
      } : undefined,
    });
  }
}
